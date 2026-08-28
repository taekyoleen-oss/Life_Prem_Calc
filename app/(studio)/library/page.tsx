"use client";

import Link from "next/link";
import { RATE_LIBRARY } from "@/lib/engine/pipeline";
import { DataGrid } from "@/components/grid/DataGrid";

/** 공용 라이브러리 (설계서 §2.1): v1.0은 더미 위험률 표만 내장. */
export default function LibraryPage() {
  const entries = Object.values(RATE_LIBRARY);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-baseline gap-3">
        <Link href="/" className="text-lg font-bold text-primary">
          PremiaFlow
        </Link>
        <h1 className="text-base font-semibold">공용 라이브러리</h1>
        <Link href="/w/guest" className="ml-auto text-sm text-primary hover:underline">
          작업공간으로 →
        </Link>
      </header>

      <section className="mb-4 rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="mb-1 font-bold">더미 위험률 표 v1 (강의·실습용)</h2>
        <p className="text-muted-foreground">
          연령 0~100세 합성 표입니다. 생성 규칙(연령 단조 증가):
        </p>
        <ul className="mt-2 flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
          <li>사망률(남) = round6(0.0005 + 0.00005 × 1.09^x)</li>
          <li>사망률(여) = round6(0.0003 + 0.000035 × 1.09^x)</li>
          <li>진단률 = round6(0.0002 + 0.00002 × 1.08^x)</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          실제 경험생명표는 작업공간의 위험률 단계에서 붙여넣기·CSV로 직접 입력할 수 있습니다.
          개인 라이브러리 저장은 클라우드 연동 후 제공됩니다.
        </p>
      </section>

      <DataGrid
        columns={[
          { label: "연령", values: entries[0].values.map((_, i) => i) },
          ...entries.map((e) => ({ label: e.label, values: e.values as number[], digits: 6 })),
        ]}
        maxHeightClass="max-h-[32rem]"
      />
    </main>
  );
}
