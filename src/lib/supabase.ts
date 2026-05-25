import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "缺少環境變數 NEXT_PUBLIC_SUPABASE_URL。請確認專案根目錄的 .env.local 中已設定該變數，並重新啟動 dev server。"
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "缺少環境變數 NEXT_PUBLIC_SUPABASE_ANON_KEY。請確認專案根目錄的 .env.local 中已設定該變數（sb_publishable_ 開頭），並重新啟動 dev server。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
