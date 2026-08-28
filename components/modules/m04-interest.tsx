"use client";

import type { M04Params, M04Variant, PvTiming } from "@/types/modules";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field, NumInput, SelectInput } from "./fields";
import { SubStep, newSubKey } from "./SubStep";
import type { ModuleFormProps } from "./types";

const TIMING = [
  { value: "begin", label: "연시 v^t" },
  { value: "mid", label: "연중 v^(t+1/2)" },
  { value: "end", label: "연말 v^(t+1)" },
] as const;

const TIMING_KO = { begin: "연시 현가", mid: "연중 현가", end: "연말 현가" } as const;

/** 구버전 파라미터를 소단계 목록으로 정규화 (계산 레이어와 동일 규칙) */
function normalize(p: M04Params & { extraTimings?: PvTiming[] }): M04Variant[] {
  return (
    p.variants ?? [
      { key: "v", timing: "begin" as PvTiming },
      ...(p.extraTimings ?? [])
        .filter((t) => t === "mid" || t === "end")
        .map((t) => ({ key: `v_${t}`, timing: t })),
    ]
  );
}

export function M04Interest({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M04Params & { extraTimings?: PvTiming[] };
  const variants = normalize(p);
  const setVariants = (next: M04Variant[]) =>
    update({ variants: next, extraTimings: undefined });

  const seriesAssets = result.assets.filter((a) => Array.isArray(a.value));
  const columns: GridColumn[] =
    seriesAssets.length > 0 && contract
      ? [
          { label: "t", values: (seriesAssets[0].value as number[]).map((_, t) => t) },
          { label: "연령", values: (seriesAssets[0].value as number[]).map((_, t) => contract.age + t) },
          ...seriesAssets.map((a) => ({ label: a.def.code, values: a.value as number[], digits: 6 })),
        ]
      : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="예정이율 i (%)" hint="부리 방식: 연복리 (v1.0 고정) — 모든 소단계가 공유">
          <NumInput
            value={Number.isNaN(p.i) ? NaN : p.i * 100}
            onChange={(v) => update({ i: Number.isNaN(v) ? NaN : v / 100 })}
            step={0.1}
            min={0}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        {variants.map((va, i) => {
          const asset = result.assets.find((a) => a.def.id === `${mod.id}:${va.key}`);
          return (
            <SubStep
              key={va.key}
              index={i}
              title={TIMING_KO[va.timing]}
              badge={asset?.def.code}
              collapsed={va.collapsed ?? false}
              onToggle={() =>
                setVariants(variants.map((x) => (x.key === va.key ? { ...x, collapsed: !x.collapsed } : x)))
              }
              onRemove={() => setVariants(variants.filter((x) => x.key !== va.key))}
              removable={variants.length > 1}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="지급 시점">
                  <SelectInput
                    value={va.timing}
                    onChange={(t) =>
                      setVariants(variants.map((x) => (x.key === va.key ? { ...x, timing: t } : x)))
                    }
                    options={TIMING}
                  />
                </Field>
              </div>
            </SubStep>
          );
        })}
        <button
          type="button"
          onClick={() => setVariants([...variants, { key: newSubKey(), timing: "end" }])}
          className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-[var(--primary)] hover:text-primary"
        >
          ＋ 현가율 소단계 추가
        </button>
      </div>

      {columns.length > 0 && <DataGrid columns={columns} />}
    </div>
  );
}
