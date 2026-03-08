// ============================================
// Supabase Admin Client (Server-side, no cookies)
// Cron job'lar ve API route'ları için
// ============================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Supabase'in varsayılan 1000 satır limitini aşmak için
 * tüm kayıtları sayfalayarak çeker.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient<Database>,
  table: string,
  options?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    filters?: Array<{ method: string; args: unknown[] }>;
  }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(options?.select || "*");

    // Filtreleri uygula
    if (options?.filters) {
      for (const f of options.filters) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any)[f.method](...f.args);
      }
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? false,
      });
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = (data || []) as T[];
    allData = allData.concat(rows);

    if (rows.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  return allData;
}
