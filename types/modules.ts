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

/** 사용자 입력(붙여넣기·CSV) 위험률 표의 열 하나 */
export interface M03CustomColumn {
  name: string;
  isMortality: boolean;
  /** 자산으로 등록할지 여부 (열 선택) */
  selected: boolean;
  values: number[];
}

/**
 * 위험률 표: 공용 라이브러리 선택 또는 직접 입력(클립보드 TSV·CSV).
 * 복수 열 선택 → 한 단계에서 계열별 자산을 여러 개 등록한다(단계 내 변수 추가).
 * (구버전 단일 libraryKey 파라미터도 계산 레이어가 호환 처리한다)
 */
export interface M03Params {
  /** 생략 시 "library" (구버전 호환) */
  source?: "library" | "custom";
  libraryKeys: ("male" | "female" | "diagnosis")[];
  /** 직접 입력 파싱 결과 (결정론 파서 lib/engine/table-io.ts) */
  custom?: { startAge: number; columns: M03CustomColumn[] };
  /** 재편집용 원본 텍스트 */
  rawText?: string;
}

/**
 * M04 소단계: 시점별 현가율 계열 하나. 위→아래로 추가되고 각각 독립 실행된다.
 * key는 자산 slot으로 쓰이는 불변 식별자.
 */
export interface M04Variant {
  key: string;
  /** 연시 v^t · 연중 v^{t+1/2} · 연말 v^{t+1} */
  timing: PvTiming;
  /** UI 접힘 상태 (계산과 무관) */
  collapsed?: boolean;
}

export interface M04Params {
  /** 예정이율 (소수, 예: 0.025) — 소단계가 공유 */
  i: number;
  /** 기본 2개: 연시 + 연중. (구버전 extraTimings 파라미터도 계산 레이어가 호환 처리) */
  variants: M04Variant[];
}

/**
 * M05 소단계: 탈퇴 구성 하나 → 계열 자산 하나. 위→아래로 추가되고 독립 실행된다.
 * 예: 위에 생존자수(l), 아래에 납입면제 반영 납입자수(lp).
 */
export interface M05Variant {
  key: string;
  /** 용도 태그: 생존자수(l) · 납입자수(lp) */
  usage: "survivors" | "payers";
  /** 탈퇴원인 q 자산(table) 다중 선택 */
  qAssetIds: string[];
  /** 기수 l0 */
  l0: number;
  combine: DecrementCombine;
  /** UI 접힘 상태 (계산과 무관) */
  collapsed?: boolean;
}

export interface M05Params {
  /** (구버전 평면 파라미터도 계산 레이어가 호환 처리) */
  variants: M05Variant[];
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

/** M10 사용자 수식 (§3.4): 상류 자산 코드를 변수로 쓰는 엑셀식 수식 */
export interface M10Params {
  expression: string;
}

/** M09 사업비·영업보험료 (§3.2.3): 방식 A(3이원)·B(단순 부가율). 방식 C(수식)는 P4 */
export interface M09Params {
  method: "A" | "B";
  /** 방식 A: 가입금액 대비 신계약비(1회)·연간 유지비, 영업보험료 대비 수금비 (소수) */
  alpha: number;
  beta: number;
  gamma: number;
  /** 방식 B: 단순 부가율 k (소수) */
  loadingK: number;
  /** 수입·지급현가 스칼라 (기본: M08과 동일 선택) */
  incomeAssetIds: string[];
  outgoAssetIds: string[];
  /** 유지비 기저 E·l0 산출용 생존자수 계열 */
  lAssetId: string | null;
  /** E 산출용 현가율 v^t 계열 */
  vAssetId: string | null;
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
  M09: M09Params;
  M10: M10Params;
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
