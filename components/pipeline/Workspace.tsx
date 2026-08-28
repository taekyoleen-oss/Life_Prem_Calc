"use client";

import { useMemo, type ComponentType } from "react";
import Link from "next/link";
import type { ModuleTypeId } from "@/types/modules";
import { computeSheet, MODULE_CATALOG } from "@/lib/engine/pipeline";
import { useWorkbook } from "@/lib/store/workbook";
import { StepCard } from "./StepCard";
import { NextStep } from "./NextStep";
import { ProgressRail } from "./ProgressRail";
import { ResultPanel } from "./ResultPanel";
import type { ModuleFormProps } from "@/components/modules/types";
import { M01Product } from "@/components/modules/m01-product";
import { M02Contract } from "@/components/modules/m02-contract";
import { M03Rates } from "@/components/modules/m03-rates";
import { M04Interest } from "@/components/modules/m04-interest";
import { M05Survivors } from "@/components/modules/m05-survivors";
import { M06Deaths } from "@/components/modules/m06-deaths";
import { M07Pv } from "@/components/modules/m07-pv";
import { M08NetPremium } from "@/components/modules/m08-net-premium";

const FORMS: Partial<Record<ModuleTypeId, ComponentType<ModuleFormProps>>> = {
  M01: M01Product,
  M02: M02Contract,
  M03: M03Rates,
  M04: M04Interest,
  M05: M05Survivors,
  M06: M06Deaths,
  M07: M07Pv,
  M08: M08NetPremium,
};

/** 게스트 작업공간: 좌 진행 레일 · 중앙 세로 스텝퍼 · 우 결과 패널 (§3.1, §5.4) */
export function Workspace() {
  const { pipeline, expandedId, addModule, updateParams, removeModule, setExpanded, reset } =
    useWorkbook();
  const computation = useMemo(() => computeSheet(pipeline), [pipeline]);

  const selectAndScroll = (id: string) => {
    setExpanded(id);
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-primary">
            PremiaFlow
          </Link>
          <span className="text-sm text-muted-foreground">게스트 워크북 · 보험료 산출 파이프라인</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl items-start gap-6 px-4 py-6">
        <div className="hidden w-48 shrink-0 lg:block">
          <ProgressRail pipeline={pipeline} computation={computation} onSelect={selectAndScroll} />
        </div>

        <main className="min-w-0 flex-1">
          <div className="flex flex-col gap-3">
            {pipeline.length === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
                <h2 className="text-lg font-bold">보험료 산출을 시작하세요</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  상품 기본정보부터 순보험료까지, 엑셀 검증표와 같은 흐름으로 단계를 쌓아갑니다.
                </p>
              </div>
            )}

            {pipeline.map((mod, i) => {
              const result = computation.results[mod.id] ?? { status: "idle" as const, assets: [], summary: [] };
              const upstream = pipeline
                .slice(0, i)
                .flatMap((m) => computation.results[m.id]?.assets ?? []);
              const Form = FORMS[mod.type];
              return (
                <StepCard
                  key={mod.id}
                  index={i}
                  anchorId={`step-${mod.id}`}
                  typeId={mod.type}
                  moduleLabel={mod.title ?? MODULE_CATALOG[mod.type].label}
                  result={result}
                  expanded={expandedId === mod.id}
                  onToggle={() => setExpanded(expandedId === mod.id ? null : mod.id)}
                  onRemove={() => removeModule(mod.id)}
                >
                  {Form ? (
                    <Form
                      mod={mod}
                      result={result}
                      upstream={upstream}
                      contract={computation.contract}
                      update={(patch) => updateParams(mod.id, patch)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">이후 페이즈에서 제공됩니다.</p>
                  )}
                </StepCard>
              );
            })}

            <NextStep pipeline={pipeline} onAdd={addModule} />
          </div>
        </main>

        <div className="hidden w-72 shrink-0 xl:block">
          <ResultPanel computation={computation} moduleCount={pipeline.length} onReset={reset} />
        </div>
      </div>
    </div>
  );
}
