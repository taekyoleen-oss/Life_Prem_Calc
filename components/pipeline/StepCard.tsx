"use client";

import type { ReactNode } from "react";
import type { ModuleStatus } from "@/types/modules";
import type { ModuleResult } from "@/lib/engine/pipeline";

/** 모듈 상태 배지 5단계 (§3.1) */
const STATUS_BADGE: Record<ModuleStatus, { label: string; cls: string }> = {
  idle: { label: "대기", cls: "bg-secondary text-muted-foreground" },
  editing: { label: "입력 중", cls: "bg-[#fef3c7] text-[#92400e]" },
  done: { label: "완료", cls: "bg-accent text-accent-foreground" },
  stale: { label: "재계산 필요", cls: "bg-[#fef3c7] text-[#92400e]" },
  error: { label: "오류", cls: "bg-[#fee2e2] text-[#991b1b]" },
};

export function StepCard({
  index,
  moduleLabel,
  typeId,
  result,
  expanded,
  onToggle,
  onRemove,
  anchorId,
  children,
}: {
  index: number;
  moduleLabel: string;
  typeId: string;
  result: ModuleResult;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  anchorId: string;
  children: ReactNode;
}) {
  const badge = STATUS_BADGE[result.status];
  return (
    <section
      id={anchorId}
      className={`scroll-mt-4 rounded-xl border bg-card shadow-sm transition-colors ${
        expanded ? "border-[var(--primary)]" : "border-border"
      }`}
    >
      <header
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={onToggle}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            result.status === "done"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{typeId}</span>
            <h3 className="text-sm font-semibold">{moduleLabel}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          {!expanded && result.status === "done" && result.summary.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {result.summary.map((s, i) => (
                <span
                  key={i}
                  className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground tabular"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-[#fee2e2] hover:text-[#991b1b]"
          title="모듈 삭제"
        >
          삭제
        </button>
        <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
      </header>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          {result.message && (
            <p
              className={`mb-3 rounded-md px-3 py-2 text-sm ${
                result.status === "error"
                  ? "bg-[#fee2e2] text-[#991b1b]"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {result.message}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
