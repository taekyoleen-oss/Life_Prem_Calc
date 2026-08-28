/**
 * 통합 계산표 내보내기 (설계서 §3.6): CSV·XLSX(SheetJS).
 * 내보내는 값은 내부 전체 자릿수(정확도 원칙) — 표시 반올림은 화면 전용.
 */

export interface ExportColumn {
  label: string;
  values: readonly (number | string | null)[];
}

export function toCsv(columns: ExportColumn[]): string {
  const rows = Math.max(...columns.map((c) => c.values.length), 0);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (let r = 0; r < rows; r++) {
    lines.push(columns.map((c) => esc(c.values[r])).join(","));
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: `${mime};charset=utf-8` }));
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** XLSX 내보내기: 입력 요약 · 통합 계산표 · 스칼라 요약 3개 시트 */
export async function exportXlsx(opts: {
  filename: string;
  inputSummary: [string, string | number][];
  columns: ExportColumn[];
  scalars: { code: string; name: string; value: number }[];
}): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["항목", "값"], ...opts.inputSummary]),
    "입력 요약",
  );

  const rows = Math.max(...opts.columns.map((c) => c.values.length), 0);
  const aoa: (string | number | null)[][] = [opts.columns.map((c) => c.label)];
  for (let r = 0; r < rows; r++) {
    aoa.push(opts.columns.map((c) => c.values[r] ?? null));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "통합 계산표");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["코드", "표시명", "값"],
      ...opts.scalars.map((s) => [s.code, s.name, s.value] as (string | number)[]),
    ]),
    "스칼라 요약",
  );

  XLSX.writeFile(wb, opts.filename);
}
