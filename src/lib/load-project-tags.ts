import { createClient } from "@/lib/supabase/server";

/**
 * QuickAdd 的專案標籤建議清單。
 *
 * 首頁改用「近期窗口」抓 transactions 後（loadDashboard 的 transactionsSince），
 * 就不能再從 transactions 全量去重出所有用過的 project_tag —— 幾個月前用過的
 * 標籤（'太太醫療' 等）會從建議裡消失。為此獨立一支輕量查詢：只 select
 * `project_tag` 單欄、且用 `NOT NULL` 濾掉絕大多數（日常交易 tag 為 null）的列，
 * 回傳的是罕見「重大專案」那一小撮，成本遠低於全欄全列。
 */
export async function loadProjectTagSuggestions(): Promise<string[]> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("project_tag")
      .not("project_tag", "is", null);
    if (error || !data) return [];
    const tags = new Set<string>();
    for (const row of data as { project_tag: string | null }[]) {
      const tag = row.project_tag?.trim();
      if (tag) tags.add(tag);
    }
    return Array.from(tags).sort();
  } catch {
    return [];
  }
}
