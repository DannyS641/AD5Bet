// Supabase Edge Function: paystack-direct-debit-webhook
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

import { createClient } from "jsr:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let adminClient: ReturnType<typeof createClient> | null = null;

const getAdminClient = () => {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
};

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const signPayload = async (payload: string, secret: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey || !paystackSecret) {
      return new Response(JSON.stringify({ error: "Server misconfigured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("x-paystack-signature") ?? "";
    const bodyText = await req.text();
    const expectedSignature = await signPayload(bodyText, paystackSecret);

    if (!signature || !safeEqual(signature, expectedSignature)) {
      return new Response(JSON.stringify({ error: "Invalid signature." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(bodyText);
    const eventType = String(event?.event ?? "").toLowerCase();
    const data = event?.data ?? {};

    if (
      eventType === "direct_debit.authorization.created" ||
      eventType === "direct_debit.authorization.active"
    ) {
      const email = data?.customer?.email ?? "";
      const authorizationCode = data?.authorization_code ?? "";
      if (!email || !authorizationCode) {
        return new Response("ok", { headers: corsHeaders });
      }

      const { data: userResult } = await getAdminClient().auth.admin.getUserByEmail(email);
      const userId = userResult?.user?.id;
      if (!userId) {
        return new Response("ok", { headers: corsHeaders });
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        user_id: userId,
        authorization_email: email,
        authorization_code: authorizationCode,
        authorization_status: eventType.endsWith("active") ? "active" : "created",
        updated_at: now,
      };

      if (eventType.endsWith("created")) {
        updatePayload.authorization_created_at = now;
      }

      if (eventType.endsWith("active")) {
        updatePayload.authorization_active_at = now;
      }

      await getAdminClient().from("auto_topup_settings").upsert(updatePayload, { onConflict: "user_id" });

      return new Response("ok", { headers: corsHeaders });
    }

    if (eventType === "charge.success" || eventType === "charge.failed") {
      const channel = String(data?.channel ?? "").toLowerCase();
      if (channel !== "direct_debit") {
        return new Response("ok", { headers: corsHeaders });
      }

      const reference = data?.reference ?? "";
      if (!reference) {
        return new Response("ok", { headers: corsHeaders });
      }

      const { data: attempt } = await getAdminClient()
        .from("auto_topup_attempts")
        .select("id, user_id, amount, currency")
        .eq("reference", reference)
        .maybeSingle();

      if (!attempt) {
        return new Response("ok", { headers: corsHeaders });
      }

      const now = new Date().toISOString();
      const nextStatus = eventType === "charge.success" ? "success" : "failed";
      const errorMessage =
        eventType === "charge.failed"
          ? String(data?.gateway_response ?? data?.message ?? "Charge failed")
          : null;

      await getAdminClient()
        .from("auto_topup_attempts")
        .update({
          status: nextStatus,
          completed_at: now,
          error: errorMessage,
        })
        .eq("id", attempt.id);

      await getAdminClient()
        .from("auto_topup_settings")
        .update({
          last_attempt_at: now,
          last_attempt_status: nextStatus,
          last_charge_reference: reference,
          updated_at: now,
        })
        .eq("user_id", attempt.user_id);

      if (eventType === "charge.success") {
        const amountKobo = Number(data?.amount ?? 0);
        const currency = data?.currency ?? attempt.currency ?? "NGN";
        const amountValue = Number.isNaN(amountKobo) || amountKobo <= 0
          ? Number(attempt.amount ?? 0)
          : amountKobo / 100;

        await fetch(`${supabaseUrl}/rest/v1/rpc/credit_wallet_from_payment`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            apikey: supabaseServiceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: attempt.user_id,
            p_reference: reference,
            p_amount: amountValue,
            p_currency: currency,
          }),
        });
      }

      return new Response("ok", { headers: corsHeaders });
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage ?? "Webhook error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
