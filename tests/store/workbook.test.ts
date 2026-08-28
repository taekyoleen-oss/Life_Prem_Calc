/**
 * 워크북 스토어: 종목 프리셋(표준 플로우)·참조 자동 재연결·M09(G4)·탭 복제.
 * 프리셋·M09 결과는 골든값과 float64 완전 일치해야 한다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { computeWorkbook, repairRefs } from "@/lib/engine/pipeline";
import { useWorkbook } from "@/lib/store/workbook";

const store = () => useWorkbook.getState();
const activeSheet = () => {
  const s = store();
  return s.sheets.find((sh) => sh.id === s.activeSheetId)!;
};
const activeComp = () => computeWorkbook(store().sheets)[store().activeSheetId];

beforeEach(() => store().reset());

describe("applyPreset: 종목별 표준 플로우", () => {
  it("정기보험 프리셋 = 골든 G1", () => {
    store().applyPreset("term");
    const c = activeComp();
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(c.final.p).toBe(expected.G1.P);
    expect(c.final.nsp).toBe(expected.G1.NSP);
  });

  it("생사혼합 프리셋 = 골든 G2", () => {
    store().applyPreset("endowment");
    const c = activeComp();
    expect(c.final.p).toBe(expected.G2.P);
    expect(c.final.nsp).toBe(expected.G2.NSP);
  });

  it("순수생존 프리셋: 사망 급부 없이 전 단계 완료", () => {
    store().applyPreset("pure");
    const c = activeComp();
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(activeSheet().pipeline.some((m) => m.type === "M06")).toBe(false);
    expect(c.final.p).not.toBeNull();
    expect(c.final.p!).toBeGreaterThan(0);
  });
});

describe("M09 사업비·영업보험료 = 골든 G4", () => {
  it("생사혼합 + 방식 A 기본값(α=3%·β=0.2%·γ=3%) → G·분해 완전 일치", () => {
    store().applyPreset("endowment");
    store().addModule("M09");
    const c = activeComp();
    const m9 = activeSheet().pipeline.find((m) => m.type === "M09")!;
    const r = c.results[m9.id];
    expect(r.status, r.message).toBe("done");
    expect(c.final.g).toBe(expected.G4.G);
    expect(r.extra?.maintenanceBase).toBe(expected.G4.maintenanceBase);
    expect(r.extra?.loadingAlpha).toBe(expected.G4.loadingAlpha);
    expect(r.extra?.loadingBeta).toBe(expected.G4.loadingBeta);
    expect(r.extra?.loadingGamma).toBe(expected.G4.loadingGamma);
    expect(r.extra?.loadingTotal).toBe(expected.G4.loadingTotal);
  });
});

describe("reconnectRefs: 참조 자동 재연결 (§3.9 보강)", () => {
  it("M03 삭제 후 새 M03 삽입 → 깨진 하류를 재연결하면 골든값 복원", () => {
    store().applyPreset("term");
    const m3 = activeSheet().pipeline.find((m) => m.type === "M03")!;
    store().removeModule(m3.id);
    store().addModuleAt(2, "M03");

    let c = activeComp();
    const m5 = activeSheet().pipeline.find((m) => m.type === "M05")!;
    const m6 = activeSheet().pipeline.find((m) => m.type === "M06")!;
    expect(c.results[m5.id].status).toBe("error");

    store().reconnectRefs(m5.id);
    store().reconnectRefs(m6.id);
    c = activeComp();
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(c.final.p).toBe(expected.G1.P);
  });

  it("repairRefs는 유효한 기존 참조를 바꾸지 않는다", () => {
    store().applyPreset("term");
    const pipeline = activeSheet().pipeline;
    const c = activeComp();
    for (let i = 0; i < pipeline.length; i++) {
      const upstream = pipeline.slice(0, i).flatMap((m) => c.results[m.id]?.assets ?? []);
      expect(repairRefs(pipeline[i], upstream)).toBeNull();
    }
  });
});

describe("시트 탭: 복제·삭제", () => {
  it("탭 복제: 내부 참조가 새 모듈 id로 재연결되고 동일 결과", () => {
    store().applyPreset("term");
    const srcId = store().activeSheetId;
    store().duplicateSheet(srcId);
    const copyId = store().activeSheetId;
    expect(copyId).not.toBe(srcId);

    const comps = computeWorkbook(store().sheets);
    expect(comps[copyId].final.p).toBe(expected.G1.P);
    // 복제본 모듈 id는 전부 새로 발급 (원본과 겹치지 않음)
    const srcIds = new Set(store().sheets.find((s) => s.id === srcId)!.pipeline.map((m) => m.id));
    for (const m of store().sheets.find((s) => s.id === copyId)!.pipeline) {
      expect(srcIds.has(m.id)).toBe(false);
    }
  });

  it("마지막 일반 탭 삭제 시 빈 탭이 새로 생긴다 (공용탭은 삭제 불가)", () => {
    const shared = store().sheets.find((s) => s.sheetType === "shared")!;
    const normal = store().sheets.find((s) => s.sheetType === "normal")!;
    store().removeSheet(shared.id); // 무시되어야 함
    expect(store().sheets.some((s) => s.sheetType === "shared")).toBe(true);
    store().removeSheet(normal.id);
    expect(store().sheets.filter((s) => s.sheetType === "normal").length).toBe(1);
  });
});
