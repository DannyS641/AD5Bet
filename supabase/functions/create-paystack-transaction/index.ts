// Supabase Edge Function: create-paystack-transaction
// Requires PAYSTACK_SECRET_KEY to be set in Supabase secrets.

const PAYSTACK_URL = "https://api.paystack.co/transaction/initialize";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { amount, email, metadata, callbackUrl } = await req.json();

    if (!amount || !email) {
      return new Response(
        JSON.stringify({ error: "Missing amount or email." }),
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
