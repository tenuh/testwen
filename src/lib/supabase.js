import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const missingSupabaseConfig = [
  !url && "VITE_SUPABASE_URL",
  !publishableKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
].filter(Boolean);

const attachSessionHeader = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  const token = globalThis.sessionStorage?.getItem("study-hub-session");
  if (token) headers.set("x-studyhub-session", token);
  else headers.delete("x-studyhub-session");
  return fetch(input, { ...init, headers });
};

export const supabase = missingSupabaseConfig.length
  ? null
  : createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: attachSessionHeader },
    });

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      `Connect Supabase by setting ${missingSupabaseConfig.join(" and ")} in Replit Secrets.`,
    );
  }
  return supabase;
}

export function getStoredProfile() {
  try {
    const value = globalThis.sessionStorage?.getItem("study-hub-profile");
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
