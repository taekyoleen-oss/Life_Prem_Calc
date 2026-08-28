"use client";

import { useState } from "react";
import type { SheetState } from "@/lib/store/workbook";

/**
 * 시트 탭 바 (§2.3): 첫 탭은 항상 공용탭. 더블클릭으로 이름 변경,
 * 일반 탭은 복제·삭제 가능. 공용탭 자산은 모든 일반 탭이 참조한다.
 */
export function SheetTabs({
  sheets,
  activeSheetId,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onRename,
}: {
  sheets: SheetState[];
  activeSheetId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commit = () => {
    if (renamingId) onRename(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border pb-2">
      {sheets.map((sh) => {
        const isActive = sh.id === activeSheetId;
        const isShared = sh.sheetType === "shared";
        return (
          <div
            key={sh.id}
            className={`flex items-center gap-1 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm ${
              isActive
                ? "border-[var(--primary)] bg-card font-semibold text-primary"
                : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            {renamingId === sh.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && commit()}
                className="w-24 rounded border border-input bg-card px-1 text-sm focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(sh.id)}
                onDoubleClick={() => {
                  setRenamingId(sh.id);
                  setDraft(sh.name);
                }}
                title="더블클릭: 이름 변경"
              >
                {sh.name}
              </button>
            )}
            {isShared && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                공용
              </span>
            )}
            {isActive && (
              <span className="ml-1 flex items-center gap-0.5">
                <button
                  type="button"
                  title="탭 복제"
                  onClick={() => onDuplicate(sh.id)}
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-secondary"
                >
                  ⧉
                </button>
                {!isShared && (
                  <button
                    type="button"
                    title="탭 삭제"
                    onClick={() => {
                      if (window.confirm(`'${sh.name}' 탭을 삭제할까요?`)) onRemove(sh.id);
                    }}
                    className="rounded px-1 text-xs text-muted-foreground hover:bg-[#fee2e2] hover:text-[#991b1b]"
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        title="새 탭 추가"
        className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:border-[var(--primary)] hover:text-primary"
      >
        ＋
      </button>
    </div>
  );
}
