import React from "react";

import { AuthProvider } from "@/context/AuthContext";
import { BetSlipProvider } from "@/context/BetSlipContext";
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BetSlipProvider>{children}</BetSlipProvider>
    </AuthProvider>
  );
}
