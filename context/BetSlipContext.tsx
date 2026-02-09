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
  undoLastAction: () => void;
  canUndo: boolean;
  setStake: (value: string) => void;
};

type LastAction =
  | { type: "add"; selection: BetSelection }
  | { type: "remove"; selection: BetSelection }
  | { type: "clear"; selections: BetSelection[] }
  | null;

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState("1000");
  const [lastAction, setLastAction] = useState<LastAction>(null);

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
        setLastAction({ type: "remove", selection: exists });
        return current.filter((item) => item.id !== exists.id);
      }
      setLastAction({ type: "add", selection });
      return [...current, selection];
    });
  };

  const removeSelection = (id: string) => {
    setSelections((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) {
        setLastAction({ type: "remove", selection: removed });
      }
      return current.filter((item) => item.id !== id);
    });
  };

  const clearSelections = () => {
    setSelections((current) => {
      if (current.length > 0) {
        setLastAction({ type: "clear", selections: [...current] });
      }
      return [];
    });
  };

  const undoLastAction = () => {
    if (!lastAction) return;

    if (lastAction.type === "add") {
      setSelections((current) => current.filter((item) => item.id !== lastAction.selection.id));
      setLastAction(null);
      return;
    }

    if (lastAction.type === "remove") {
      setSelections((current) => {
        if (current.some((item) => item.id === lastAction.selection.id)) {
          return current;
        }
        return [...current, lastAction.selection];
      });
      setLastAction(null);
      return;
    }

    if (lastAction.type === "clear") {
      setSelections((current) => {
        const map = new Map(current.map((item) => [item.id, item]));
        lastAction.selections.forEach((item) => {
          if (!map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      });
      setLastAction(null);
    }
  };

  const canUndo = Boolean(lastAction);

  const value = useMemo<BetSlipContextValue>(
    () => ({
      selections,
      stake,
      totalOdds,
      potentialWin,
      addSelection,
      removeSelection,
      clearSelections,
      undoLastAction,
      canUndo,
      setStake,
    }),
    [selections, stake, totalOdds, potentialWin, canUndo, undoLastAction]
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
