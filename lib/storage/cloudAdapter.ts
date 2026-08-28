import { SCHEMA_VERSION, type Sheet, type WorkbookFile } from "@/types/pipeline";
import { supabase } from "@/lib/supabase/client";
import type { StorageAdapter } from "./adapter";

/**
 * Supabase 어댑터 (설계서 §4.1, §4.3): pf_workbooks + pf_sheets.
 * 파이프라인은 pf_sheets.pipeline JSONB에 직렬화(types/pipeline.ts 스키마).
 * RLS가 owner 범위를 강제하므로 쿼리에 별도 owner 조건이 없어도 안전하다.
 */

function db() {
  if (!supabase) throw new Error("클라우드가 설정되지 않았습니다 (환경 변수 없음).");
  return supabase;
}

export const cloudAdapter: StorageAdapter = {
  async listWorkbooks() {
    const { data, error } = await db()
      .from("pf_workbooks")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`워크북 목록 조회 실패: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
  },

  async loadWorkbook(id) {
    const { data: wb, error } = await db()
      .from("pf_workbooks")
      .select("id, title, memo, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`워크북 조회 실패: ${error.message}`);
    if (!wb) return null;
    const { data: sheets, error: se } = await db()
      .from("pf_sheets")
      .select("id, name, sheet_type, pipeline")
      .eq("workbook_id", id)
      .order("position", { ascending: true });
    if (se) throw new Error(`시트 조회 실패: ${se.message}`);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: wb.id,
      title: wb.title,
      memo: wb.memo ?? undefined,
      sheets: (sheets ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        sheetType: s.sheet_type,
        pipeline: s.pipeline,
      })) as Sheet[],
      updatedAt: wb.updated_at,
    } satisfies WorkbookFile;
  },

  async saveWorkbook(wb) {
    const c = db();
    const { error } = await c.from("pf_workbooks").upsert({
      id: wb.id,
      title: wb.title,
      memo: wb.memo ?? null,
      updated_at: wb.updatedAt,
    });
    if (error) throw new Error(`워크북 저장 실패: ${error.message}`);

    const rows = wb.sheets.map((s, i) => ({
      id: s.id,
      workbook_id: wb.id,
      name: s.name,
      sheet_type: s.sheetType,
      position: i,
      pipeline: s.pipeline,
      updated_at: wb.updatedAt,
    }));
    const { error: se } = await c.from("pf_sheets").upsert(rows);
    if (se) throw new Error(`시트 저장 실패: ${se.message}`);

    // 삭제된 시트 정리
    const keep = wb.sheets.map((s) => s.id);
    const { error: de } = await c
      .from("pf_sheets")
      .delete()
      .eq("workbook_id", wb.id)
      .not("id", "in", `(${keep.join(",")})`);
    if (de) throw new Error(`시트 정리 실패: ${de.message}`);
  },

  async deleteWorkbook(id) {
    const { error } = await db().from("pf_workbooks").delete().eq("id", id);
    if (error) throw new Error(`워크북 삭제 실패: ${error.message}`);
  },
};
