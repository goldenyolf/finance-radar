"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signAuthToken } from "@/lib/auth-token";

const COOKIE_NAME = "money_radar_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export interface LoginState {
  error: string | null;
}

/**
 * 驗 PIN → 簽 HMAC token → 設 HttpOnly cookie → redirect 回首頁。
 * 配合 useActionState 使用：成功時不會回 state（redirect 直接終止），
 * 失敗時回 { error } 讓 client form 顯示紅字。
 *
 * Cookie 值不再是字面 "true"，改放 HMAC 簽章 token，proxy 端會驗證
 * 簽章 + 過期，達到「無法偽造 cookie 繞過」的安全等級。
 */
export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const sitePin = process.env.SITE_PIN;
  const authSecret = process.env.SITE_AUTH_SECRET;

  if (!sitePin) {
    console.error("[login] SITE_PIN env 未設定，無法驗證");
    return { error: "伺服器尚未設定密碼，請聯絡管理員。" };
  }
  if (!authSecret) {
    console.error("[login] SITE_AUTH_SECRET env 未設定，無法簽章 cookie");
    return { error: "伺服器尚未設定 SITE_AUTH_SECRET，請聯絡管理員。" };
  }

  const pin = formData.get("pin");
  if (typeof pin !== "string" || pin.length === 0) {
    return { error: "請輸入密碼" };
  }

  if (pin !== sitePin) {
    return { error: "密碼錯誤，請重試" };
  }

  const token = await signAuthToken(authSecret);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  // redirect 會 throw NEXT_REDIRECT，不需要回傳值；放在最後一行
  redirect("/");
}
