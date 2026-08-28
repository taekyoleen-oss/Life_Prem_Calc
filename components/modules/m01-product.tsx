"use client";

import type { M01Params } from "@/types/modules";
import { Field, SelectInput, TextInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M01Product({ mod, update }: ModuleFormProps) {
  const p = mod.params as unknown as M01Params;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="상품명">
        <TextInput
          value={p.productName}
          onChange={(v) => update({ productName: v })}
          placeholder="예: 무배당 정기보험 예제"
        />
      </Field>
      <Field label="상품유형">
        <SelectInput
          value={p.productType}
          onChange={(v) => update({ productType: v })}
          options={[
            { value: "term", label: "정기(사망보장)" },
            { value: "endowment", label: "생사혼합" },
            { value: "pure", label: "순수생존" },
            { value: "other", label: "기타" },
          ]}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="메모">
          <TextInput value={p.memo} onChange={(v) => update({ memo: v })} placeholder="선택 입력" />
        </Field>
      </div>
    </div>
  );
}
