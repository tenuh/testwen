import { requireSupabase } from "./supabase.js";

const TOKEN_KEY = "study-hub-session";
const PROFILE_KEY = "study-hub-profile";

export async function signIn(loginId, password, requestedRole) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("login_with_login_id", {
    p_login_id: loginId.trim(),
    p_password: password,
    p_requested_role: requestedRole,
  });
  if (error) throw error;

  if (data?.status === "wrong_role") {
    throw new Error("Wrong role");
  }
  if (data?.status !== "ok" || !data?.token || !data?.user) {
    throw new Error("Wrong ID or Password");
  }

  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function restoreSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_profile");
  if (error || !data?.id) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    return null;
  }
  sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  return data;
}

export async function signOut() {
  const client = requireSupabase();
  try {
    await client.rpc("logout_studyhub");
  } finally {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
  }
}
