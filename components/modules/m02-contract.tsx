"use client";

import type { M02Params } from "@/types/modules";
import { fmt } from "@/lib/format";
import { Field, NumInput, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M02Contract({ mod, update }: ModuleFormProps) {
  const p = mod.params as unknown as M02Params;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="가입연령 x (세)">
        <NumInput value={p.age} onChange={(v) => update({ age: v })} min={0} max={100} step={1} />
      </Field>
      <Field label="성별">
        <SelectInput
          value={p.sex}
          onChange={(v) => update({ sex: v })}
          options={[
            { value: "male", label: "남" },
            { value: "female", label: "여" },
          ]}
        />
      </Field>
      <Field label="납입주기">
        <SelectInput value="annual" onChange={() => {}} options={[{ value: "annual", label: "연납 (v1.0 고정)" }]} />
      </Field>
      <Field label="보험기간 n (년)">
        <NumInput value={p.years} onChange={(v) => update({ years: v })} min={1} step={1} />
      </Field>
      <Field label="납입기간 m (년)">
        <NumInput value={p.payYears} onChange={(v) => update({ payYears: v })} min={1} step={1} />
      </Field>
      <Field
        label="가입금액 S (원)"
        hint={Number.isNaN(p.sumAssured) ? undefined : `= ${fmt(p.sumAssured)}원`}
      >
        <NumInput value={p.sumAssured} onChange={(v) => update({ sumAssured: v })} min={0} />
      </Field>
      <Field label="단수처리 자리">
        <SelectInput
          value={String(p.roundDigit) as "0" | "1" | "2" | "3"}
          onChange={(v) => update({ roundDigit: Number(v) })}
          options={[
            { value: "0", label: "원 단위" },
            { value: "1", label: "십원 단위" },
            { value: "2", label: "백원 단위" },
            { value: "3", label: "천원 단위" },
          ]}
        />
      </Field>
      <Field label="단수처리 방식" hint="최종 보험료에만 적용 — 중간 계산은 반올림하지 않는다">
        <SelectInput
          value={p.roundMode}
          onChange={(v) => update({ roundMode: v })}
          options={[
            { value: "round", label: "반올림" },
            { value: "floor", label: "절사" },
            { value: "ceil", label: "올림" },
          ]}
        />
      </Field>
    </div>
  );
}
