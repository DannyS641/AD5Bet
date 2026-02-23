// Supabase Edge Function: place-bet
// Validates odds and kickoff cutoff before placing a bet.
// Requires ODDS_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY to be set in Supabase secrets.

import { createClient } from "jsr:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const oddsApiKey = Deno.env.get("ODDS_API_KEY") ?? "";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_MARKETS = "h2h,totals,alternate_totals,spreads,btts,draw_no_bet,h2h_3_way";

type BetSelection = {
  id: string;
  eventId: string;
  sportKey: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  match?: string;
  market: string;
  outcome: string;
  odds: number;
  commenceTime?: string;
  point?: number | null;
};

type OddsOutcome = { name: string; price: number; point?: number | null };

type OddsMarket = { key: string; outcomes: OddsOutcome[] };

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{ markets: OddsMarket[] }>;
};

const normalize = (value: string) => value.toLowerCase().trim();

const mapOutcomeName = (selection: BetSelection, event: OddsEvent) => {
  const outcome = normalize(selection.outcome ?? "");
  if (selection.market === "h2h_3_way") {
    if (outcome === "1") return normalize(event.home_team);
    if (outcome === "2") return normalize(event.away_team);
    if (outcome === "x" || outcome === "draw") return "draw";
  }
  if (selection.market === "draw_no_bet" || selection.market === "spreads") {
    if (outcome === "home") return normalize(event.home_team);
    if (outcome === "away") return normalize(event.away_team);
  }
  if (selection.market === "h2h") {
    if (outcome === "home") return normalize(event.home_team);
    if (outcome === "away") return normalize(event.away_team);
    if (outcome === "draw" || outcome === "x") return "draw";
  }
  return outcome;
};

const matchOutcome = (selection: BetSelection, event: OddsEvent, market: OddsMarket) => {
  const marketKey = market.key;
  const normalizedOutcome = mapOutcomeName(selection, event);

  if (marketKey === "totals" || marketKey === "alternate_totals") {
    const desiredPoint =
      typeof selection.point === "number" ? selection.point : Number(selection.point ?? "");
    const desiredWord = normalizedOutcome.split(" ")[0];
    return market.outcomes.find((outcome) => {
      const name = normalize(outcome.name);
      const point = typeof outcome.point === "number" ? outcome.point : null;
      return name.startsWith(desiredWord) && point !== null && point === desiredPoint;
    });
  }

  if (marketKey === "spreads") {
    const desiredPoint =
      typeof selection.point === "number" ? selection.point : Number(selection.point ?? "");
    return market.outcomes.find((outcome) => {
      const name = normalize(outcome.name);
      const point = typeof outcome.point === "number" ? outcome.point : null;
      if (!Number.isNaN(desiredPoint) && point !== null && point !== desiredPoint) {
        return false;
      }
      return name === normalizedOutcome;
    });
  }

  return market.outcomes.find((outcome) => normalize(outcome.name) === normalizedOutcome);
};

const fetchSportOdds = async (sportKey: string, markets: string) => {
  const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", oddsApiKey);
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", markets);
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const response = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    return { error: payload?.message ?? "Odds API error" } as const;
  }
  const events = Array.isArray(payload) ? (payload as OddsEvent[]) : [];
  return { events } as const;
};

const parseMatchTeams = (match?: string) => {
  if (!match) return null;
  const parts = match.split(" vs ");
  if (parts.length !== 2) return null;
  return { home: parts[0].trim(), away: parts[1].trim() };
};

const teamMatches = (a: string, b: string) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
};

const findFallbackEvent = (selection: BetSelection, events: OddsEvent[]) => {
  if (selection.eventId) {
    const byId = events.find((event) => event.id === selection.eventId);
    if (byId) return byId;
  }

  const parsed = parseMatchTeams(selection.match);
  const homeTeam = selection.homeTeam ?? parsed?.home ?? "";
  const awayTeam = selection.awayTeam ?? parsed?.away ?? "";
  if (!homeTeam || !awayTeam) return null;

  const home = normalize(homeTeam);
  const away = normalize(awayTeam);
  const targetTime = selection.commenceTime ? new Date(selection.commenceTime).getTime() : null;

  return (
    events.find((event) => {
      const matchesTeams =
        teamMatches(event.home_team, home) && teamMatches(event.away_team, away);
      if (!matchesTeams) return false;
      if (!targetTime || !event.commence_time) return true;
      const eventTime = new Date(event.commence_time).getTime();
      return Math.abs(eventTime - targetTime) <= 2 * 60 * 60 * 1000;
    }) ?? null
  );
};

const buildRequestedMarkets = (selections: BetSelection[]) => {
  const markets = new Set<string>();
  selections.forEach((selection) => {
    if (!selection.market) return;
    if (selection.market === "alternate_totals") {
      markets.add("totals");
      return;
    }
    markets.add(selection.market);
  });
  return Array.from(markets);
};

