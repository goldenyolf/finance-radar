import { createClient } from "@/lib/supabase/server";

/**
 * 個人設定（display_name + target_savings_rate）。
 *
 * 失敗 / row 不存在 → 回 sensible defaults（空 nickname + 20% 目標儲蓄率）
 * 而非 throw，避免設定頁因為一張表撈不到就 500。
 *
 * 這份跟 loadLineBinding / loadOnboardingCompleted 共用 profiles 表，但故意
 * 分三個 loader 而不合一支大的：每個 caller 只拿自己需要的欄位，邊界乾淨。
 */
export interface ProfileSettings {
  display_name: string | null;
  target_savings_rate: number;
}

const DEFAULT_TARGET = 20;

export async function loadProfileSettings(): Promise<ProfileSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, target_savings_rate")
      .maybeSingle();
    if (error || !data) {
      return { display_name: null, target_savings_rate: DEFAULT_TARGET };
    }
    const rate = Number(data.target_savings_rate ?? DEFAULT_TARGET);
    return {
      display_name: (data.display_name as string | null) ?? null,
      target_savings_rate: Number.isFinite(rate) ? rate : DEFAULT_TARGET,
    };
  } catch {
    return { display_name: null, target_savings_rate: DEFAULT_TARGET };
  }
}
