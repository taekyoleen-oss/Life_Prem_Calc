"use client";

import { useMemo, type ComponentType } from "react";
import Link from "next/link";
import type { AssetNameOverride, ModuleTypeId } from "@/types/modules";
import { computeSheet, MODULE_CATALOG } from "@/lib/engine/pipeline";
import { useWorkbook } from "@/lib/store/workbook";
import { StepCard } from "./StepCard";
import { NextStep } from "./NextStep";
import { ProgressRail } from "./ProgressRail";
import { ResultPanel } from "./ResultPanel";
import { AssetNameEditor } from "@/components/assets/AssetNameEditor";
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

/**
 * 게스트 작업공간 (§3.1, §5.4).
 * 3분할 고정 레이아웃: 좌 진행 레일·중앙 스텝 카드·우 결과 패널이 각각
 * 독립 스크롤되어, 내용을 내려도 진행 단계가 항상 보인다.
 * 레일에서 단계를 선택하면 해당 카드가 화면 중앙에 오도록 스크롤한다.
 */
export function Workspace() {
  const {
    pipeline,
    expandedId,
    addModule,
    addModuleAt,
    moveModule,
    updateParams,
    updateTitle,
    removeModule,
    setExpanded,
    reset,
  } = useWorkbook();
  const computation = useMemo(() => computeSheet(pipeline), [pipeline]);

  const selectAndCenter = (id: string) => {
    setExpanded(id);
    // 펼침으로 높이가 바뀐 뒤 중앙 정렬
    setTimeout(() => {
      document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-primary">
            PremiaFlow
          </Link>
          <span className="text-sm text-muted-foreground">게스트 워크북 · 보험료 산출 파이프라인</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-card px-3 py-4 md:block">
          <ProgressRail
            pipeline={pipeline}
            computation={computation}
            expandedId={expandedId}
            onSelect={selectAndCenter}
            onInsert={(index, type) => {
              addModuleAt(index, type);
              // 새 단계 id는 스토어가 expandedId로 잡는다 — 다음 프레임에 중앙 정렬
              setTimeout(() => {
                const id = useWorkbook.getState().expandedId;
                if (id) document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 60);
            }}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {pipeline.length === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
                <h2 className="text-lg font-bold">보험료 산출을 시작하세요</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  상품 기본정보부터 순보험료까지, 엑셀 검증표와 같은 흐름으로 단계를 쌓아갑니다.
                  단계 순서 변경·중간 삽입·변수 이름 지정이 모두 가능합니다.
                </p>
              </div>
            )}

            {pipeline.map((mod, i) => {
              const result =
                computation.results[mod.id] ?? { status: "idle" as const, assets: [], summary: [] };
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
                  title={mod.title ?? MODULE_CATALOG[mod.type].label}
                  onTitleChange={(t) => updateTitle(mod.id, t)}
                  result={result}
                  expanded={expandedId === mod.id}
                  onToggle={() => setExpanded(expandedId === mod.id ? null : mod.id)}
                  onRemove={() => removeModule(mod.id)}
                  onMove={(dir) => moveModule(mod.id, dir)}
                  canMoveUp={i > 0}
                  canMoveDown={i < pipeline.length - 1}
                >
                  {Form ? (
                    <>
                      <Form
                        mod={mod}
                        result={result}
                        upstream={upstream}
                        contract={computation.contract}
                        update={(patch) => updateParams(mod.id, patch)}
                      />
                      <AssetNameEditor
                        assets={result.assets}
                        overrides={(mod.params.assetNames ?? {}) as Record<string, AssetNameOverride>}
                        onChange={(slot, patch) => {
                          const cur = (mod.params.assetNames ?? {}) as Record<string, AssetNameOverride>;
                          updateParams(mod.id, {
                            assetNames: { ...cur, [slot]: { ...cur[slot], ...patch } },
                          });
                        }}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">이후 페이즈에서 제공됩니다.</p>
                  )}
                </StepCard>
              );
            })}

            <NextStep pipeline={pipeline} onAdd={addModule} />
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-[var(--background)] px-4 py-4 xl:block">
          <ResultPanel computation={computation} moduleCount={pipeline.length} onReset={reset} />
        </aside>
      </div>
    </div>
  );
}
