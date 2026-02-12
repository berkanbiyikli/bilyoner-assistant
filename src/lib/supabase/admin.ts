// ============================================
// Supabase Admin Client (Server-side, no cookies)
// Cron job'lar ve API route'ları için
// ============================================

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
