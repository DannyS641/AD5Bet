// Supabase Edge Function: auto-topup-check
// Requires PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

import { createClient } from "jsr:@supabase/supabase-js@2.49.1";

const PAYSTACK_CHARGE_URL = "https://api.paystack.co/transaction/charge_authorization";
const PAYSTACK_VERIFY_AUTH_URL = "https://api.paystack.co/customer/authorization/verify";

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

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === "string" ? Number(value) : Number(value ?? fallback);
  return Number.isNaN(numeric) ? fallback : numeric;
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

    const userId = userData.user.id;

    const { data: settings, error: settingsError } = await getAdminClient()
      .from("auto_topup_settings")
      .select(
        "enabled, threshold, topup_amount, currency, authorization_status, authorization_code, authorization_reference, authorization_email, authorization_active_at, authorization_created_at, last_attempt_at, cooldown_minutes",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) {
      return new Response(JSON.stringify({ error: settingsError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!settings) {
      return new Response(JSON.stringify({ status: "not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!settings.enabled) {
      return new Response(JSON.stringify({ status: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    let authorizationStatus = String(settings.authorization_status ?? "none").toLowerCase();
    let authorizationCode = settings.authorization_code ?? null;
    const authorizationReference = settings.authorization_reference ?? null;

    if ((authorizationStatus !== "active" || !authorizationCode) && authorizationReference) {
      const verifyResponse = await fetch(
        `${PAYSTACK_VERIFY_AUTH_URL}/${encodeURIComponent(authorizationReference)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
        },
      );

      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (verifyResponse.ok && verifyPayload?.status && verifyPayload?.data) {
        const authData = verifyPayload.data;
        const isActive = Boolean(authData.active);
        authorizationCode = authData.authorization_code ?? authorizationCode ?? null;
        authorizationStatus = isActive ? "active" : "created";

        const updatePayload: Record<string, unknown> = {
          authorization_status: authorizationStatus,
          authorization_code: authorizationCode,
          authorization_email:
            authData.customer?.email ?? settings.authorization_email ?? userData.user.email ?? null,
          updated_at: nowIso,
        };

        const activatedNow = authorizationStatus === "active" && !settings.authorization_active_at;
        if (activatedNow) {
          updatePayload.authorization_active_at = nowIso;
        }

        if (!settings.authorization_created_at) {
          updatePayload.authorization_created_at = nowIso;
        }

        await getAdminClient()
          .from("auto_topup_settings")
          .update(updatePayload)
          .eq("user_id", userId);

        if (activatedNow) {
          return new Response(JSON.stringify({ status: "mandate_wait" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (authorizationStatus !== "active" || !authorizationCode) {
      const statusLabel = authorizationReference ? "mandate_pending" : "needs_mandate";
      return new Response(JSON.stringify({ status: statusLabel }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (settings.authorization_active_at) {
      const activeAtMs = new Date(settings.authorization_active_at).getTime();
      if (!Number.isNaN(activeAtMs)) {
        const hoursSinceActive = (Date.now() - activeAtMs) / (1000 * 60 * 60);
        if (hoursSinceActive < 6) {
          return new Response(JSON.stringify({ status: "mandate_wait" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { data: wallet, error: walletError } = await getAdminClient()
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError) {
      return new Response(JSON.stringify({ error: walletError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const balance = toNumber(wallet?.balance ?? 0, 0);
    const threshold = toNumber(settings.threshold, 0);
    const topupAmount = toNumber(settings.topup_amount, 0);

    if (!threshold || !topupAmount) {
      return new Response(JSON.stringify({ status: "invalid_settings" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (balance > threshold) {
      return new Response(
        JSON.stringify({ status: "balance_ok", balance, threshold }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cooldownMinutes = Math.max(0, toNumber(settings.cooldown_minutes, 60));
    if (settings.last_attempt_at) {
      const lastAttemptAt = new Date(settings.last_attempt_at).getTime();
      if (!Number.isNaN(lastAttemptAt)) {
        const elapsedMs = Date.now() - lastAttemptAt;
        if (elapsedMs < cooldownMinutes * 60 * 1000) {
          return new Response(
            JSON.stringify({ status: "cooldown" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const { data: pendingAttempt } = await getAdminClient()
      .from("auto_topup_attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "processing")
      .order("initiated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingAttempt) {
      return new Response(JSON.stringify({ status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountKobo = Math.round(topupAmount * 100);
    if (!amountKobo) {
      return new Response(JSON.stringify({ status: "invalid_amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = (settings.currency ?? "NGN").toUpperCase();
    const email = settings.authorization_email ?? userData.user.email ?? "";

    if (!email) {
      return new Response(JSON.stringify({ status: "missing_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(PAYSTACK_CHARGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorization_code: settings.authorization_code,
        email,
        amount: String(amountKobo),
        currency,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.status) {
      return new Response(
        JSON.stringify({ error: payload?.message ?? "Paystack error" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const paystackData = payload?.data ?? {};
    const reference = paystackData.reference ?? null;
    const chargeStatus = String(paystackData.status ?? "processing").toLowerCase();

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing Paystack reference." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const attemptStatus = chargeStatus === "success" ? "success" : "processing";

    const { error: insertError } = await getAdminClient().from("auto_topup_attempts").insert({
      user_id: userId,
      reference,
      amount: topupAmount,
      currency,
      status: attemptStatus,
      provider: "paystack",
      completed_at: attemptStatus === "success" ? now : null,
    });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await getAdminClient()
      .from("auto_topup_settings")
      .update({
        last_attempt_at: now,
        last_attempt_status: attemptStatus,
        last_charge_reference: reference,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let walletBalance: number | null = null;

    if (attemptStatus === "success") {
      const creditResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/credit_wallet_from_payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_reference: reference,
          p_amount: topupAmount,
          p_currency: currency,
        }),
      });

      if (creditResponse.ok) {
        const balanceRaw = await creditResponse.json();
        walletBalance = balanceRaw === null || balanceRaw === undefined ? null : Number(balanceRaw);
      }
    }

    return new Response(
      JSON.stringify({
        status: "initiated",
        chargeStatus,
        reference,
        walletBalance,
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
