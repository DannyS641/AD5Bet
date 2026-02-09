import { supabase } from "./supabase";

export type OddsMarketOutcome = {
  name: string;
  price: number;
  point?: number | null;
};

export type OddsMarket = {
  key: string;
  outcomes: OddsMarketOutcome[];
};

export type OddsEvent = {
  id: string;
  sportKey: string;
  sportTitle: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  markets: OddsMarket[];
};

const ODDS_FUNCTION = "Odds-API";

async function oddsApiFetch<T>(path: string, params: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke(ODDS_FUNCTION, {
    body: { path, params },
  });

  if (error) {
    const context = (error as { context?: { status?: number } }).context;
    const suffix = context?.status ? ` (status ${context.status})` : "";
    throw new Error(`${error.message}${suffix}`);
  }

  return data as T;
}

type OddsApiMarket = {
  key: string;
  outcomes: OddsMarketOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  markets: OddsApiMarket[];
};

type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

const DEFAULT_REGIONS = "eu";
const DEFAULT_ODDS_FORMAT = "decimal";
const DEFAULT_DATE_FORMAT = "iso";

function pickMarkets(bookmakers: OddsApiBookmaker[] | undefined) {
  const bookmaker = bookmakers?.[0];
  if (!bookmaker) {
    return [];
  }
  return bookmaker.markets.map((market) => ({
    key: market.key,
    outcomes: market.outcomes,
  }));
}

export async function fetchFeaturedOdds(sportKey = "soccer_epl") {
  const data = await oddsApiFetch<OddsApiEvent[]>(`/sports/${sportKey}/odds`, {
    regions: DEFAULT_REGIONS,
    markets: "h2h,totals,spreads",
    oddsFormat: DEFAULT_ODDS_FORMAT,
    dateFormat: DEFAULT_DATE_FORMAT,
  });

  return data.map((event) => ({
    id: event.id,
    sportKey: event.sport_key,
    sportTitle: event.sport_title,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    markets: pickMarkets(event.bookmakers),
  }));
}

export async function fetchEventMarkets(eventId: string, sportKey: string) {
  const data = await oddsApiFetch<OddsApiEvent[]>(`/sports/${sportKey}/events/${eventId}/odds`, {
    regions: DEFAULT_REGIONS,
    markets: "h2h,totals,spreads,btts,draw_no_bet,h2h_3_way",
    oddsFormat: DEFAULT_ODDS_FORMAT,
    dateFormat: DEFAULT_DATE_FORMAT,
  });

  const event = data[0];
  if (!event) {
    return null;
  }

  return {
    id: event.id,
    sportKey: event.sport_key,
    sportTitle: event.sport_title,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    markets: pickMarkets(event.bookmakers),
  };
}
