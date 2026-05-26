"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "money_radar_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

export interface LoginState {
  error: string | null;
}

/**
 * 驗 PIN → 設 HttpOnly cookie → redirect 回首頁。
 * 配合 useActionState 使用：成功時不會回 state（redirect 直接終止），
 * 失敗時回 { error } 讓 client form 顯示紅字。
 */
export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const sitePin = process.env.SITE_PIN;
  if (!sitePin) {
    // 伺服器端故意不洩漏「PIN 沒設」這件事給匿名訪客，但 dev 時要看得到
    console.error("[login] SITE_PIN env 未設定，無法驗證");
    return { error: "伺服器尚未設定密碼，請聯絡管理員。" };
  }

  const pin = formData.get("pin");
  if (typeof pin !== "string" || pin.length === 0) {
    return { error: "請輸入密碼" };
  }

  if (pin !== sitePin) {
    return { error: "密碼錯誤，請重試" };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  // redirect 會 throw NEXT_REDIRECT，不需要回傳值；放在最後一行
  redirect("/");
}
