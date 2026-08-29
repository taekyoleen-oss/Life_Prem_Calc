"use client";

import type { ReactNode } from "react";

/** 단계 내 소단계 카드: 위→아래로 추가, 독립 실행, 접기/펼치기 */
export function SubStep({
  index,
  title,
  badge,
  collapsed,
  onToggle,
  onRemove,
  removable,
  children,
}: {
  index: number;
  title: string;
  badge?: string;
  collapsed: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removable: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
        onClick={onToggle}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
          {index + 1}
        </span>
        <span className="text-sm font-medium">{title}</span>
        {badge && (
          <span className="rounded-full bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {badge}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {removable && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-[#fee2e2] hover:text-[#991b1b]"
            >
              삭제
            </button>
          )}
        </span>
        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {collapsed ? "▸ 펼치기" : "▾ 접기"}
        </span>
      </div>
      {!collapsed && <div className="border-t border-border/60 px-3 py-3">{children}</div>}
    </div>
  );
}

export const newSubKey = () => `k_${Math.random().toString(36).slice(2, 8)}`;
