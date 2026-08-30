/** 위험률 표 파서 (table-io) + M03 직접 입력 + M10 사용자 수식 */
import { describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { parseRateTable } from "@/lib/engine/table-io";
import { computeSheet } from "@/lib/engine/pipeline";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id, type, params, refs: [], outputs: [],
});

describe("parseRateTable", () => {
  it("헤더 있는 TSV: 열 이름·사망률 제안·연령 구간", () => {
    const t = parseRateTable("연령\t사망률남\t진단률\n40\t0.001\t0.0002\n41\t0.002\t0.0003");
    expect(t.startAge).toBe(40);
    expect(t.columns.map((c) => c.name)).toEqual(["사망률남", "진단률"]);
    expect(t.columns[0].isMortality).toBe(true);
    expect(t.columns[1].isMortality).toBe(false);
    expect(t.columns[0].values).toEqual([0.001, 0.002]);
  });

  it("헤더 없는 CSV: 자동 열 이름, 결측 0 처리 경고", () => {
    const t = parseRateTable("40,0.001\n41,\n42,0.003");
    expect(t.columns[0].name).toBe("열1");
    expect(t.columns[0].values).toEqual([0.001, 0, 0.003]);
    expect(t.warnings[0]).toContain("결측값 1건");
  });

  it("검증(§3.9): 연령 불연속·범위 밖 q·비숫자 오류", () => {
    expect(() => parseRateTable("40\t0.001\n42\t0.002")).toThrow("연속하지 않습니다");
    expect(() => parseRateTable("40\t1.5")).toThrow("[0, 1] 범위");
    expect(() => parseRateTable("40\t0.001\n41\tabc")).toThrow("숫자로 해석");
    expect(() => parseRateTable("")).toThrow();
  });
});

describe("M03 직접 입력 → 파이프라인", () => {
  it("붙여넣은 표의 선택 열로 골든 G1 재현 (완전 일치)", async () => {
    const seed = (await import("@/lib/engine/seed/dummy-rates.json")).default;
    // 더미 일반사망률 40~59 구간 + 무관한 열 하나를 붙여넣었다고 가정
    const text = [
      "연령\t사망률\t해지율",
      ...Array.from({ length: 20 }, (_, t) => `${40 + t}\t${seed.mortality[40 + t]}\t0.01`),
    ].join("\n");
    const parsed = parseRateTable(text);
    const custom = {
      startAge: parsed.startAge,
      columns: parsed.columns.map((c, i) => ({ ...c, selected: i === 0 })), // 사망률 열만 선택
    };
    const pipeline = [
      mk("m2", "M02", {
        age: 40, sex: "male", years: 20, payYears: 20,
        sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
      }),
      mk("m3", "M03", { source: "custom", custom, libraryKeys: [] }),
      mk("m4", "M04", { i: 0.025, variants: [{ key: "v", timing: "begin" }] }),
      mk("m5", "M05", {
        variants: [{ key: "l", usage: "survivors", qAssetIds: ["m3:c0"], l0: 100_000, combine: "single" }],
      }),
      mk("m6", "M06", { lAssetId: "m5:l", qAssetId: "m3:c0" }),
      mk("m7", "M07", { kind: "income", timing: "begin", seriesAssetId: "m5:l", vAssetId: "m4:v", amountMode: "S", customAmount: 0 }),
      mk("m8", "M07", { kind: "death", timing: "end", seriesAssetId: "m6:d", vAssetId: "m4:v", amountMode: "S", customAmount: 0 }),
      mk("m9", "M08", { incomeAssetIds: ["m7:total"], outgoAssetIds: ["m8:total"], lAssetId: "m5:l" }),
    ];
    const c = computeSheet(pipeline);
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    // 선택하지 않은 '해지율' 열은 자산으로 등록되지 않는다
    expect(c.byId["m3:c1"]).toBeUndefined();
    expect(c.byId["m3:c0"].def.isMortality).toBe(true);
    expect(c.final.p).toBe(expected.G1.P);
  });
});

describe("M10 사용자 수식 → 파이프라인", () => {
  const base = () => [
    mk("m2", "M02", {
      age: 40, sex: "male", years: 20, payYears: 20,
      sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
    }),
    mk("m3", "M03", { libraryKeys: ["mortality"] }),
    mk("m4", "M04", { i: 0.025, variants: [{ key: "v", timing: "begin" }] }),
    mk("m5", "M05", {
      variants: [{ key: "l", usage: "survivors", qAssetIds: ["m3:q_mortality"], l0: 100_000, combine: "single" }],
    }),
  ];

  it("자산 코드·t를 변수로 계열·스칼라 수식 평가", () => {
    const pipeline = [
      ...base(),
      mk("f1", "M10", { expression: "l1 * v1" }),
      mk("f2", "M10", { expression: "SUM(SHIFT(f1, 1)) / n" }),
    ];
    const c = computeSheet(pipeline);
    expect(c.results["f1"].status).toBe("done");
    expect(c.results["f2"].status).toBe("done");
    const f1 = c.byId["f1:f"].value as number[];
    expect(f1.length).toBe(21);
    expect(f1[0]).toBe(100_000);
    expect(c.byId["f1:f"].def.code).toBe("f1");
    expect(typeof c.byId["f2:f"].value).toBe("number");
  });

  it("표 자산은 계약 구간 슬라이스로 노출된다 (q1[0] = q_40)", () => {
    const pipeline = [...base(), mk("f1", "M10", { expression: "SUM(q1)" })];
    const c = computeSheet(pipeline);
    const seedSum = (c.byId["m3:q_mortality"].value as { values: number[] }).values
      .slice(40, 60)
      .reduce((a, b) => a + b, 0);
    expect(c.byId["f1:f"].value).toBeCloseTo(seedSum, 12);
  });

  it("문법·미정의 참조는 입력 중(인라인 오류), 하류·자기 참조는 차단", () => {
    const pipeline = [...base(), mk("f1", "M10", { expression: "l1 +" })];
    expect(computeSheet(pipeline).results["f1"].status).toBe("editing");

    // 하류 자산(자기 뒤에 등록될 f2)을 참조 → 정의되지 않은 참조
    const p2 = [...base(), mk("f1", "M10", { expression: "f2 + 1" }), mk("f2", "M10", { expression: "1" })];
    const c2 = computeSheet(p2);
    expect(c2.results["f1"].status).toBe("editing");
    expect(c2.results["f1"].message).toContain("정의되지 않은 참조");
  });
});
