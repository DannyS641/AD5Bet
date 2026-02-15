// Supabase Edge Function: create-paystack-transaction
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, and SUPABASE_ANON_KEY to be set in Supabase secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const PAYSTACK_URL = "https://api.paystack.co/transaction/initialize";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
let supabase: ReturnType<typeof createClient> | null = null;

const getSupabaseClient = () => {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }
  return supabase;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: userData, error: userError } = await getSupabaseClient().auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { amount, callbackUrl } = await req.json();
    const email = userData.user.email;
    const metadata = { userId: userData.user.id };

    if (!amount || amount <= 0 || !email || typeof callbackUrl !== "string" || !callbackUrl.length) {
      return new Response(
        JSON.stringify({ error: "Missing amount, email, or callback URL." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.info("Initializing Paystack transaction", {
      amount,
      email,
      callbackUrl,
    });

    const response = await fetch(PAYSTACK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        email,
        metadata,
        callback_url: callbackUrl,
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.status) {
      return new Response(
        JSON.stringify({ error: payload?.message ?? "Paystack error" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        authorizationUrl: payload.data.authorization_url,
        reference: payload.data.reference,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage ?? "Paystack error" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
