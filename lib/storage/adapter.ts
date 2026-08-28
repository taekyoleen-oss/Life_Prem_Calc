import type { WorkbookFile } from "@/types/pipeline";

/**
 * 저장 계층 어댑터 (설계서 §4.3).
 * localAdapter(게스트, localStorage)는 P2~, cloudAdapter(Supabase)는 P5에서 구현.
 * 로그인 시 로컬 → 클라우드 마이그레이션 함수도 P5에서 이 인터페이스 위에 둔다.
 */
export interface WorkbookMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StorageAdapter {
  listWorkbooks(): Promise<WorkbookMeta[]>;
  loadWorkbook(id: string): Promise<WorkbookFile | null>;
  saveWorkbook(workbook: WorkbookFile): Promise<void>;
  deleteWorkbook(id: string): Promise<void>;
}
