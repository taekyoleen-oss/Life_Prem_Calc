import type { ModuleInstance } from "./modules";

/**
 * 파이프라인 직렬화 스키마 (설계서 §2.3, §4.1).
 * 저장(localStorage·Supabase pf_sheets.pipeline)과 v2.0 문서 자동 변환(§8.2)의
 * 목표 형식이므로 변경 시 schemaVersion을 올리고 마이그레이션을 제공한다.
 */
export const SCHEMA_VERSION = 1;

export type SheetType = "shared" | "normal";

export interface Sheet {
  id: string;
  name: string;
  /** 'shared' = 공용탭(워크북당 1개, 첫 탭 고정), 'normal' = 일반 탭 */
  sheetType: SheetType;
  /** 위→아래 진행 순서의 모듈 인스턴스 목록 */
  pipeline: ModuleInstance[];
}

/** 워크북 저장 단위. localAdapter·cloudAdapter가 공통으로 사용한다 (§4.3) */
export interface WorkbookFile {
  schemaVersion: number;
  id: string;
  title: string;
  memo?: string;
  /** position 순 정렬. sheets[0]은 항상 공용탭 */
  sheets: Sheet[];
  /** ISO 8601 */
  updatedAt: string;
}
