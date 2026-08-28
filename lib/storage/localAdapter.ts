import { SCHEMA_VERSION, type Sheet, type WorkbookFile } from "@/types/pipeline";
import type { StorageAdapter, WorkbookMeta } from "./adapter";

/**
 * localStorage 어댑터 (설계서 §4.3): 게스트 모드 저장.
 * 게스트는 고정 id("guest")의 단일 워크북을 자동 저장한다.
 * 로그인 후 cloudAdapter로의 무손실 이전(P5 클라우드 연동)도 이 파일 형식을 쓴다.
 */

const INDEX_KEY = "pf_wb_index";
const wbKey = (id: string) => `pf_wb_${id}`;

export const GUEST_WORKBOOK_ID = "guest";

function readIndex(): WorkbookMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as WorkbookMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(index: WorkbookMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export const localAdapter: StorageAdapter = {
  async listWorkbooks() {
    return readIndex();
  },

  async loadWorkbook(id) {
    const raw = localStorage.getItem(wbKey(id));
    if (!raw) return null;
    try {
      const wb = JSON.parse(raw) as WorkbookFile;
      // 스키마 버전 확인 — v1만 존재. 버전이 다르면 마이그레이션 지점(§5).
      if (wb.schemaVersion !== SCHEMA_VERSION) return null;
      return wb;
    } catch {
      return null;
    }
  },

  async saveWorkbook(wb) {
    localStorage.setItem(wbKey(wb.id), JSON.stringify(wb));
    const index = readIndex().filter((m) => m.id !== wb.id);
    index.push({ id: wb.id, title: wb.title, updatedAt: wb.updatedAt });
    writeIndex(index);
  },

  async deleteWorkbook(id) {
    localStorage.removeItem(wbKey(id));
    writeIndex(readIndex().filter((m) => m.id !== id));
  },
};

/** 스토어 시트 상태 → 저장 파일 (types/pipeline.ts 직렬화 스키마) */
export function toWorkbookFile(
  sheets: Sheet[],
  id = GUEST_WORKBOOK_ID,
  title = "게스트 워크북",
): WorkbookFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    sheets,
    updatedAt: new Date().toISOString(),
  };
}