const parseUnsupportedMarkets = (message: string) => {
  const marker = "Markets not supported by this endpoint:";
  if (!message.includes(marker)) return [];
  const list = message.split(marker)[1] ?? "";
  return list
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !oddsApiKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const stake = Number(body?.stake ?? body?.p_stake ?? 0);
    const currency = String(body?.currency ?? body?.p_currency ?? "NGN");
    const selections = (body?.selections ?? body?.p_selections ?? []) as BetSelection[];
    const allowLive = Boolean(body?.allowLive ?? true);
    const cutoffMinutes = Math.max(0, Number(body?.cutoffMinutes ?? 2));
    const priceTolerance = Math.max(0, Number(body?.priceTolerance ?? 0.02));

    if (!stake || Number.isNaN(stake) || stake <= 0) {
      return new Response(JSON.stringify({ error: "Invalid stake." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(selections) || selections.length === 0) {
      return new Response(JSON.stringify({ error: "No selections." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bySport = new Map<string, OddsEvent[]>();
    const sportKeys = Array.from(
      new Set(selections.map((selection) => selection.sportKey).filter(Boolean))
    );
    for (const sportKey of sportKeys) {
      const requestedMarkets = buildRequestedMarkets(
        selections.filter((selection) => selection.sportKey === sportKey)
      );
      const marketParam = requestedMarkets.length > 0 ? requestedMarkets.join(",") : DEFAULT_MARKETS;
      let result = await fetchSportOdds(sportKey, marketParam);
      if ("error" in result) {
        const unsupported = parseUnsupportedMarkets(String(result.error));
        if (unsupported.length > 0) {
          const allowed = requestedMarkets.filter((market) => !unsupported.includes(market));
          if (allowed.length === 0) {
            return new Response(
              JSON.stringify({
                error: `Markets not supported: ${unsupported.join(", ")}`,
                code: "markets_not_supported",
                sportKey,
              }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          const fallbackParam = allowed.join(",");
          result = await fetchSportOdds(sportKey, fallbackParam);
        }
      }
      if ("error" in result) {
        return new Response(JSON.stringify({ error: result.error, sportKey }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bySport.set(sportKey, result.events);
    }

    const now = Date.now();
    const validatedSelections: BetSelection[] = [];

    for (const selection of selections) {
      const selectionCommenceMs = selection.commenceTime
        ? new Date(selection.commenceTime).getTime()
        : null;
      if (!allowLive && selectionCommenceMs && !Number.isNaN(selectionCommenceMs)) {
        if (Date.now() >= selectionCommenceMs) {
          return new Response(
            JSON.stringify({
              error: "Live betting is not available.",
              code: "live_not_supported",
              eventId: selection.eventId,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const events = bySport.get(selection.sportKey) ?? [];
      const event =
        events.find((item) => item.id === selection.eventId) ??
        findFallbackEvent(selection, events);
      if (!event) {
        return new Response(JSON.stringify({ error: "Event not found", code: "event_not_found", eventId: selection.eventId }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const commenceTime = event.commence_time ?? selection.commenceTime ?? null;
      if (commenceTime) {
        const commenceMs = new Date(commenceTime).getTime();
        if (!Number.isNaN(commenceMs)) {
          const cutoffMs = cutoffMinutes * 60 * 1000;
          if (!allowLive && now >= commenceMs) {
            return new Response(
              JSON.stringify({ error: "Event already started", code: "event_started", eventId: selection.eventId }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (!allowLive && now >= commenceMs - cutoffMs) {
            return new Response(
              JSON.stringify({ error: "Event too close to start", code: "cutoff", eventId: selection.eventId }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }

      const markets = event.bookmakers?.[0]?.markets ?? [];
      const market =
        markets.find((m) => m.key === selection.market) ??
        (selection.market === "alternate_totals"
          ? markets.find((m) => m.key === "totals")
          : null);
      if (!market) {
        return new Response(
          JSON.stringify({
            error: "Market not available",
            code: "market_not_supported",
            eventId: selection.eventId,
            market: selection.market,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const outcome = matchOutcome(selection, event, market);
      if (!outcome) {
        return new Response(JSON.stringify({ error: "Outcome not available", eventId: selection.eventId }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentOdds = Number(outcome.price ?? 0);
      const requestedOdds = Number(selection.odds ?? 0);
      if (!currentOdds || !requestedOdds) {
        return new Response(JSON.stringify({ error: "Invalid odds", eventId: selection.eventId }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (currentOdds < requestedOdds) {
        const diff = Math.abs(currentOdds - requestedOdds);
        const allowed = requestedOdds * priceTolerance;
        if (diff > allowed) {
          return new Response(
            JSON.stringify({
              error: "Price changed",
              code: "price_changed",
              eventId: selection.eventId,
              requestedOdds,
              currentOdds,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      validatedSelections.push({
        ...selection,
        odds: currentOdds,
        commenceTime: commenceTime ?? selection.commenceTime,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        league: event.sport_title ?? selection.league,
        point: typeof outcome.point === "number" ? outcome.point : selection.point ?? null,
      });
    }

    const { data: placeResult, error: placeError } = await adminClient.rpc("place_bet", {
      p_user_id: userData.user.id,
      p_stake: stake,
      p_currency: currency,
      p_selections: validatedSelections,
    });

    if (placeError) {
      return new Response(JSON.stringify({ error: placeError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ...placeResult, selections: validatedSelections }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage ?? "Place bet error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
