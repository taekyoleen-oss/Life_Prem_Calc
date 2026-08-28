"use client";

import type { M07Params } from "@/types/modules";
import { fmt } from "@/lib/format";
import { AssetPicker } from "@/components/assets/AssetPicker";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field, NumInput, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

export function M07Pv({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M07Params;
  const series = upstream.filter((a) => a.def.kind === "series");
  const vAssets = series.filter((a) => /^v\d+$/.test(a.def.code));
  const targetAssets =
    p.kind === "death"
      ? series.filter((a) => /^d\d+$/.test(a.def.code))
      : series.filter((a) => /^(l|lp)\d+$/.test(a.def.code));

  const terms = result.assets.find((a) => a.def.kind === "series")?.value as number[] | undefined;
  const total = result.assets.find((a) => a.def.kind === "scalar")?.value as number | undefined;

  const cum: number[] = [];
  if (terms) {
    let acc = 0;
    for (const x of terms) {
      acc += x;
      cum.push(acc);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="현가 유형">
          <SelectInput
            value={p.kind}
            onChange={(v) =>
              update({
                kind: v,
                // 유형 변경 시 대상 계열 초기화 (l↔d 참조가 다르다)
                seriesAssetId: null,
              })
            }
            options={[
              { value: "income", label: "수입현가 (보험료 1원)" },
              { value: "death", label: "지급현가 — 사망·발생급부" },
              { value: "maturity", label: "지급현가 — 만기·생존급부" },
            ]}
          />
        </Field>
        <Field label={p.kind === "death" ? "대상 d 계열" : p.kind === "maturity" ? "대상 l 계열" : "대상 lp·l 계열"}>
          <AssetPicker
            assets={targetAssets}
            value={p.seriesAssetId}
            onChange={(id) => update({ seriesAssetId: id })}
          />
        </Field>
        <Field label="현가율 v 계열">
          <AssetPicker
            assets={vAssets}
            value={p.vAssetId}
            onChange={(id) => update({ vAssetId: id })}
          />
        </Field>
        {p.kind === "death" && (
          <Field label="지급 시점">
            <SelectInput
              value={p.timing}
              onChange={(v) => update({ timing: v })}
              options={[
                { value: "end", label: "연말 (기본)" },
                { value: "mid", label: "연중" },
                { value: "begin", label: "연시" },
              ]}
            />
          </Field>
        )}
        {p.kind === "income" && (
          <Field label="지급 시점">
            <SelectInput value="begin" onChange={() => {}} options={[{ value: "begin", label: "연시 (고정)" }]} />
          </Field>
        )}
        {p.kind !== "income" && (
          <>
            <Field label="급부금액">
              <SelectInput
                value={p.amountMode}
                onChange={(v) => update({ amountMode: v })}
                options={[
                  { value: "S", label: "가입금액 S 참조" },
                  { value: "custom", label: "직접 입력" },
                ]}
              />
            </Field>
            {p.amountMode === "custom" && (
              <Field label="급부금액 (원)">
                <NumInput value={p.customAmount} onChange={(v) => update({ customAmount: v })} min={0} />
              </Field>
            )}
          </>
        )}
      </div>
      {terms && contract && (
        <DataGrid
          columns={[
            { label: "t", values: terms.map((_, t) => t) },
            { label: "연령", values: terms.map((_, t) => contract.age + t) },
            { label: "연도별 현가", values: terms, digits: 2 },
            { label: "누계", values: cum, digits: 2 },
          ]}
        />
      )}
      {total !== undefined && (
        <p className="text-sm">
          합계&nbsp;
          <span className="font-semibold tabular">{fmt(total, 2)}</span>
          <span className="ml-1 text-xs text-muted-foreground">(기수 집단 총액 — 1건당 환산은 M08)</span>
        </p>
      )}
    </div>
  );
}
