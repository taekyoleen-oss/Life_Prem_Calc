"use client";

import type { M03Params } from "@/types/modules";
import { RATE_LIBRARY, type RateTable } from "@/lib/engine/pipeline";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field } from "./fields";
import type { ModuleFormProps } from "./types";

const KEYS = ["male", "female", "diagnosis"] as const;

export function M03Rates({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M03Params & { libraryKey?: (typeof KEYS)[number] };
  const selected = p.libraryKeys ?? (p.libraryKey ? [p.libraryKey] : []);

  const toggle = (key: (typeof KEYS)[number], on: boolean) =>
    update({
      // 결정론: 라이브러리 순서 고정
      libraryKeys: KEYS.filter((k) => (k === key ? on : selected.includes(k))),
      libraryKey: undefined,
    });

  const tables = result.assets.filter((a) => a.def.kind === "table");
  const columns: GridColumn[] =
    tables.length > 0
      ? [
          {
            label: "연령",
            values: (tables[0].value as RateTable).values.map(
              (_, i) => (tables[0].value as RateTable).startAge + i,
            ),
          },
          ...tables.map((a) => ({
            label: a.def.code,
            values: (a.value as RateTable).values,
            digits: 6,
          })),
        ]
      : [];

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="위험률 선택 (공용 라이브러리 · 다중 선택)"
        hint="여러 개를 선택하면 한 단계에서 q 계열이 여러 변수로 등록됩니다. 파일 업로드·붙여넣기는 P3에서 제공"
      >
        <div className="flex flex-col gap-1.5 pt-1">
          {KEYS.map((key) => {
            const lib = RATE_LIBRARY[key];
            return (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="font-medium">{lib.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    lib.isMortality
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {lib.isMortality ? "사망률" : "발생률"}
                </span>
              </label>
            );
          })}
        </div>
      </Field>
      {columns.length > 0 && (
        <div>
          {contract && (
            <p className="mb-1 text-xs text-muted-foreground">
              계약 적용 구간: {contract.age}세 ~ {contract.age + contract.years - 1}세
            </p>
          )}
          <DataGrid columns={columns} maxHeightClass="max-h-56" />
        </div>
      )}
    </div>
  );
}
