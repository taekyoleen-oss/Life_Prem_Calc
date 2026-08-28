"use client";

import type { ComputedAsset } from "@/lib/engine/pipeline";

/** 참조 선택 콤보 (설계서 §3.2 (a)). 옵션 라벨: 코드 · 표시명 */
export function AssetPicker({
  assets,
  value,
  onChange,
  placeholder = "자산 선택…",
}: {
  assets: ComputedAsset[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {assets.map((a) => (
        <option key={a.def.id} value={a.def.id}>
          {a.def.code} · {a.def.displayName}
        </option>
      ))}
    </select>
  );
}

/** 다중 선택(체크박스 목록): M05 탈퇴원인, M08 현가 합산 */
export function AssetMultiPicker({
  assets,
  values,
  onChange,
  emptyText = "선택 가능한 자산이 없습니다 — 상류 모듈을 먼저 완료하세요.",
}: {
  assets: ComputedAsset[];
  values: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
}) {
  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {assets.map((a) => {
        const checked = values.includes(a.def.id);
        return (
          <label key={a.def.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...values, a.def.id]
                    : values.filter((id) => id !== a.def.id),
                )
              }
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="font-medium">{a.def.code}</span>
            <span className="text-muted-foreground">{a.def.displayName}</span>
            {a.def.isMortality !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  a.def.isMortality
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {a.def.isMortality ? "사망률" : "발생률"}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
