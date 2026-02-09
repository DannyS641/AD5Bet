import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

import { Config } from "./config";

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const webStorage = {
  getItem: async (key: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
  setItem: async (key: string, value: string) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

const isBrowser = typeof window !== "undefined";
const storage = Platform.OS === "web" ? (isBrowser ? webStorage : noopStorage) : AsyncStorage;

export const supabase = createClient(Config.supabaseUrl, Config.supabaseAnonKey, {
  auth: {
    storage,
    persistSession: Platform.OS !== "web" || isBrowser,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
