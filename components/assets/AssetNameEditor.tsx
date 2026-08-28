"use client";

import type { AssetNameOverride } from "@/types/modules";
import type { ComputedAsset } from "@/lib/engine/pipeline";

/**
 * 출력 변수 이름 편집 (§3.3 표시명·코드 분리).
 * 코드는 수식·생성 코드의 변수명으로 쓰인다. 중복·규칙 위반은 계산 레이어가
 * 경고 후 기본 코드로 폴백하므로 여기서는 자유 입력을 허용한다.
 */
export function AssetNameEditor({
  assets,
  overrides,
  onChange,
}: {
  assets: ComputedAsset[];
  overrides: Record<string, AssetNameOverride>;
  onChange: (slot: string, patch: AssetNameOverride) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <details className="mt-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
        출력 변수 이름 ({assets.map((a) => a.def.code).join(", ")})
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_10rem] gap-2 text-[11px] font-semibold text-muted-foreground">
          <span>표시명 (한글 허용)</span>
          <span>코드 (수식·생성 코드 변수명)</span>
        </div>
        {assets.map((a) => {
          const slot = a.def.id.split(":")[1];
          const ov = overrides[slot] ?? {};
          return (
            <div key={a.def.id} className="grid grid-cols-[1fr_10rem] gap-2">
              <input
                type="text"
                value={ov.displayName ?? a.def.displayName}
                onChange={(e) => onChange(slot, { displayName: e.target.value })}
                className="rounded-md border border-input bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={ov.code ?? a.def.code}
                onChange={(e) => onChange(slot, { code: e.target.value })}
                spellCheck={false}
                className="rounded-md border border-input bg-card px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          코드 규칙: 소문자로 시작, a-z·0-9·_ 만, 30자 이내, 시트 내 유일. 참조는 내부
          ID로 유지되므로 이름을 바꿔도 하류 계산은 그대로 연결됩니다.
        </p>
      </div>
    </details>
  );
}
