"use client";

import { useMemo, type ComponentType } from "react";
import Link from "next/link";
import type { AssetNameOverride, ModuleTypeId } from "@/types/modules";
import { computeSheet, MODULE_CATALOG, REF_FIELD_LABEL, repairRefs } from "@/lib/engine/pipeline";
import { useWorkbook, type ProductPreset } from "@/lib/store/workbook";
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
 * 페이지(body) 스크롤 + 좌 진행 레일·우 결과 패널 sticky 고정:
 * 커서가 어디에 있어도 휠로 아래로 이동할 수 있고, 내용을 내려도
 * 진행 단계·결과가 항상 보인다. 레일에서 단계를 선택하면 해당 카드가
 * 화면 중앙에 오도록 스크롤한다.
 */
export function Workspace() {
  const {
    pipeline,
    expandedId,
    applyPreset,
    addModule,
    addModuleAt,
    moveModule,
    reconnectRefs,
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link href="/" className="text-lg font-bold text-primary">
          PremiaFlow
        </Link>
        <span className="text-sm text-muted-foreground">게스트 워크북 · 보험료 산출 파이프라인</span>
      </header>

      <div className="flex items-start">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border bg-card px-3 py-4 md:block">
          <ProgressRail
            pipeline={pipeline}
            computation={computation}
            expandedId={expandedId}
            onSelect={selectAndCenter}
            onMove={moveModule}
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

        <main className="min-w-0 flex-1 px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {pipeline.length === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
                <h2 className="text-lg font-bold">산출할 종목을 선택하세요</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  종목을 선택하면 표준 산출 플로우의 모든 과정이 한 번에 구성됩니다.
                  이후 단계 추가·순서 변경·변수 추가·이름 변경으로 자유롭게 변형하세요.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {(
                    [
                      { kind: "term", label: "정기보험", desc: "사망급부" },
                      { kind: "endowment", label: "생사혼합", desc: "사망 + 만기급부" },
                      { kind: "pure", label: "순수생존", desc: "만기(생존)급부" },
                    ] as { kind: ProductPreset; label: string; desc: string }[]
                  ).map((o) => (
                    <button
                      key={o.kind}
                      type="button"
                      onClick={() => applyPreset(o.kind)}
                      className="rounded-lg border border-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      {o.label}
                      <span className="block text-[11px] font-normal opacity-80">{o.desc}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => addModule("M01")}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-secondary"
                  >
                    직접 구성
                    <span className="block text-[11px] font-normal opacity-80">빈 파이프라인에서 시작</span>
                  </button>
                </div>
              </div>
            )}

            {pipeline.map((mod, i) => {
              const result =
                computation.results[mod.id] ?? { status: "idle" as const, assets: [], summary: [] };
              const upstream = pipeline
                .slice(0, i)
                .flatMap((m) => computation.results[m.id]?.assets ?? []);
              const Form = FORMS[mod.type];
              // 이동·삭제·삽입으로 참조 수정이 필요하면 자동 재연결 제안 (§3.9 보강)
              const refPatch = result.status !== "done" ? repairRefs(mod, upstream) : null;
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
                      {refPatch && (
                        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--primary)]/40 bg-primary/5 px-3 py-2 text-sm">
                          <span>
                            참조 수정이 필요합니다:{" "}
                            {Object.keys(refPatch)
                              .map((f) => REF_FIELD_LABEL[f] ?? f)
                              .join(", ")}
                          </span>
                          <button
                            type="button"
                            onClick={() => reconnectRefs(mod.id)}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                          >
                            상류 자산으로 자동 재연결
                          </button>
                          <span className="text-xs text-muted-foreground">
                            또는 아래에서 직접 선택하세요.
                          </span>
                        </div>
                      )}
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

        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-80 shrink-0 overflow-y-auto border-l border-border bg-[var(--background)] px-4 py-4 xl:block">
          <ResultPanel computation={computation} moduleCount={pipeline.length} onReset={reset} />
        </aside>
      </div>
    </div>
  );
}
