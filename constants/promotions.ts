export type Promotion = {
  id: string;
  label: string;
  title: string;
  copy: string;
  cta: string;
  badgeTop: string;
  badgeBottom: string;
};

export const promotions: Promotion[] = [
  {
    id: "super-sunday-combo",
    label: "Today's Boost",
    title: "Super Sunday Combo",
    copy: "Stake \u20A6500 and win up to \u20A6120,000 with boosted odds.",
    cta: "Join Now",
    badgeTop: "+12%",
    badgeBottom: "Boost",
  },
  {
    id: "midweek-multipliers",
    label: "Midweek Special",
    title: "Midweek Multipliers",
    copy: "Pick any 3 matches and unlock an extra \u20A65,000 payout.",
    cta: "Boost Picks",
    badgeTop: "+8%",
    badgeBottom: "Boost",
  },
  {
    id: "derby-day-flash",
    label: "Flash Offer",
    title: "Derby Day Flash",
    copy: "Back the derby winner and get up to \u20A630,000 bonus.",
    cta: "Play Derby",
    badgeTop: "+15%",
    badgeBottom: "Boost",
  },
  {
    id: "live-kickoff-rush",
    label: "Live Boost",
    title: "Kickoff Rush",
    copy: "Place any live bet in the first 10 minutes to earn \u20A63,000.",
    cta: "Go Live",
    badgeTop: "+10%",
    badgeBottom: "Boost",
  },
  {
    id: "jackpot-fuel",
    label: "Jackpot Bonus",
    title: "Jackpot Fuel",
    copy: "Top up your jackpot ticket to claim a \u20A62,000 bonus.",
    cta: "Top Up",
    badgeTop: "+5%",
    badgeBottom: "Bonus",
  },
  {
    id: "weekend-goals",
    label: "Weekend Special",
    title: "Goal Rush Weekend",
    copy: "Stake \u20A61,000 on goal markets and win up to \u20A6200,000.",
    cta: "Get Goals",
    badgeTop: "+18%",
    badgeBottom: "Boost",
  },
];
