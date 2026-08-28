"use client";

import type { M03Params } from "@/types/modules";
import { RATE_LIBRARY, type RateTable } from "@/lib/engine/pipeline";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M03Rates({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M03Params;
  const lib = RATE_LIBRARY[p.libraryKey];
  const table = result.assets[0]?.value as RateTable | undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="위험률 선택 (공용 라이브러리)" hint="파일 업로드·붙여넣기는 P3에서 제공">
          <SelectInput
            value={p.libraryKey}
            onChange={(v) => update({ libraryKey: v })}
            options={[
              { value: "male", label: "더미 사망률(남)" },
              { value: "female", label: "더미 사망률(여)" },
              { value: "diagnosis", label: "더미 진단률" },
            ]}
          />
        </Field>
        <div className="flex items-end pb-1">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${
              lib.isMortality
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {lib.isMortality ? "사망률 ○ — 사망급부 계산에 사용 가능" : "사망률 ✕ — 발생률(진단 등)"}
          </span>
        </div>
      </div>
      {table && (
        <div>
          {contract && (
            <p className="mb-1 text-xs text-muted-foreground">
              계약 적용 구간: {contract.age}세 ~ {contract.age + contract.years - 1}세
            </p>
          )}
          <DataGrid
            columns={[
              { label: "연령", values: table.values.map((_, i) => table.startAge + i) },
              { label: "q", values: table.values, digits: 6 },
            ]}
            maxHeightClass="max-h-56"
          />
        </div>
      )}
    </div>
  );
}
