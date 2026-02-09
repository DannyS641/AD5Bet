import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/context/AuthContext";
import { BetSlipProvider } from "@/context/BetSlipContext";
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BetSlipProvider>{children}</BetSlipProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
