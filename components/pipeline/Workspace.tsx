"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import type { AssetNameOverride, ModuleTypeId } from "@/types/modules";
import { computeWorkbook, MODULE_CATALOG, REF_FIELD_LABEL, repairRefs } from "@/lib/engine/pipeline";
import { buildCodegenInput, generatePython, generatePythonModule } from "@/lib/codegen/python";
import { generateVba } from "@/lib/codegen/vba";
import { MODULE_HELP } from "@/content/module-help";
import { useWorkbook, type ProductPreset } from "@/lib/store/workbook";
import { CodePanel } from "@/components/codegen/CodePanel";
import { CloudControls } from "./CloudControls";
import { StepCard } from "./StepCard";
import { NextStep } from "./NextStep";
import { ProgressRail } from "./ProgressRail";
import { ResultPanel } from "./ResultPanel";
import { SheetTabs } from "./SheetTabs";
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
import { M09Expense } from "@/components/modules/m09-expense";
import { M10Formula } from "@/components/modules/m10-formula";
import { M11Output } from "@/components/modules/m11-output";

const FORMS: Partial<Record<ModuleTypeId, ComponentType<ModuleFormProps>>> = {
  M01: M01Product,
  M02: M02Contract,
  M03: M03Rates,
  M04: M04Interest,
  M05: M05Survivors,
  M06: M06Deaths,
  M07: M07Pv,
  M08: M08NetPremium,
  M09: M09Expense,
  M10: M10Formula,
  M11: M11Output,
};

function download(filename: string, text: string, mime: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 게스트 작업공간 (§2.3, §3.1, §5.4).
 * 시트 탭(공용탭 + 일반 탭) × 3분할: 페이지(body) 스크롤 + 좌 진행 레일·우 결과
 * 패널 sticky 고정. 공용탭 자산은 모든 일반 탭의 참조 후보에 나타나고,
 * 공용탭 수정 시 참조 탭 전체가 자동 재계산된다.
 */
export function Workspace() {
  const {
    sheets,
    activeSheetId,
    expandedId,
    setActiveSheet,
    addSheet,
    duplicateSheet,
    removeSheet,
    renameSheet,
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

  const [lectureMode, setLectureMode] = useState(false);
  const computations = useMemo(() => computeWorkbook(sheets), [sheets]);
  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  const computation = computations[activeSheet.id];
  const pipeline = activeSheet.pipeline;
  const sharedSheet = sheets.find((s) => s.sheetType === "shared");
  const sharedAssets =
    activeSheet.sheetType === "normal" && sharedSheet
      ? (computations[sharedSheet.id]?.assets ?? [])
      : [];
  const codegenInput = useMemo(
    () =>
      buildCodegenInput(
        activeSheet,
        activeSheet.sheetType === "normal" ? (sharedSheet ?? null) : null,
        computation,
        sharedSheet ? (computations[sharedSheet.id] ?? null) : null,
      ),
    [activeSheet, sharedSheet, computation, computations],
  );

  const exportCode = (kind: "py" | "bas") => {
    try {
      const text = kind === "py" ? generatePython(codegenInput) : generateVba(codegenInput);
      download(`premiaflow_${activeSheet.name}.${kind}`, text, "text/plain");
    } catch (e) {
      window.alert(`코드 생성 실패: ${e instanceof Error ? e.message : e}`);
    }
  };

  const selectAndCenter = (id: string) => {
    setExpanded(id);
    // 펼침으로 높이가 바뀐 뒤 중앙 정렬
    setTimeout(() => {
      document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  // localStorage 복원 (마운트 1회) — 이후 변경은 자동 저장
  const hydrate = useWorkbook((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 키보드 단계 이동 (P5 접근성): Alt + ↑/↓
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      const s = useWorkbook.getState();
      const sheet = s.sheets.find((sh) => sh.id === s.activeSheetId);
      if (!sheet || sheet.pipeline.length === 0) return;
      e.preventDefault();
      const idx = sheet.pipeline.findIndex((m) => m.id === s.expandedId);
      const next =
        e.key === "ArrowDown"
          ? Math.min(idx + 1, sheet.pipeline.length - 1)
          : Math.max(idx - 1, 0);
      const target = sheet.pipeline[next]?.id;
      if (!target) return;
      s.setExpanded(target);
      setTimeout(() => {
        document.getElementById(`step-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link href="/" className="text-lg font-bold text-primary">
          PremiaFlow
        </Link>
        <span className="text-sm text-muted-foreground">게스트 워크북 · 보험료 산출 파이프라인</span>
        <span className="ml-auto flex items-center gap-1.5">
          <CloudControls />
          <button
            type="button"
            onClick={() => setLectureMode((v) => !v)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              lectureMode
                ? "border-[var(--primary)] bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
            title="모든 단계의 교육 설명을 펼쳐 표시"
          >
            강의 모드 {lectureMode ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => exportCode("py")}
            className="rounded-md border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:bg-secondary"
            title="현재 탭 전체 Python 스크립트 (.py)"
          >
            .py
          </button>
          <button
            type="button"
            onClick={() => exportCode("bas")}
            className="rounded-md border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:bg-secondary"
            title="현재 탭 전체 VBA 모듈 (.bas)"
          >
            .bas
          </button>
        </span>
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
              setTimeout(() => {
                const id = useWorkbook.getState().expandedId;
                if (id) document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 60);
            }}
          />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <SheetTabs
              sheets={sheets}
              activeSheetId={activeSheetId}
              onSelect={setActiveSheet}
              onAdd={addSheet}
              onDuplicate={duplicateSheet}
              onRemove={removeSheet}
              onRename={renameSheet}
            />

            {activeSheet.sheetType === "shared" && (
              <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                공용탭 — 여기서 만든 자산(계약조건·위험률·현가율 등)은 모든 탭에서 참조할 수
                있습니다. 주계약·특약이 공유하는 기초를 두는 곳입니다.
              </p>
            )}

            {pipeline.length === 0 && (
              <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
                <h2 className="text-lg font-bold">산출할 종목을 선택하세요</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  종목을 선택하면 표준 산출 플로우의 모든 과정이 한 번에 구성됩니다.
                  이후 단계 추가·순서 변경·소단계·변수 이름 변경으로 자유롭게 변형하세요.
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
              const upstream = [
                ...sharedAssets,
                ...pipeline.slice(0, i).flatMap((m) => computation.results[m.id]?.assets ?? []),
              ];
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
                  help={MODULE_HELP[mod.type]}
                  lectureMode={lectureMode}
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
                      {result.status === "done" && (
                        <CodePanel
                          snippet={(() => {
                            try {
                              return generatePythonModule(codegenInput, mod.id);
                            } catch (e) {
                              return `# 코드 생성 실패: ${e instanceof Error ? e.message : e}`;
                            }
                          })()}
                        />
                      )}
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
          <ResultPanel
            computation={computation}
            moduleCount={pipeline.length}
            sheetName={activeSheet.name}
            isShared={activeSheet.sheetType === "shared"}
            onReset={reset}
          />
        </aside>
      </div>
    </div>
  );
}
