// Supabase Edge Function: create-withdrawal-request
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();

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

    const authHeader =
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseServiceKey,
      },
    });

    if (!userResponse.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPayload = await userResponse.json();
    const user = userPayload?.user ?? userPayload;
    if (!user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, bankCode, bankName, accountNumber } = await req.json();
    if (!amount || !bankCode || !bankName || !accountNumber) {
      return new Response(JSON.stringify({ error: "Missing withdrawal details." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountValue = Number(amount ?? 0);
    if (Number.isNaN(amountValue) || amountValue < 100) {
      return new Response(JSON.stringify({ error: "Minimum withdrawal is 100." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolveResponse = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
        accountNumber,
      )}&bank_code=${encodeURIComponent(bankCode)}`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY") ?? ""}`,
          "Content-Type": "application/json",
        },
      },
    );

    const resolvePayload = await resolveResponse.json();
    if (!resolveResponse.ok || !resolvePayload.status) {
      return new Response(JSON.stringify({ error: resolvePayload?.message ?? "Paystack error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountName = resolvePayload?.data?.account_name ?? "";

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=full_name`,
      {
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!profileResponse.ok) {
      return new Response(JSON.stringify({ error: "Unable to verify profile." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileData = await profileResponse.json();
    const profileName = profileData?.[0]?.full_name ?? "";

    if (!profileName || !accountName) {
      return new Response(JSON.stringify({ error: "Account name verification failed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalizeName(profileName) !== normalizeName(accountName)) {
      return new Response(
        JSON.stringify({
          error:
            "Account name must match your profile name. Update your profile name to proceed.",
          accountName,
          profileName,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/request_withdrawal`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: user.id,
        p_amount: amountValue,
        p_currency: "NGN",
        p_bank_name: bankName,
        p_bank_code: bankCode,
        p_account_number: accountNumber,
        p_account_name: accountName,
      }),
    });

    if (!rpcResponse.ok) {
      const rpcError = await rpcResponse.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: rpcError?.message ?? "Withdrawal failed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcPayload = await rpcResponse.json();
    return new Response(
      JSON.stringify({
        status: "pending",
        accountName,
        balance: rpcPayload?.balance ?? null,
        requestId: rpcPayload?.request_id ?? null,
      }),
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
