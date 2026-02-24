// Supabase Edge Function: paystack-direct-debit-init
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

import { createClient } from "jsr:@supabase/supabase-js@2.49.1";

const PAYSTACK_INIT_URL = "https://api.paystack.co/customer/authorization/initialize";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let authClient: ReturnType<typeof createClient> | null = null;
let adminClient: ReturnType<typeof createClient> | null = null;

const getAuthClient = () => {
  if (!authClient) {
    authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }
  return authClient;
};

const getAdminClient = () => {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !paystackSecret) {
      return new Response(JSON.stringify({ error: "Server misconfigured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader =
      req.headers.get("Authorization") ??
      req.headers.get("authorization") ??
      "";
    const token = authHeader.replace(/bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await getAuthClient().auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { callbackUrl } = await req.json().catch(() => ({}));
    const email = userData.user.email ?? "";

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing user email." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Record<string, unknown> = {
      email,
      channel: "direct_debit",
    };

    if (typeof callbackUrl === "string" && callbackUrl.length > 0) {
      const normalized = callbackUrl.trim();
      if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
        payload.callback_url = normalized;
      }
    }

    const response = await fetch(PAYSTACK_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data?.status) {
      return new Response(
        JSON.stringify({ error: data?.message ?? "Paystack error" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const redirectUrl = data?.data?.redirect_url ?? null;
    const reference = data?.data?.reference ?? null;

    if (!redirectUrl || !reference) {
      return new Response(JSON.stringify({ error: "Missing Paystack redirect." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await getAdminClient()
      .from("auto_topup_settings")
      .upsert(
        {
          user_id: userData.user.id,
          authorization_email: email,
          authorization_reference: reference,
          authorization_status: "pending",
          authorization_code: null,
          authorization_created_at: now,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ redirectUrl, reference }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage ?? "Paystack error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
