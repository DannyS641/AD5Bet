// Supabase Edge Function: odds-scores-sync
// Requires ODDS_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to be set in Supabase secrets.

import { createClient } from "jsr:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const oddsApiKey = Deno.env.get("ODDS_API_KEY") ?? "";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const parseScore = (scores: Array<{ name: string; score: string | null }> | null | undefined, team: string) => {
  if (!scores || !team) return null;
  const entry = scores.find((item) => item.name?.toLowerCase() === team.toLowerCase());
  const value = Number(entry?.score ?? "");
  return Number.isNaN(value) ? null : value;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "odds-scores-sync" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey || !oddsApiKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/bearer\s+/i, "").trim();
    if (!token || token !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sportKey = String(body?.sportKey ?? "soccer_epl");
    const daysFrom = Number(body?.daysFrom ?? 1);
    const dateFormat = String(body?.dateFormat ?? "iso");
    const settle = Boolean(body?.settle ?? true);
    const eventIds = Array.isArray(body?.eventIds) ? body.eventIds.map(String) : null;

    const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/scores`);
    url.searchParams.set("apiKey", oddsApiKey);
    url.searchParams.set("daysFrom", String(daysFrom));
    url.searchParams.set("dateFormat", dateFormat);

    const response = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
    });

    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: payload?.message ?? "Odds API error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events = Array.isArray(payload) ? payload : [];
    const filtered = eventIds ? events.filter((event) => eventIds.includes(event.id)) : events;

    const rows = filtered.map((event: any) => {
      const scores = event?.scores ?? null;
      const homeTeam = String(event?.home_team ?? "");
      const awayTeam = String(event?.away_team ?? "");
      return {
        event_id: String(event?.id ?? ""),
        sport_key: String(event?.sport_key ?? sportKey),
        sport_title: String(event?.sport_title ?? ""),
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: event?.commence_time ?? null,
        completed: Boolean(event?.completed ?? false),
        home_score: parseScore(scores, homeTeam),
        away_score: parseScore(scores, awayTeam),
        last_update: event?.last_update ?? null,
        source: "odds-api",
        raw: event,
      };
    }).filter((row) => row.event_id);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    let upserted = 0;
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("event_results")
        .upsert(rows, { onConflict: "event_id" });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      upserted = rows.length;
    }

    let settlement = null;
    if (settle) {
      const { data: settleData, error: settleError } = await supabase.rpc("settle_open_bets", {
        p_event_ids: eventIds,
      });
      if (settleError) {
        return new Response(JSON.stringify({ error: settleError.message, upserted }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      settlement = settleData ?? null;
    }

    return new Response(
      JSON.stringify({ upserted, settled: settlement }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage ?? "Odds sync error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
