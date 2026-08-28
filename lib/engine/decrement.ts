import type { DecrementCombine } from "@/types/modules";

/**
 * 생존자수·사망자수 축차 계산 (설계서 §3.2.1, M05·M06).
 * 연산 순서는 docs/domain/golden-cases.md "정준 계산 순서"와 동일해야 하며,
 * 골든 테스트가 독립 Python 산출값과의 float64 완전 일치를 검증한다.
 */

/**
 * 생존자수 계열. qs는 탈퇴원인별 q 계열(각 길이 n, 연령 x..x+n-1 구간 슬라이스).
 * 반환 길이 n+1 (l[0] = l0, 만기 시점 l[n] 포함).
 */
export function survivors(
  l0: number,
  qs: number[][],
  combine: DecrementCombine = "independent",
): number[] {
  if (qs.length === 0) throw new Error("탈퇴원인 q 계열이 최소 1개 필요합니다.");
  const n = qs[0].length;
  for (const q of qs) {
    if (q.length !== n) throw new Error("탈퇴원인 q 계열의 길이가 서로 다릅니다.");
  }
  if (combine === "single" && qs.length !== 1) {
    throw new Error("단일탈퇴 방식은 q 계열을 1개만 선택할 수 있습니다.");
  }

  const l: number[] = [l0];
  for (let t = 0; t < n; t++) {
    if (combine === "sum") {
      let qTot = 0;
      for (const q of qs) qTot += q[t];
      l.push(l[t] * (1 - qTot));
    } else {
      // single·independent: 곱 결합 (원인 1개면 두 방식이 동일)
      let acc = l[t];
      for (const q of qs) acc = acc * (1 - q[t]);
      l.push(acc);
    }
  }
  return l;
}

/** 사망·발생자수 계열: d[t] = l[t] · q[t] (t = 0..q.length-1) */
export function deaths(l: number[], q: number[]): number[] {
  if (l.length < q.length) throw new Error("l 계열 길이가 q 계열보다 짧습니다.");
  const d: number[] = [];
  for (let t = 0; t < q.length; t++) d.push(l[t] * q[t]);
  return d;
}
