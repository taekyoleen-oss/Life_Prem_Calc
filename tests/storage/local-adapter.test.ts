/** localAdapter (게스트 자동 저장, 설계서 §4.3) + M11·CSV 내보내기 */
import { beforeEach, describe, expect, it } from "vitest";
import { GUEST_WORKBOOK_ID, localAdapter, toWorkbookFile } from "@/lib/storage/localAdapter";
import { SCHEMA_VERSION } from "@/types/pipeline";
import { computeSheet } from "@/lib/engine/pipeline";
import { buildStandardPipeline } from "@/lib/store/workbook";
import { toCsv } from "@/lib/export";
import expected from "@/tests/golden/expected.json";

// node 환경용 localStorage 셈
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as Storage;
});

describe("localAdapter", () => {
  const sheets = [
    { id: "sh", name: "공용", sheetType: "shared" as const, pipeline: [] },
    { id: "t1", name: "탭 1", sheetType: "normal" as const, pipeline: buildStandardPipeline("term") },
  ];

  it("저장 → 복원 무손실: 파이프라인 재계산 결과가 골든 G1과 일치", async () => {
    await localAdapter.saveWorkbook(toWorkbookFile(sheets));
    const wb = await localAdapter.loadWorkbook(GUEST_WORKBOOK_ID);
    expect(wb).not.toBeNull();
    expect(wb!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(wb!.sheets).toEqual(sheets); // 직렬화 왕복 무손실
    const c = computeSheet(wb!.sheets[1].pipeline);
    expect(c.final.p).toBe(expected.G1.P);
  });

  it("목록·삭제", async () => {
    await localAdapter.saveWorkbook(toWorkbookFile(sheets));
    const list = await localAdapter.listWorkbooks();
    expect(list.map((m) => m.id)).toEqual([GUEST_WORKBOOK_ID]);
    await localAdapter.deleteWorkbook(GUEST_WORKBOOK_ID);
    expect(await localAdapter.loadWorkbook(GUEST_WORKBOOK_ID)).toBeNull();
    expect(await localAdapter.listWorkbooks()).toEqual([]);
  });

  it("스키마 버전 불일치·손상 데이터는 null (마이그레이션 지점)", async () => {
    const wb = toWorkbookFile(sheets);
    localStorage.setItem(`pf_wb_${GUEST_WORKBOOK_ID}`, JSON.stringify({ ...wb, schemaVersion: 999 }));
    expect(await localAdapter.loadWorkbook(GUEST_WORKBOOK_ID)).toBeNull();
    localStorage.setItem(`pf_wb_${GUEST_WORKBOOK_ID}`, "{깨진 json");
    expect(await localAdapter.loadWorkbook(GUEST_WORKBOOK_ID)).toBeNull();
  });
});

describe("M11 결과 요약 + CSV", () => {
  it("M11은 자산 없이 완료 상태", () => {
    const pipeline = buildStandardPipeline("term");
    pipeline.push({ id: "m11", type: "M11", params: { seriesAssetIds: null }, refs: [], outputs: [] });
    const c = computeSheet(pipeline);
    expect(c.results["m11"].status).toBe("done");
    expect(c.results["m11"].assets).toEqual([]);
  });

  it("toCsv: 전체 자릿수·이스케이프", () => {
    const csv = toCsv([
      { label: "t", values: [0, 1] },
      { label: 'l,"주계약"', values: [100000, 99793.00000000001] },
    ]);
    expect(csv.split("\n")).toEqual([
      't,"l,""주계약"""',
      "0,100000",
      "1,99793.00000000001",
    ]);
  });
});
