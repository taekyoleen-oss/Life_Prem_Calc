/**
 * 공용탭 + 특약 탭 워크북 계산 (설계서 §2.3, 골든 G5).
 * 공용탭(계약조건·사망률·이자율)을 주계약·특약 탭이 함께 참조하고,
 * 특약은 사망률 × 진단률 독립 곱으로 l_특약을 산출한다.
 * 기대값은 독립 Python 이중 산출(reference.py)로 고정 — float64 완전 일치.
 */
import { describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { computeWorkbook } from "@/lib/engine/pipeline";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id, type, params, refs: [], outputs: [],
});

const buildSheets = (i = 0.025) => [
  {
    id: "sh",
    sheetType: "shared" as const,
    pipeline: [
      mk("c1", "M02", {
        age: 40, sex: "male", years: 20, payYears: 20,
        sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
      }),
      mk("c2", "M03", { libraryKeys: ["male"] }),
      mk("c3", "M04", { i, variants: [{ key: "v", timing: "begin" }] }),
    ],
  },
  {
    id: "main",
    sheetType: "normal" as const,
    pipeline: [
      mk("a1", "M05", {
        variants: [{ key: "l", usage: "survivors", qAssetIds: ["c2:q_male"], l0: 100_000, combine: "single" }],
      }),
      mk("a2", "M06", { lAssetId: "a1:l", qAssetId: "c2:q_male" }),
      mk("a3", "M07", { kind: "income", timing: "begin", seriesAssetId: "a1:l", vAssetId: "c3:v", amountMode: "S", customAmount: 0 }),
      mk("a4", "M07", { kind: "death", timing: "end", seriesAssetId: "a2:d", vAssetId: "c3:v", amountMode: "S", customAmount: 0 }),
      mk("a5", "M08", { incomeAssetIds: ["a3:total"], outgoAssetIds: ["a4:total"], lAssetId: "a1:l" }),
    ],
  },
  {
    id: "rider",
    sheetType: "normal" as const,
    pipeline: [
      mk("b1", "M03", { libraryKeys: ["diagnosis"] }),
      mk("b2", "M05", {
        variants: [{
          key: "l", usage: "survivors",
          qAssetIds: ["c2:q_male", "b1:q_diagnosis"], // 사망 × 진단 독립 곱 (순서 = 정준 순서)
          l0: 100_000, combine: "independent",
        }],
      }),
      mk("b3", "M06", { lAssetId: "b2:l", qAssetId: "b1:q_diagnosis" }),
      mk("b4", "M07", { kind: "income", timing: "begin", seriesAssetId: "b2:l", vAssetId: "c3:v", amountMode: "S", customAmount: 0 }),
      mk("b5", "M07", { kind: "death", timing: "end", seriesAssetId: "b3:d", vAssetId: "c3:v", amountMode: "custom", customAmount: 10_000_000 }),
      mk("b6", "M08", { incomeAssetIds: ["b4:total"], outgoAssetIds: ["b5:total"], lAssetId: "b2:l" }),
    ],
  },
];

describe("G5: 공용탭 + 진단특약 탭", () => {
  const comps = computeWorkbook(buildSheets());

  it("주계약 탭: 공용탭 참조로 골든 G1 완전 일치", () => {
    for (const [id, r] of Object.entries(comps["main"].results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(comps["main"].final.p).toBe(expected.G1.P);
  });

  it("특약 탭: l_특약·d_진단·현가·연납 P 완전 일치", () => {
    for (const [id, r] of Object.entries(comps["rider"].results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(comps["rider"].byId["b2:l"].value).toEqual(expected.G5.l);
    expect(comps["rider"].byId["b3:d"].value).toEqual(expected.G5.d);
    expect(comps["rider"].byId["b4:total"].value).toBe(expected.G5.pvIn);
    expect(comps["rider"].byId["b5:total"].value).toBe(expected.G5.pvDiag);
    expect(comps["rider"].final.p).toBe(expected.G5.P);
  });

  it("코드 유일성: 일반 탭 자동 명명이 공용탭 코드를 피한다 (§3.3)", () => {
    // 공용탭 q1·v1 → 특약 탭 진단률은 q2
    expect(comps["rider"].byId["b1:q_diagnosis"].def.code).toBe("q2");
    // 탭 간(주계약 vs 특약)은 서로 독립 범위 — 둘 다 l1 사용 가능
    expect(comps["main"].byId["a1:l"].def.code).toBe("l1");
    expect(comps["rider"].byId["b2:l"].def.code).toBe("l1");
  });

  it("공용탭 수정(이율 변경) 시 주계약·특약 탭이 동시에 재계산된다", () => {
    const changed = computeWorkbook(buildSheets(0.03));
    expect(changed["main"].final.p).not.toBe(comps["main"].final.p);
    expect(changed["rider"].final.p).not.toBe(comps["rider"].final.p);
    // 이율 상승 → 보험료 하락 (계리 방향성)
    expect(changed["main"].final.p!).toBeLessThan(comps["main"].final.p!);
    expect(changed["rider"].final.p!).toBeLessThan(comps["rider"].final.p!);
  });
});
