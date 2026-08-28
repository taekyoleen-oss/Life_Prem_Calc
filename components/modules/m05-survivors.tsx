"use client";

import type { DecrementCombine, M05Params, M05Variant } from "@/types/modules";
import { AssetMultiPicker } from "@/components/assets/AssetPicker";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field, NumInput, SelectInput } from "./fields";
import { SubStep, newSubKey } from "./SubStep";
import type { ModuleFormProps } from "./types";

/** 구버전 평면 파라미터를 소단계 목록으로 정규화 (계산 레이어와 동일 규칙) */
function normalize(
  p: M05Params & { qAssetIds?: string[]; l0?: number; combine?: DecrementCombine; usage?: "survivors" | "payers" },
): M05Variant[] {
  return (
    p.variants ?? [{
      key: "l",
      usage: p.usage ?? "survivors",
      qAssetIds: p.qAssetIds ?? [],
      l0: p.l0 ?? 100_000,
      combine: p.combine ?? "single",
    }]
  );
}

export function M05Survivors({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M05Params;
  const variants = normalize(p);
  const tables = upstream.filter((a) => a.tag === "rate");

  const setVariants = (next: M05Variant[]) =>
    update({ variants: next, qAssetIds: undefined, l0: undefined, combine: undefined, usage: undefined });
  const patchVariant = (key: string, patch: Partial<M05Variant>) =>
    setVariants(variants.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const seriesAssets = result.assets.filter((a) => Array.isArray(a.value));
  const columns: GridColumn[] =
    seriesAssets.length > 0 && contract
      ? [
          { label: "t", values: (seriesAssets[0].value as number[]).map((_, t) => t) },
          { label: "연령", values: (seriesAssets[0].value as number[]).map((_, t) => contract.age + t) },
          ...seriesAssets.map((a) => ({ label: a.def.code, values: a.value as number[], digits: 2 })),
        ]
      : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {variants.map((va, i) => {
          const asset = result.assets.find((a) => a.def.id === `${mod.id}:${va.key}`);
          return (
            <SubStep
              key={va.key}
              index={i}
              title={va.usage === "payers" ? "납입자수 (lp)" : "생존자수 (l)"}
              badge={asset?.def.code}
              collapsed={va.collapsed ?? false}
              onToggle={() => patchVariant(va.key, { collapsed: !va.collapsed })}
              onRemove={() => setVariants(variants.filter((x) => x.key !== va.key))}
              removable={variants.length > 1}
            >
              <div className="flex flex-col gap-3">
                <Field label="탈퇴원인 q 계열 (다중 선택)">
                  <AssetMultiPicker
                    assets={tables}
                    values={va.qAssetIds}
                    onChange={(ids) => patchVariant(va.key, { qAssetIds: ids })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="기수 l0">
                    <NumInput value={va.l0} onChange={(v) => patchVariant(va.key, { l0: v })} min={1} />
                  </Field>
                  <Field
                    label="결합 방식"
                    hint={va.qAssetIds.length > 1 ? "복수 원인 — 독립 가정 근사(§3.2.1)" : undefined}
                  >
                    <SelectInput
                      value={va.combine}
                      onChange={(v) => patchVariant(va.key, { combine: v })}
                      options={[
                        { value: "single", label: "단일탈퇴" },
                        { value: "independent", label: "독립 곱 (복수 원인 기본)" },
                        { value: "sum", label: "단순 합산 (교육용 근사)" },
                      ]}
                    />
                  </Field>
                  <Field
                    label="용도"
                    hint={va.usage === "payers" ? "예: 사망률 + 면제사유율을 함께 선택해 납입자수 산출" : undefined}
                  >
                    <SelectInput
                      value={va.usage}
                      onChange={(v) => patchVariant(va.key, { usage: v })}
                      options={[
                        { value: "survivors", label: "생존자수 (l)" },
                        { value: "payers", label: "납입자수 (lp)" },
                      ]}
                    />
                  </Field>
                </div>
              </div>
            </SubStep>
          );
        })}
        <button
          type="button"
          onClick={() =>
            setVariants([
              ...variants,
              {
                key: newSubKey(),
                usage: variants.some((x) => x.usage === "survivors") ? "payers" : "survivors",
                qAssetIds: [...(variants[0]?.qAssetIds ?? [])],
                l0: variants[0]?.l0 ?? 100_000,
                combine: "single",
              },
            ])
          }
          className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-[var(--primary)] hover:text-primary"
        >
          ＋ 소단계 추가 (예: 납입면제 반영 납입자수)
        </button>
      </div>

      {columns.length > 0 && <DataGrid columns={columns} />}
    </div>
  );
}
