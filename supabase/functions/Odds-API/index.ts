// Supabase Edge Function: odds-api
// Proxies requests to The Odds API to avoid CORS and keep API keys server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = Deno.env.get("ODDS_API_KEY") ?? "";

type OddsApiProxyRequest = {
  path: string;
  params?: Record<string, string | number | boolean | null | undefined>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "Odds-API" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!ODDS_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing ODDS_API_KEY." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { path, params } = (await req.json()) as OddsApiProxyRequest;
    if (!path) {
      return new Response(JSON.stringify({ error: "Missing path." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPath = path.replace(/^\/+/, "");
    const url = new URL(`${ODDS_API_BASE}/${cleanPath}`);
    url.searchParams.set("apiKey", ODDS_API_KEY);

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
