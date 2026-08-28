"use client";

import type { M09Params } from "@/types/modules";
import { fmt } from "@/lib/format";
import { AssetMultiPicker, AssetPicker } from "@/components/assets/AssetPicker";
import { Field, NumInput, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? "border-[var(--primary)] bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular ${strong ? "text-lg font-bold text-primary" : "text-sm font-semibold"}`}>{value}</p>
    </div>
  );
}

/** % 입력 (내부는 소수 저장) */
function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <NumInput
      value={Number.isNaN(value) ? NaN : value * 100}
      onChange={(v) => onChange(Number.isNaN(v) ? NaN : v / 100)}
      step={0.1}
      min={0}
    />
  );
}

export function M09Expense({ mod, result, upstream, update }: ModuleFormProps) {
  const p = mod.params as unknown as M09Params;
  const pvinAssets = upstream.filter((a) => a.tag === "pv_in");
  const pvoutAssets = upstream.filter((a) => a.tag === "pv_out");
  const lAssets = upstream.filter((a) => a.tag === "survivors");
  const vAssets = upstream.filter((a) => a.tag === "discount");

  const G = result.assets.find((a) => a.def.code === "g_annual")?.value as number | undefined;
  const ex = result.extra ?? {};

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="방식">
          <SelectInput
            value={p.method}
            onChange={(v) => update({ method: v })}
            options={[
              { value: "A", label: "A — 3이원 수지상등 확장" },
              { value: "B", label: "B — 단순 부가율" },
            ]}
          />
        </Field>
        {p.method === "A" ? (
          <>
            <Field label="α 신계약비 (%)" hint="가입금액 대비, 계약 시 1회">
              <PctInput value={p.alpha} onChange={(v) => update({ alpha: v })} />
            </Field>
            <Field label="β 유지비 (%)" hint="가입금액 대비 연간, 보험기간 연시">
              <PctInput value={p.beta} onChange={(v) => update({ beta: v })} />
            </Field>
            <Field label="γ 수금비 (%)" hint="영업보험료 대비, 납입기간">
              <PctInput value={p.gamma} onChange={(v) => update({ gamma: v })} />
            </Field>
          </>
        ) : (
          <Field label="부가율 k (%)" hint="G = P ÷ (1 − k)">
            <PctInput value={p.loadingK} onChange={(v) => update({ loadingK: v })} />
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="수입현가 (합산)">
          <AssetMultiPicker
            assets={pvinAssets}
            values={p.incomeAssetIds}
            onChange={(ids) => update({ incomeAssetIds: ids })}
          />
        </Field>
        <Field label="지급현가 (합산)">
          <AssetMultiPicker
            assets={pvoutAssets}
            values={p.outgoAssetIds}
            onChange={(ids) => update({ outgoAssetIds: ids })}
          />
        </Field>
        {p.method === "A" && (
          <>
            <Field label="생존자수 계열 (E·l0)">
              <AssetPicker assets={lAssets} value={p.lAssetId} onChange={(id) => update({ lAssetId: id })} />
            </Field>
            <Field label="현가율 v 계열 (E)">
              <AssetPicker assets={vAssets} value={p.vAssetId} onChange={(id) => update({ vAssetId: id })} />
            </Field>
          </>
        )}
      </div>

      <div className="rounded-lg bg-secondary/50 p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">산식</p>
        <p className="font-mono text-sm">
          {p.method === "A"
            ? "G·PVin = PVout + α·S·l₀ + β·S·Σl·vᵗ + γ·G·PVin"
            : "G = P ÷ (1 − k)"}
        </p>
      </div>

      {result.status === "done" && G !== undefined && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="연납 영업보험료 G" value={`${fmt(G, 2)}원`} strong />
          {ex.loadingAlpha !== undefined && <Stat label="신계약비 (α)" value={`${fmt(ex.loadingAlpha, 2)}원`} />}
          {ex.loadingBeta !== undefined && <Stat label="유지비 (β)" value={`${fmt(ex.loadingBeta, 2)}원`} />}
          {ex.loadingGamma !== undefined && <Stat label="수금비 (γ)" value={`${fmt(ex.loadingGamma, 2)}원`} />}
          {ex.loadingTotal !== undefined && <Stat label="부가보험료 합" value={`${fmt(ex.loadingTotal, 2)}원`} />}
        </div>
      )}
    </div>
  );
}
