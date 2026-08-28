"use client";

import type { ModuleInstance, ModuleTypeId } from "@/types/modules";
import { MODULE_CATALOG, recommendNext } from "@/lib/engine/pipeline";

/** "＋ 다음 단계" 추천 칩 + 전체 모듈 보기 (§3.1) */
export function NextStep({
  pipeline,
  onAdd,
}: {
  pipeline: ModuleInstance[];
  onAdd: (type: ModuleTypeId) => void;
}) {
  const recs = recommendNext(pipeline);
  const present = new Set(pipeline.map((m) => m.type));
  const all = Object.entries(MODULE_CATALOG) as [
    ModuleTypeId,
    (typeof MODULE_CATALOG)[ModuleTypeId],
  ][];

  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">＋ 다음 단계</span>
        {recs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="rounded-full border border-[var(--primary)] px-3 py-1 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground"
          >
            {t} {MODULE_CATALOG[t].label}
          </button>
        ))}
        {recs.length === 0 && pipeline.length > 0 && (
          <span className="text-sm text-muted-foreground">
            파이프라인이 완성되었습니다 — 우측 결과 패널을 확인하세요.
          </span>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          전체 모듈 보기
        </summary>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {all.map(([t, meta]) => {
            const blocked = !meta.available || (!meta.repeatable && present.has(t));
            return (
              <button
                key={t}
                type="button"
                disabled={blocked}
                onClick={() => onAdd(t)}
                className={`flex items-baseline gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm ${
                  blocked
                    ? "cursor-not-allowed border-border/60 text-muted-foreground/60"
                    : "border-border hover:border-[var(--primary)] hover:text-primary"
                }`}
              >
                <span className="font-mono text-xs">{t}</span>
                <span className="font-medium">{meta.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {!meta.available ? meta.desc : !meta.repeatable && present.has(t) ? "추가됨" : meta.desc}
                </span>
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
