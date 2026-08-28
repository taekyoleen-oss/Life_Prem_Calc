import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 브라우저 클라이언트 (설계서 §4.3).
 * 환경 변수가 없으면 null — 앱은 게스트 모드로만 동작한다(P0~P4 호환).
 * anon key만 사용한다. service_role은 클라이언트 금지(금지사항).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const cloudEnabled = supabase !== null;
