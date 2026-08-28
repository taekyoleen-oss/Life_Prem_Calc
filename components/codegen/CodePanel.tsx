"use client";

import { useState } from "react";

/**
 * 모듈 카드 코드 보기 (§3.5): 해당 모듈의 생성 Python 블록.
 * VBA·전체 스크립트는 헤더의 "코드 내보내기"에서 받는다.
 */
export function CodePanel({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="mt-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <summary className="cursor-pointer font-mono text-xs font-semibold text-muted-foreground hover:text-foreground">
        {"</>"} 코드 보기 (Python)
      </summary>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="absolute right-2 top-2 rounded bg-card px-2 py-0.5 text-xs font-medium text-primary hover:bg-secondary"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
        <pre className="overflow-x-auto rounded-md bg-[#1f2933] px-3 py-2 text-xs leading-relaxed text-[#e5e7eb]">
          {snippet}
        </pre>
        <p className="mt-1 text-[11px] text-muted-foreground">
          동일 파이프라인은 항상 동일한 코드를 생성합니다. 전체 스크립트(.py)·VBA(.bas)는 상단
          내보내기 버튼(.py·.bas)에서 받으세요.
        </p>
      </div>
    </details>
  );
}
