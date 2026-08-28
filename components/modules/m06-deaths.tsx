"use client";

import type { M06Params } from "@/types/modules";
import type { RateTable } from "@/lib/engine/pipeline";
import { AssetPicker } from "@/components/assets/AssetPicker";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field } from "./fields";
import type { ModuleFormProps } from "./types";

export function M06Deaths({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M06Params;
  const seriesAssets = upstream.filter((a) => a.tag === "survivors" || a.tag === "payers");
  const tables = upstream.filter((a) => a.tag === "rate");
  const d = result.assets[0]?.value as number[] | undefined;

  const lAsset = upstream.find((a) => a.def.id === p.lAssetId);
  const qAsset = upstream.find((a) => a.def.id === p.qAssetId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="대상 l 계열">
          <AssetPicker
            assets={seriesAssets}
            value={p.lAssetId}
            onChange={(id) => update({ lAssetId: id })}
          />
        </Field>
        <Field label="대상 q 계열" hint="d = l × q">
          <AssetPicker
            assets={tables}
            value={p.qAssetId}
            onChange={(id) => update({ qAssetId: id })}
          />
        </Field>
      </div>
      {d && contract && lAsset && qAsset && (
        <DataGrid
          columns={[
            { label: "t", values: d.map((_, t) => t) },
            { label: "연령", values: d.map((_, t) => contract.age + t) },
            { label: lAsset.def.code, values: (lAsset.value as number[]).slice(0, d.length), digits: 2 },
            {
              label: qAsset.def.code,
              values: (qAsset.value as RateTable).values.slice(
                contract.age - (qAsset.value as RateTable).startAge,
                contract.age - (qAsset.value as RateTable).startAge + d.length,
              ),
              digits: 6,
            },
            { label: result.assets[0].def.code, values: d, digits: 2 },
          ]}
        />
      )}
    </div>
  );
}
