"use client";

import { useState } from "react";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";
import { MODULE_CATALOG, type SheetComputation } from "@/lib/engine/pipeline";

const DOT: Record<string, string> = {
  done: "bg-success",
  editing: "bg-warning",
  stale: "bg-warning",
  error: "bg-destructive",
  idle: "bg-border",
};

function addableTypes(pipeline: ModuleInstance[]): ModuleTypeId[] {
  const present = new Set(pipeline.map((m) => m.type));
  return (Object.keys(MODULE_CATALOG) as ModuleTypeId[]).filter((t) => {
    const meta = MODULE_CATALOG[t];
    return meta.available && (meta.repeatable || !present.has(t));
  });
}

/** 삽입 위치용 모듈 선택 목록 */
function ModulePicker({
  pipeline,
  onPick,
  onClose,
}: {
  pipeline: ModuleInstance[];
  onPick: (type: ModuleTypeId) => void;
  onClose: () => void;
}) {
  return (
    <div className="my-1 rounded-lg border border-[var(--primary)] bg-card p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">추가할 단계 선택</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-[11px] text-muted-foreground hover:bg-secondary"
        >
          닫기
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {addableTypes(pipeline).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="flex items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-secondary"
          >
            <span className="font-mono text-[10px] text-muted-foreground">{t}</span>
            <span className="font-medium">{MODULE_CATALOG[t].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 좌측 고정 진행 레일 (§3.1): 항상 보이는 별도 컬럼.
 * 모듈 목록·상태, 클릭 시 해당 카드가 화면 중앙에 오도록 이동.
 * 각 위치의 ＋로 파이프라인 중간에 단계를 삽입할 수 있다(한국형 유연성).
 */
export function ProgressRail({
  pipeline,
  computation,
  expandedId,
  onSelect,
  onInsert,
}: {
  pipeline: ModuleInstance[];
  computation: SheetComputation;
  expandedId: string | null;
  onSelect: (id: string) => void;
  onInsert: (index: number, type: ModuleTypeId) => void;
}) {
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const gap = (index: number) =>
    insertAt === index ? (
      <ModulePicker
        pipeline={pipeline}
        onPick={(t) => {
          onInsert(index, t);
          setInsertAt(null);
        }}
        onClose={() => setInsertAt(null)}
      />
    ) : (
      <div className="group flex h-3 items-center justify-center">
        <button
          type="button"
          onClick={() => setInsertAt(index)}
          title="이 위치에 단계 삽입"
          className="hidden h-4 w-full items-center justify-center rounded text-[10px] leading-none text-primary hover:bg-primary/10 group-hover:flex"
        >
          ＋ 여기에 삽입
        </button>
      </div>
    );

  return (
    <nav className="flex flex-col">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        진행 단계
      </p>
      {pipeline.length === 0 && (
        <p className="mb-1 text-xs text-muted-foreground">아직 단계가 없습니다.</p>
      )}
      {pipeline.map((mod, i) => {
        const r = computation.results[mod.id];
        const selected = expandedId === mod.id;
        return (
          <div key={mod.id}>
            {gap(i)}
            <button
              type="button"
              onClick={() => onSelect(mod.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                selected ? "bg-primary/10 font-semibold text-primary" : "hover:bg-secondary"
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r?.status ?? "idle"]}`} />
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              <span className="truncate">{mod.title ?? MODULE_CATALOG[mod.type].label}</span>
            </button>
          </div>
        );
      })}
      {insertAt === pipeline.length ? (
        <ModulePicker
          pipeline={pipeline}
          onPick={(t) => {
            onInsert(pipeline.length, t);
            setInsertAt(null);
          }}
          onClose={() => setInsertAt(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setInsertAt(pipeline.length)}
          className="mt-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:border-[var(--primary)] hover:text-primary"
        >
          ＋ 단계 추가
        </button>
      )}
    </nav>
  );
}
