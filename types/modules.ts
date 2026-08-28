import type { AssetDef, AssetRef } from "./assets";

/** 모듈 카탈로그 M01~M11 (설계서 §3.2) */
export type ModuleTypeId =
  | "M01" // 상품 기본정보
  | "M02" // 계약조건
  | "M03" // 위험률 표
  | "M04" // 이자율·현가율
  | "M05" // 생존자수·납입자수
  | "M06" // 사망자수·발생자수
  | "M07" // 현가합
  | "M08" // 순보험료
  | "M09" // 사업비·영업보험료
  | "M10" // 사용자 수식
  | "M11"; // 결과 요약

/** 모듈 상태 배지 5단계 (§3.1) */
export type ModuleStatus = "idle" | "editing" | "done" | "stale" | "error";

/** 현가 시점 옵션 (§3.2.2): 연시 s=0 · 연중 s=1/2 · 연말 s=1 */
export type PvTiming = "begin" | "mid" | "end";

/** M05 결합 방식 (§3.2.1) */
export type DecrementCombine = "single" | "independent" | "sum";

/** 최종 보험료 단수처리 방식 (M02 옵션) */
export type RoundingMode = "round" | "floor" | "ceil";

export type Sex = "male" | "female";

/** ── 모듈별 파라미터 (P2 확정, 설계서 §3.2 모듈 카탈로그) ───────────
 * 자산 참조는 assetId 문자열로 보관하고, ModuleInstance.refs(DAG 간선)는
 * 저장 시 params에서 유도한다. null = 아직 선택되지 않음(입력 중 상태).
 */

export interface M01Params {
  productName: string;
  productType: "term" | "endowment" | "pure" | "other";
  memo: string;
}

export interface M02Params {
  /** 가입연령 x */
  age: number;
  sex: Sex;
  /** 보험기간 n */
  years: number;
  /** 납입기간 m (연납, v1.0) */
  payYears: number;
  /** 가입금액 S */
  sumAssured: number;
  /** 최종 보험료 단수처리: 자리(0=원)·방식 */
  roundDigit: number;
  roundMode: RoundingMode;
}

/** P2는 라이브러리 선택만 지원. 업로드·붙여넣기·컬럼 매핑은 P3(table-io) */
export interface M03Params {
  libraryKey: "male" | "female" | "diagnosis";
}

export interface M04Params {
  /** 예정이율 (소수, 예: 0.025) */
  i: number;
  /**
   * 기본 v^t(연시) 외에 추가로 등록할 시점 이동 계열 (한국형 유연성).
   * "mid" → v^{t+1/2}, "end" → v^{t+1}. M10 수식·직접 참조용.
   */
  extraTimings: PvTiming[];
}

export interface M05Params {
  /** 탈퇴원인 q 자산(table) 다중 선택 */
  qAssetIds: string[];
  /** 기수 l0 */
  l0: number;
  combine: DecrementCombine;
  /** 용도 태그: 생존자수(l) · 납입자수(lp) */
  usage: "survivors" | "payers";
}

export interface M06Params {
  lAssetId: string | null;
  qAssetId: string | null;
}

export type M07Kind = "income" | "death" | "maturity";

export interface M07Params {
  kind: M07Kind;
  /** income은 연시 고정, maturity는 만기 고정 — death에서만 선택 */
  timing: PvTiming;
  /** income: lp·l 계열 / death: d 계열 / maturity: l 계열 */
  seriesAssetId: string | null;
  /** 현가율 v 계열 */
  vAssetId: string | null;
  /** 급부금액: 기본 S 참조 또는 직접 입력 (income에는 무관) */
  amountMode: "S" | "custom";
  customAmount: number;
}

export interface M08Params {
  /** 수입현가 스칼라 자산 다중 선택(합산) */
  incomeAssetIds: string[];
  /** 지급현가 스칼라 자산 다중 선택(합산) */
  outgoAssetIds: string[];
  /** NSP의 기준 생존자수 계열(l_x = 계열 첫 값) */
  lAssetId: string | null;
}

/**
 * 출력 자산 이름 사용자 지정 (§3.3 표시명·코드 분리).
 * 모든 모듈 params에 `assetNames: Record<slot, AssetNameOverride>`로 선택 포함된다.
 * 코드는 ASSET_CODE_RE를 지켜야 하며 시트 내 유일해야 한다.
 */
export interface AssetNameOverride {
  code?: string;
  displayName?: string;
}

/** M09~M11은 해당 페이즈(P3·P4)에서 확정 */
export interface ModuleParamsMap {
  M01: M01Params;
  M02: M02Params;
  M03: M03Params;
  M04: M04Params;
  M05: M05Params;
  M06: M06Params;
  M07: M07Params;
  M08: M08Params;
  M09: Record<string, unknown>;
  M10: Record<string, unknown>;
  M11: Record<string, unknown>;
}

/**
 * 파이프라인 안의 모듈 인스턴스 하나.
 * 직렬화 스키마 안정성을 위해 params 필드 자체는 넓은 타입을 유지하고,
 * 계산 레이어에서 ModuleParamsMap[type]으로 좁혀 사용한다.
 */
export interface ModuleInstance {
  id: string;
  type: ModuleTypeId;
  /** 카드 제목(자동 생성, 사용자 수정 가능) */
  title?: string;
  params: Record<string, unknown>;
  /** 참조하는 상류 자산 (DAG 간선, §2.3) */
  refs: AssetRef[];
  /** 이 모듈이 산출·등록하는 자산 정의 */
  outputs: AssetDef[];
}
