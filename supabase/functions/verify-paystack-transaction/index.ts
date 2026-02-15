// Supabase Edge Function: verify-paystack-transaction
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reference } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.info("Verifying Paystack transaction", { reference });

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
    });

    const payload = await response.json();
    if (!response.ok || !payload.status) {
      return new Response(JSON.stringify({ error: payload?.message ?? "Paystack error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = payload?.data ?? {};
    if (data.status !== "success") {
      return new Response(JSON.stringify({ error: "Payment not successful." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = data.metadata ?? {};
    const userId = metadata.userId ?? metadata.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing user metadata." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data.reference) {
      return new Response(JSON.stringify({ error: "Missing transaction reference." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountKobo = Number(data.amount ?? 0);
    if (!amountKobo || Number.isNaN(amountKobo)) {
      return new Response(JSON.stringify({ error: "Invalid amount." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = data.currency ?? "NGN";
    const amountValue = amountKobo / 100;

    const { data: walletBalanceRaw, error: walletError } = await supabaseAdmin.rpc(
      "credit_wallet_from_payment",
      {
        p_user_id: userId,
        p_reference: data.reference,
        p_amount: amountValue,
        p_currency: currency,
      },
    );

    if (walletError) {
      return new Response(JSON.stringify({ error: walletError.message ?? "Wallet update failed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const walletBalance = walletBalanceRaw === null || walletBalanceRaw === undefined
      ? null
      : Number(walletBalanceRaw);

    return new Response(
      JSON.stringify({
        status: data.status,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        paidAt: data.paid_at,
        walletBalance,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage ?? "Paystack error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
