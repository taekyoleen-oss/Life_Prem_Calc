"use client";

import type { SheetComputation } from "@/lib/engine/pipeline";
import { fmt } from "@/lib/format";

/** 우측 고정 결과 요약 패널 (§3.6) — 활성 탭 기준 */
export function ResultPanel({
  computation,
  moduleCount,
  sheetName,
  isShared,
  onReset,
}: {
  computation: SheetComputation;
  moduleCount: number;
  sheetName: string;
  isShared: boolean;
  onReset: () => void;
}) {
  const { contract, final, results } = computation;
  const doneCount = Object.values(results).filter((r) => r.status === "done").length;
  const headline = final.g ?? final.p;
  const headlineRounded = final.g !== null ? final.gRounded : final.pRounded;
  const headlineLabel = final.g !== null ? "영업보험료 G (단수처리 후)" : "순보험료 P (단수처리 후)";

  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">
          결과 요약 <span className="ml-1 font-normal text-muted-foreground">— {sheetName}</span>
        </h2>

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">진행</dt>
            <dd className="tabular">
              {doneCount} / {moduleCount} 완료
            </dd>
          </div>
          {contract && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">계약</dt>
                <dd>
                  {contract.age}세 {contract.sex === "male" ? "남" : "여"} · {contract.years}년/
                  {contract.payYears}년납
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">가입금액</dt>
                <dd className="tabular">{fmt(contract.sumAssured)}원</dd>
              </div>
            </>
          )}
        </dl>

        <hr className="my-3 border-border" />

        {headline === null ? (
          <p className="text-sm text-muted-foreground">
            {isShared
              ? "공용탭은 다른 탭이 참조하는 기초 자산을 제공합니다."
              : "M08(순보험료)까지 완료하면 보험료가 표시됩니다."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {final.nsp !== null && (
              <div>
                <p className="text-xs text-muted-foreground">일시납 순보험료 NSP</p>
                <p className="tabular text-base font-semibold">{fmt(final.nsp, 2)}원</p>
              </div>
            )}
            {final.p !== null && (
              <div>
                <p className="text-xs text-muted-foreground">연납 순보험료 P</p>
                <p className="tabular text-base font-semibold">{fmt(final.p, 2)}원</p>
              </div>
            )}
            {final.g !== null && (
              <div>
                <p className="text-xs text-muted-foreground">연납 영업보험료 G</p>
                <p className="tabular text-base font-semibold">{fmt(final.g, 2)}원</p>
              </div>
            )}
            <div className="rounded-lg bg-primary/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">{headlineLabel}</p>
              <p className="tabular text-xl font-bold text-primary">{fmt(headlineRounded ?? 0)}원</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        <p>
          게스트 모드 — 새로고침 시 초기화됩니다. 저장·불러오기는 P5(클라우드 연동)에서
          제공됩니다.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-2 rounded border border-border px-2 py-1 hover:bg-secondary"
        >
          전체 초기화
        </button>
      </div>
    </aside>
  );
}
