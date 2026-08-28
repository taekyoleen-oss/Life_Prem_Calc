"use client";

import type { M05Params } from "@/types/modules";
import { AssetMultiPicker } from "@/components/assets/AssetPicker";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field, NumInput, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M05Survivors({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M05Params;
  const tables = upstream.filter((a) => a.def.kind === "table");
  const l = result.assets[0]?.value as number[] | undefined;

  return (
    <div className="flex flex-col gap-3">
      <Field label="탈퇴원인 q 계열 (다중 선택)">
        <AssetMultiPicker
          assets={tables}
          values={p.qAssetIds}
          onChange={(ids) => update({ qAssetIds: ids })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="기수 l0">
          <NumInput value={p.l0} onChange={(v) => update({ l0: v })} min={1} />
        </Field>
        <Field label="결합 방식" hint={p.qAssetIds.length > 1 ? "복수 원인 — 독립 가정 근사(§3.2.1)" : undefined}>
          <SelectInput
            value={p.combine}
            onChange={(v) => update({ combine: v })}
            options={[
              { value: "single", label: "단일탈퇴" },
              { value: "independent", label: "독립 곱 (복수 원인 기본)" },
              { value: "sum", label: "단순 합산 (교육용 근사)" },
            ]}
          />
        </Field>
        <Field label="용도">
          <SelectInput
            value={p.usage}
            onChange={(v) => update({ usage: v })}
            options={[
              { value: "survivors", label: "생존자수 (l)" },
              { value: "payers", label: "납입자수 (lp)" },
            ]}
          />
        </Field>
      </div>
      {l && contract && (
        <DataGrid
          columns={[
            { label: "t", values: l.map((_, t) => t) },
            { label: "연령", values: l.map((_, t) => contract.age + t) },
            { label: result.assets[0].def.code, values: l, digits: 2 },
          ]}
        />
      )}
    </div>
  );
}
