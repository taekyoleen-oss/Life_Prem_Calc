"use client";

import type { M04Params } from "@/types/modules";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field, NumInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M04Interest({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M04Params;
  const vp = result.assets[0]?.value as number[] | undefined;

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
      </div>
      {vp && contract && (
        <DataGrid
          columns={[
            { label: "t", values: vp.map((_, t) => t) },
            { label: "연령", values: vp.map((_, t) => contract.age + t) },
            { label: "v^t", values: vp, digits: 6 },
          ]}
        />
      )}
    </div>
  );
}
