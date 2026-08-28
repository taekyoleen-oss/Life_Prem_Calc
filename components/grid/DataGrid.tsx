"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";

/**
 * 결과 미리보기 그리드 (설계서 §3.6).
 * 표시 자릿수는 컬럼별 digits로 관리하고, TSV 복사는 내부 전체 자릿수를 내보낸다
 * (엑셀 대사 검증 용도 — 정확도 최우선 §1.5).
 */
export interface GridColumn {
  label: string;
  values: readonly (number | string)[];
  /** 표시 소수 자릿수 (미지정 시 문자열 그대로 / 정수) */
  digits?: number;
}

export function DataGrid({
  columns,
  maxHeightClass = "max-h-72",
}: {
  columns: GridColumn[];
  maxHeightClass?: string;
}) {
  const [copied, setCopied] = useState(false);
  const rowCount = Math.max(...columns.map((c) => c.values.length), 0);
  if (rowCount === 0) return null;

  async function copyTsv(withHeader: boolean) {
    const lines: string[] = [];
    if (withHeader) lines.push(columns.map((c) => c.label).join("\t"));
    for (let r = 0; r < rowCount; r++) {
      lines.push(columns.map((c) => String(c.values[r] ?? "")).join("\t"));
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{rowCount}행</span>
        <button
          type="button"
          onClick={() => copyTsv(true)}
          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
        >
          {copied ? "복사됨 ✓" : "TSV 복사"}
        </button>
      </div>
      <div className={`overflow-auto ${maxHeightClass}`}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary">
            <tr>
              {columns.map((c) => (
                <th key={c.label} className="whitespace-nowrap px-3 py-1.5 text-right font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, r) => (
              <tr key={r} className="border-t border-border/60 hover:bg-secondary/40">
                {columns.map((c) => {
                  const v = c.values[r];
                  return (
                    <td key={c.label} className="whitespace-nowrap px-3 py-1 text-right">
                      {typeof v === "number" ? fmt(v, c.digits ?? 0) : (v ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
