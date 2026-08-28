import type { PvTiming } from "@/types/modules";

/**
 * 현가 계산 (설계서 §3.2.2, M04·M07).
 * 현가는 기수 l0 기준 집단 총액으로 계산하고, 보험료 산식에서 1건당으로 환산한다.
 * 연산 순서는 docs/domain/golden-cases.md "정준 계산 순서"와 동일해야 한다.
 */

/** 할인계수 계열 vp[t] = v^t (t = 0..count-1), v = 1/(1+i). 누적 곱으로 산출한다. */
export function discountFactors(i: number, count: number): number[] {
  if (count < 1) throw new Error("할인계수 개수는 1 이상이어야 합니다.");
  const v = 1 / (1 + i);
  const vp: number[] = [1];
  for (let t = 1; t < count; t++) vp.push(vp[t - 1] * v);
  return vp;
}

/** 수입현가(연시 고정): Σ_{t=0}^{m-1} lp[t] · vp[t] */
export function pvIncome(lp: number[], vp: number[], m: number): number {
  if (lp.length < m || vp.length < m) throw new Error("납입기간 m보다 계열 길이가 짧습니다.");
  let acc = 0;
  for (let t = 0; t < m; t++) acc += lp[t] * vp[t];
  return acc;
}

/**
 * 사망·발생급부 지급현가: Σ_{t=0}^{n-1} amount · d[t] · disc(t)
 * 시점(§3.2.2): 연말 disc = vp[t+1] (기본값), 연중 disc = vp[t]·√v, 연시 disc = vp[t]
 */
export function pvBenefit(
  d: number[],
  vp: number[],
  amount: number,
  n: number,
  timing: PvTiming = "end",
): number {
  if (d.length < n) throw new Error("보험기간 n보다 d 계열 길이가 짧습니다.");
  if (vp.length < n + 1) throw new Error("할인계수 계열은 n+1개 이상이어야 합니다.");
  const sqv = Math.sqrt(vp[1]);
  let acc = 0;
  for (let t = 0; t < n; t++) {
    if (timing === "end") acc += amount * d[t] * vp[t + 1];
    else if (timing === "mid") acc += amount * d[t] * (vp[t] * sqv);
    else acc += amount * d[t] * vp[t];
  }
  return acc;
}

/** 만기·생존급부 지급현가: amount · l[n] · vp[n] (시점 고정) */
export function pvMaturity(amount: number, lN: number, vpN: number): number {
  return amount * lN * vpN;
}
