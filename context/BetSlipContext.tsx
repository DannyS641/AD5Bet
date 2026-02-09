import React, { createContext, useContext, useMemo, useState } from "react";

export type BetSelection = {
  id: string;
  eventId: string;
  sportKey: string;
  league: string;
  match: string;
  market: string;
  outcome: string;
  odds: number;
  commenceTime: string;
};

type BetSlipContextValue = {
  selections: BetSelection[];
  stake: string;
  totalOdds: number;
  potentialWin: number;
  addSelection: (selection: BetSelection) => void;
  removeSelection: (id: string) => void;
  clearSelections: () => void;
  setStake: (value: string) => void;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState("1000");

  const totalOdds = useMemo(() => {
    if (selections.length === 0) return 0;
    return Number(selections.reduce((sum, item) => sum * item.odds, 1).toFixed(2));
  }, [selections]);

  const potentialWin = useMemo(() => {
    const stakeValue = Number(stake || 0);
    return Number((stakeValue * totalOdds).toFixed(2));
  }, [stake, totalOdds]);

  const addSelection = (selection: BetSelection) => {
    setSelections((current) => {
      const exists = current.find(
        (item) => item.eventId === selection.eventId && item.market === selection.market && item.outcome === selection.outcome
      );
      if (exists) {
        return current;
      }
      return [...current, selection];
    });
  };

  const removeSelection = (id: string) => {
    setSelections((current) => current.filter((item) => item.id !== id));
  };

  const clearSelections = () => {
    setSelections([]);
  };

  const value = useMemo<BetSlipContextValue>(
    () => ({
      selections,
      stake,
      totalOdds,
      potentialWin,
      addSelection,
      removeSelection,
      clearSelections,
      setStake,
    }),
    [selections, stake, totalOdds, potentialWin]
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used within BetSlipProvider");
  }
  return context;
}
