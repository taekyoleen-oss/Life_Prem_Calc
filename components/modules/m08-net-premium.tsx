"use client";

import type { M02Params, M08Params } from "@/types/modules";
import { roundPremium } from "@/lib/engine/premium";
import { fmt } from "@/lib/format";
import { AssetMultiPicker, AssetPicker } from "@/components/assets/AssetPicker";
import { Field } from "./fields";
import type { ModuleFormProps } from "./types";

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? "border-[var(--primary)] bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular ${strong ? "text-lg font-bold text-primary" : "text-sm font-semibold"}`}>{value}</p>
    </div>
  );
}

export function M08NetPremium({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M08Params;
  const pvinAssets = upstream.filter((a) => a.tag === "pv_in");
  const pvoutAssets = upstream.filter((a) => a.tag === "pv_out");
  const lAssets = upstream.filter((a) => a.tag === "survivors");

  const pAnnual = result.assets.find((a) => a.def.code === "p_annual")?.value as number | undefined;
  const nsp = result.assets.find((a) => a.def.code === "nsp")?.value as number | undefined;
  const c = contract as M02Params | null;

  const sum = (ids: string[]) =>
    upstream
      .filter((a) => ids.includes(a.def.id) && typeof a.value === "number")
      .reduce((acc, a) => acc + (a.value as number), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="수입현가 (합산)">
          <AssetMultiPicker
            assets={pvinAssets}
            values={p.incomeAssetIds}
            onChange={(ids) => update({ incomeAssetIds: ids })}
            emptyText="수입현가 자산이 없습니다 — M07(수입현가)을 먼저 완료하세요."
          />
        </Field>
        <Field label="지급현가 (합산)">
          <AssetMultiPicker
            assets={pvoutAssets}
            values={p.outgoAssetIds}
            onChange={(ids) => update({ outgoAssetIds: ids })}
            emptyText="지급현가 자산이 없습니다 — M07(지급현가)을 먼저 완료하세요."
          />
        </Field>
        <Field label="NSP 기준 생존자수 계열" hint="l_x = 계열 첫 값">
          <AssetPicker assets={lAssets} value={p.lAssetId} onChange={(id) => update({ lAssetId: id })} />
        </Field>
      </div>

      <div className="rounded-lg bg-secondary/50 p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">산식 (수지상등)</p>
        <p className="font-mono text-sm">
          P = 지급현가 총합 ÷ 수입현가 총합&nbsp;&nbsp;·&nbsp;&nbsp;NSP = 지급현가 총합 ÷ l<sub>x</sub>
        </p>
      </div>

      {result.status === "done" && pAnnual !== undefined && c && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="수입현가 합" value={fmt(sum(p.incomeAssetIds), 2)} />
          <Stat label="지급현가 합" value={fmt(sum(p.outgoAssetIds), 2)} />
          {nsp !== undefined && <Stat label="일시납 순보험료 NSP" value={`${fmt(nsp, 2)}원`} />}
          <Stat label="연납 순보험료 P" value={`${fmt(pAnnual, 2)}원`} />
          <Stat
            label={`단수처리 후 (${{ round: "반올림", floor: "절사", ceil: "올림" }[c.roundMode]})`}
            value={`${fmt(roundPremium(pAnnual, c.roundDigit, c.roundMode))}원`}
            strong
          />
        </div>
      )}
    </div>
  );
}
