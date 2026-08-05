import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error(
    "Supabase の環境変数が設定されていません。.env ファイルに VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を設定してください。"
  );
}

export const supabase = createClient(url, key);
