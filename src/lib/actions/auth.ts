"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email) return "請輸入 email";
  if (!EMAIL_RE.test(email)) return "email 格式錯誤";
  if (password.length < 6) return "密碼至少 6 個字元";
  return { email, password };
}

/**
 * Sign in：用既有帳號 + 密碼登入。成功後 redirect 到 /，session cookie
 * 由 @supabase/ssr 寫到 response headers。
 */
export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const v = validate(formData);
  if (typeof v === "string") return { error: v };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: v.email,
    password: v.password,
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  redirect("/");
}

/**
 * Sign up：建立新帳號。Email confirmation 在 Supabase Dashboard 那邊
 * 關閉時，註冊完即時拿到 session、直接 redirect 進 app；如果使用者忘了
 * 關 confirm email，這裡 user 還是會回傳但 session 是 null，需要登出再
 * 來過。
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const v = validate(formData);
  if (typeof v === "string") return { error: v };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  // confirm email 開著時 session 會是 null，提示去收信
  if (!data.session) {
    return {
      error: "帳號已建立，請到信箱點驗證連結後再回來登入。",
    };
  }

  redirect("/");
}

/** 登出後送回 /login。 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function friendlyAuthError(raw: string): string {
  // 把 Supabase 原始錯誤訊息翻成中文
  if (/Invalid login credentials/i.test(raw)) return "Email 或密碼錯誤";
  if (/User already registered/i.test(raw)) return "這個 Email 已經註冊過了";
  if (/Email rate limit/i.test(raw)) return "請求過於頻繁，請稍後再試";
  if (/Password should be at least/i.test(raw)) return "密碼至少 6 個字元";
  return raw;
}
