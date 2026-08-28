"use client";

import { fmt } from "@/lib/format";
import { toCsv, downloadText, exportXlsx, type ExportColumn } from "@/lib/export";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field } from "./fields";
import type { ModuleFormProps } from "./types";

/**
 * M11 결과 요약 (§3.6): 시트의 모든 계열을 t 인덱스로 조인한 통합 계산표.
 * 엑셀 산출검증표 감각으로 훑어보고, 표시할 컬럼을 선택하고, CSV·XLSX로 내보낸다.
 */
export function M11Output({ mod, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as { seriesAssetIds?: string[] | null };
  const seriesAssets = upstream.filter((a) => a.def.kind === "series");
  const scalarAssets = upstream.filter((a) => a.def.kind === "scalar" && a.tag !== "contract");
  const selectedIds = p.seriesAssetIds ?? seriesAssets.map((a) => a.def.id);
  const selected = seriesAssets.filter((a) => selectedIds.includes(a.def.id));

  const digitsFor = (tag: string) =>
    tag === "discount" || tag === "discount_shifted" || tag === "formula" ? 6 : 2;

  const maxLen = Math.max(0, ...selected.map((a) => (a.value as number[]).length));
  const columns: GridColumn[] = maxLen
    ? [
        { label: "t", values: Array.from({ length: maxLen }, (_, t) => t) },
        ...(contract
          ? [{ label: "연령", values: Array.from({ length: maxLen }, (_, t) => contract.age + t) }]
          : []),
        ...selected.map((a) => ({
          label: a.def.code,
          values: a.value as number[],
          digits: digitsFor(a.tag),
        })),
      ]
    : [];

  const exportColumns = (): ExportColumn[] =>
    columns.map((c) => ({ label: c.label, values: c.values }));

  const doXlsx = () =>
    exportXlsx({
      filename: "premiaflow_통합계산표.xlsx",
      inputSummary: contract
        ? [
            ["가입연령", contract.age],
            ["성별", contract.sex === "male" ? "남" : "여"],
            ["보험기간", contract.years],
            ["납입기간", contract.payYears],
            ["가입금액", contract.sumAssured],
          ]
        : [],
      columns: exportColumns(),
      scalars: scalarAssets.map((a) => ({
        code: a.def.code,
        name: a.def.displayName,
        value: a.value as number,
      })),
    }).catch((e) => window.alert(`XLSX 내보내기 실패: ${e instanceof Error ? e.message : e}`));

  return (
    <div className="flex flex-col gap-4">
      <Field label="통합 계산표 컬럼 선택">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          {seriesAssets.map((a) => (
            <label key={a.def.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(a.def.id)}
                onChange={(e) =>
                  update({
                    seriesAssetIds: e.target.checked
                      ? [...selectedIds, a.def.id]
                      : selectedIds.filter((id) => id !== a.def.id),
                  })
                }
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="font-mono text-xs">{a.def.code}</span>
              <span className="text-xs text-muted-foreground">{a.def.displayName}</span>
            </label>
          ))}
          {seriesAssets.length === 0 && (
            <p className="text-sm text-muted-foreground">상류에 계열 자산이 없습니다.</p>
          )}
        </div>
      </Field>

      {columns.length > 0 && <DataGrid columns={columns} maxHeightClass="max-h-96" />}

      {scalarAssets.length > 0 && (
        <Field label="스칼라 요약">
          <table className="w-fit text-sm">
            <tbody>
              {scalarAssets.map((a) => (
                <tr key={a.def.id} className="border-t border-border/60">
                  <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">{a.def.code}</td>
                  <td className="py-1 pr-4">{a.def.displayName}</td>
                  <td className="py-1 text-right tabular font-semibold">{fmt(a.value as number, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Field>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => downloadText("premiaflow_통합계산표.csv", toCsv(exportColumns()), "text/csv")}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          CSV 다운로드
        </button>
        <button
          type="button"
          onClick={doXlsx}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          XLSX 내보내기
        </button>
        <span className="self-center text-xs text-muted-foreground">
          값은 내부 전체 자릿수로 내보냅니다 (엑셀 대사 검증용)
        </span>
      </div>
    </div>
  );
}
