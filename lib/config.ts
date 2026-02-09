export const Config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  oddsApiKey: process.env.EXPO_PUBLIC_ODDS_API_KEY ?? "",
  paystackPublicKey: process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
};

export function assertConfig() {
  const missing = Object.entries(Config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing config values: ${missing.join(", ")}`);
  }
}
