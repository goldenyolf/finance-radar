import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { GlassmorphismLoginCard } from "./glassmorphism-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 登入頁 — 進入前先 server side 確認 session。已登入則直接 redirect /，
 * 避免使用者繞回 /login 又看到一次表單。
 *
 * UI 採毛玻璃卡片風，跟 (auth)/layout.tsx 的深色漸層底搭配出夜空浮現感。
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return <GlassmorphismLoginCard />;
}
