/**
 * 워크북 스토어: 종목 프리셋(표준 플로우)·참조 자동 재연결.
 * 프리셋 결과는 골든값과 float64 완전 일치해야 한다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { computeSheet, repairRefs } from "@/lib/engine/pipeline";
import { useWorkbook } from "@/lib/store/workbook";

const store = () => useWorkbook.getState();

beforeEach(() => store().reset());

describe("applyPreset: 종목별 표준 플로우", () => {
  it("정기보험 프리셋 = 골든 G1", () => {
    store().applyPreset("term");
    const c = computeSheet(store().pipeline);
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(c.final.p).toBe(expected.G1.P);
    expect(c.final.nsp).toBe(expected.G1.NSP);
  });

  it("생사혼합 프리셋 = 골든 G2", () => {
    store().applyPreset("endowment");
    const c = computeSheet(store().pipeline);
    expect(c.final.p).toBe(expected.G2.P);
    expect(c.final.nsp).toBe(expected.G2.NSP);
  });

  it("순수생존 프리셋: 사망 급부 없이 전 단계 완료", () => {
    store().applyPreset("pure");
    const c = computeSheet(store().pipeline);
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(store().pipeline.some((m) => m.type === "M06")).toBe(false);
    expect(c.final.p).not.toBeNull();
    expect(c.final.p!).toBeGreaterThan(0);
  });
});

describe("reconnectRefs: 참조 자동 재연결 (§3.9 보강)", () => {
  it("M03 삭제 후 새 M03 삽입 → 깨진 하류를 재연결하면 골든값 복원", () => {
    store().applyPreset("term");
    const m3 = store().pipeline.find((m) => m.type === "M03")!;
    store().removeModule(m3.id);
    store().addModuleAt(2, "M03"); // 새 q 자산 (다른 ID)

    let c = computeSheet(store().pipeline);
    const m5 = store().pipeline.find((m) => m.type === "M05")!;
    const m6 = store().pipeline.find((m) => m.type === "M06")!;
    expect(c.results[m5.id].status).toBe("error");

    store().reconnectRefs(m5.id);
    store().reconnectRefs(m6.id);
    c = computeSheet(store().pipeline);
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(c.final.p).toBe(expected.G1.P);
  });

  it("repairRefs는 유효한 기존 참조를 바꾸지 않는다", () => {
    store().applyPreset("term");
    const pipeline = store().pipeline;
    const c = computeSheet(pipeline);
    for (let i = 0; i < pipeline.length; i++) {
      const upstream = pipeline.slice(0, i).flatMap((m) => c.results[m.id]?.assets ?? []);
      expect(repairRefs(pipeline[i], upstream)).toBeNull();
    }
  });
});
