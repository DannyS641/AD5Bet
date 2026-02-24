import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

type AutoReloadOptions = {
  intervalMs?: number;
  enabled?: boolean;
  runOnFocus?: boolean;
};

export function useAutoReload(
  action: () => void | Promise<void>,
  { intervalMs = 30000, enabled = true, runOnFocus = true }: AutoReloadOptions = {}
) {
  const actionRef = useRef(action);
  const inFlightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await actionRef.current();
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  const start = useCallback(() => {
    if (!enabled || intervalRef.current) return;
    intervalRef.current = setInterval(run, intervalMs);
  }, [enabled, intervalMs, run]);

  const stop = useCallback(() => {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      if (runOnFocus) {
        run();
      }
      start();
      return () => stop();
    }, [enabled, runOnFocus, run, start, stop])
  );

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        start();
      } else {
        stop();
      }
    });
    return () => subscription.remove();
  }, [enabled, start, stop]);
}
