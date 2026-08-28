"use client";

import type { ModuleInstance } from "@/types/modules";
import { MODULE_CATALOG, type SheetComputation } from "@/lib/engine/pipeline";

const DOT: Record<string, string> = {
  done: "bg-success",
  editing: "bg-warning",
  stale: "bg-warning",
  error: "bg-destructive",
  idle: "bg-border",
};

/** 좌측 진행 레일 (§3.1): 모듈 목록·상태 요약, 클릭 시 해당 카드로 이동 */
export function ProgressRail({
  pipeline,
  computation,
  onSelect,
}: {
  pipeline: ModuleInstance[];
  computation: SheetComputation;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="sticky top-6 flex flex-col gap-0.5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        진행 단계
      </p>
      {pipeline.length === 0 && (
        <p className="text-xs text-muted-foreground">아직 단계가 없습니다.</p>
      )}
      {pipeline.map((mod, i) => {
        const r = computation.results[mod.id];
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => onSelect(mod.id)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r?.status ?? "idle"]}`} />
            <span className="text-xs text-muted-foreground">{i + 1}</span>
            <span className="truncate">{MODULE_CATALOG[mod.type].label}</span>
          </button>
        );
      })}
    </nav>
  );
}
