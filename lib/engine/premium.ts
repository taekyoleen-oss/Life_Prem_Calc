/**
 * 보험료 산식 (설계서 §3.2.3, M08·M09).
 * 현가 입력은 기수 l0 기준 집단 총액이며, 여기서 1건당 보험료로 환산한다.
 * 연산 순서는 docs/domain/golden-cases.md "정준 계산 순서"와 동일해야 한다.
 */

/** 일시납 순보험료: NSP = (지급현가 총합) / l0 */
export function netSinglePremium(pvOut: number, l0: number): number {
  return pvOut / l0;
}

/** 연납 순보험료: P = (지급현가 총합) / (수입현가 총합) */
export function annualNetPremium(pvOut: number, pvIn: number): number {
  return pvOut / pvIn;
}

/** 영업보험료 방식 A 입력 (3이원 수지상등 확장) */
export interface GrossAInputs {
  /** 가입금액 대비 신계약비(계약 시 1회) */
  alpha: number;
  /** 가입금액 대비 연간 유지비(보험기간 연시) */
  beta: number;
  /** 영업보험료 대비 수금비(납입기간) */
  gamma: number;
  S: number;
  l0: number;
  /** 지급현가 총합(집단) */
  pvOut: number;
  /** 수입현가 총합(집단) */
  pvIn: number;
  /** 유지비 기저: Σ_{t=0}^{n-1} l[t]·vp[t] (보험기간 연시) */
  maintenanceBase: number;
}

export interface GrossAResult {
  /** 1건당 연납 영업보험료 */
  G: number;
  /** 부가보험료 분해(1건당): 신계약비·유지비·수금비·합계 */
  loadingAlpha: number;
  loadingBeta: number;
  loadingGamma: number;
  loadingTotal: number;
}

/**
 * 방식 A: G·PVin = PVout + α·S·l0 + β·S·E + γ·G·PVin
 *   →  G = (PVout + α·S·l0 + β·S·E) / (PVin·(1−γ))
 */
export function grossPremiumA(inp: GrossAInputs): GrossAResult {
  const { alpha, beta, gamma, S, l0, pvOut, pvIn, maintenanceBase } = inp;
  const nAlpha = alpha * S * l0;
  const nBeta = beta * S * maintenanceBase;
  const G = (pvOut + nAlpha + nBeta) / (pvIn * (1 - gamma));
  return {
    G,
    loadingAlpha: nAlpha / pvIn,
    loadingBeta: nBeta / pvIn,
    loadingGamma: gamma * G,
    loadingTotal: G - pvOut / pvIn,
  };
}

/** 방식 B(단순 부가율): G = P / (1 − k) */
export function grossPremiumB(p: number, k: number): number {
  return p / (1 - k);
}

export type { RoundingMode } from "@/types/modules";
import type { RoundingMode } from "@/types/modules";

/**
 * 최종 보험료 단수처리 (M02 옵션). digit = 처리 자릿수(0 = 원 단위, 1 = 십원 단위 …).
 * round는 half-up. 내부 계산에는 사용하지 않고 최종 표시·확정 값에만 적용한다(설계서 §1.5).
 */
export function roundPremium(x: number, digit = 0, mode: RoundingMode = "round"): number {
  const unit = 10 ** digit;
  if (mode === "floor") return Math.floor(x / unit) * unit;
  if (mode === "ceil") return Math.ceil(x / unit) * unit;
  return Math.floor(x / unit + 0.5) * unit;
}
