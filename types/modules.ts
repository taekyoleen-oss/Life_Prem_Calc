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

/**
 * 파이프라인 안의 모듈 인스턴스 하나.
 * params는 모듈별 구체 파라미터 타입으로 P1(엔진)에서 판별 유니온으로 좁힌다.
 */
export interface ModuleInstance {
  id: string;
  type: ModuleTypeId;
  /** 카드 제목(자동 생성, 사용자 수정 가능) */
  title?: string;
  /** 모듈별 입력값·옵션 — P1에서 모듈별 타입으로 구체화 */
  params: Record<string, unknown>;
  /** 참조하는 상류 자산 (DAG 간선, §2.3) */
  refs: AssetRef[];
  /** 이 모듈이 산출·등록하는 자산 정의 */
  outputs: AssetDef[];
}
