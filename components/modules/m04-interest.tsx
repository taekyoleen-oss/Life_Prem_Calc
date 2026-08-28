"use client";

import type { M04Params, PvTiming } from "@/types/modules";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field, NumInput } from "./fields";
import type { ModuleFormProps } from "./types";

const EXTRA_OPTIONS: { value: PvTiming; label: string }[] = [
  { value: "mid", label: "연중 v^(t+1/2)" },
  { value: "end", label: "연말 v^(t+1)" },
];

export function M04Interest({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M04Params;
  const extra = p.extraTimings ?? [];
  const seriesAssets = result.assets.filter((a) => Array.isArray(a.value));

  const toggle = (t: PvTiming, on: boolean) =>
    update({
      // 결정론: 순서를 mid → end로 고정
      extraTimings: (["mid", "end"] as PvTiming[]).filter((x) =>
        x === t ? on : extra.includes(x),
      ),
    });

  const columns: GridColumn[] =
    seriesAssets.length > 0 && contract
      ? [
          {
            label: "t",
            values: (seriesAssets[0].value as number[]).map((_, t) => t),
          },
          {
            label: "연령",
            values: (seriesAssets[0].value as number[]).map((_, t) => contract.age + t),
          },
          ...seriesAssets.map((a) => ({
            label: a.def.code,
            values: a.value as number[],
            digits: 6,
          })),
        ]
      : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="예정이율 i (%)" hint="부리 방식: 연복리 (v1.0 고정)">
          <NumInput
            value={Number.isNaN(p.i) ? NaN : p.i * 100}
            onChange={(v) => update({ i: Number.isNaN(v) ? NaN : v / 100 })}
            step={0.1}
            min={0}
          />
        </Field>
        <Field
          label="추가 시점 계열"
          hint="기본 v^t(연시) 외에 별도 변수로 등록 — 수식·직접 참조용"
        >
          <div className="flex flex-col gap-1.5 pt-1">
            {EXTRA_OPTIONS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={extra.includes(o.value)}
                  onChange={(e) => toggle(o.value, e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="font-mono text-xs">{o.label}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
      {columns.length > 0 && <DataGrid columns={columns} />}
    </div>
  );
}
