import { createClient } from "@/lib/supabase/server";

/**
 * 撈當前登入會員的 onboarding 完成狀態。
 *
 * 失敗 / 沒 profile row → 預設視為「已完成」(true) — 不打擾使用者，
 * 出 bug 時也不會莫名其妙跳 wizard 在臉上。Wizard 是「nice-to-have」
 * 不是 critical path，靜默降級比 false positive 友善。
 *
 * RLS 自動 scope，無需顯式 where id = auth.uid()。
 */
export async function loadOnboardingCompleted(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("has_completed_onboarding")
      .maybeSingle();
    if (error || !data) return true;
    return data.has_completed_onboarding ?? true;
  } catch {
    return true;
  }
}
