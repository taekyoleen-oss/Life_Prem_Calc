"use client";

import { useState, type ReactNode } from "react";
import type { ModuleStatus } from "@/types/modules";
import type { ModuleResult } from "@/lib/engine/pipeline";
import type { ModuleHelp } from "@/content/module-help";

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
  title,
  onTitleChange,
  typeId,
  result,
  expanded,
  onToggle,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  anchorId,
  help,
  lectureMode,
  children,
}: {
  index: number;
  title: string;
  onTitleChange: (title: string) => void;
  typeId: string;
  result: ModuleResult;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  anchorId: string;
  help?: ModuleHelp;
  lectureMode?: boolean;
  children: ReactNode;
}) {
  const badge = STATUS_BADGE[result.status];
  const [showHelp, setShowHelp] = useState(false);
  const helpVisible = help && (lectureMode || (expanded && showHelp));
  const moveBtn = "rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section
      id={anchorId}
      className={`scroll-mt-4 rounded-xl border bg-card shadow-sm transition-colors ${
        expanded ? "border-[var(--primary)]" : "border-border"
      }`}
    >
      <header className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={onToggle}>
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
            {expanded ? (
              <input
                type="text"
                value={title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onTitleChange(e.target.value)}
                title="단계 이름 (클릭해서 수정)"
                className="w-48 rounded border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-input focus:border-input focus:outline-none"
              />
            ) : (
              <h3 className="text-sm font-semibold">{title}</h3>
            )}
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
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {help && (
            <button
              type="button"
              onClick={() => setShowHelp((s) => !s)}
              className={`rounded-full px-1.5 py-0.5 text-xs ${showHelp ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
              title="교육 설명 보기"
            >
              ⓘ
            </button>
          )}
          <button type="button" onClick={() => onMove("up")} disabled={!canMoveUp} className={moveBtn} title="위로 이동">
            ▲
          </button>
          <button type="button" onClick={() => onMove("down")} disabled={!canMoveDown} className={moveBtn} title="아래로 이동">
            ▼
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-[#fee2e2] hover:text-[#991b1b]"
            title="모듈 삭제"
          >
            삭제
          </button>
        </div>
        <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
      </header>

      {helpVisible && (
        <div className="border-t border-border/60 bg-primary/[0.03] px-4 py-3 text-sm">
          <p className="leading-relaxed">{help.concept}</p>
          {help.formula !== "—" && (
            <p className="mt-1.5 rounded bg-secondary/60 px-2 py-1 font-mono text-xs">{help.formula}</p>
          )}
          {help.example && <p className="mt-1 text-xs text-muted-foreground">{help.example}</p>}
        </div>
      )}

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
          {result.warning && (
            <p className="mb-3 rounded-md bg-[#fef3c7] px-3 py-2 text-sm text-[#92400e]">
              {result.warning}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
