/**
 * 파이프라인 계산 레이어 E2E (P2 자기 검증).
 * 화면과 동일한 모듈 구성으로 G1·G2·G3 골든값과 float64 완전 일치해야 한다.
 */
import { describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { computeSheet, recommendNext } from "@/lib/engine/pipeline";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id,
  type,
  params,
  refs: [],
  outputs: [],
});

const base = () => [
  mk("m1", "M01", { productName: "정기보험 예제", productType: "term", memo: "" }),
  mk("m2", "M02", {
    age: 40, sex: "male", years: 20, payYears: 20,
    sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
  }),
  mk("m3", "M03", { libraryKey: "male" }),
  mk("m4", "M04", { i: 0.025 }),
  mk("m5", "M05", { qAssetIds: ["m3:q"], l0: 100_000, combine: "single", usage: "survivors" }),
  mk("m6", "M06", { lAssetId: "m5:l", qAssetId: "m3:q" }),
  mk("m7", "M07", {
    kind: "income", timing: "begin", seriesAssetId: "m5:l", vAssetId: "m4:v",
    amountMode: "S", customAmount: 0,
  }),
  mk("m8", "M07", {
    kind: "death", timing: "end", seriesAssetId: "m6:d", vAssetId: "m4:v",
    amountMode: "S", customAmount: 0,
  }),
  mk("m9", "M08", { incomeAssetIds: ["m7:total"], outgoAssetIds: ["m8:total"], lAssetId: "m5:l" }),
];

describe("computeSheet: G1 정기보험 E2E", () => {
  const c = computeSheet(base());

  it("전 모듈 done, 골든 중간 계열·현가·보험료 완전 일치", () => {
    for (const [id, r] of Object.entries(c.results)) {
      expect(r.status, `${id}: ${r.message}`).toBe("done");
    }
    expect(c.byId["m5:l"].value).toEqual(expected.G1.l);
    expect(c.byId["m6:d"].value).toEqual(expected.G1.d);
    expect(c.byId["m4:v"].value).toEqual(expected.G1.vp);
    expect(c.byId["m7:total"].value).toBe(expected.G1.pvIn);
    expect(c.byId["m8:total"].value).toBe(expected.G1.pvDeath);
    expect(c.final.nsp).toBe(expected.G1.NSP);
    expect(c.final.p).toBe(expected.G1.P);
    expect(c.final.pRounded).toBe(410386);
  });

  it("연도별 현가 계열의 순차 합 = 합계 스칼라", () => {
    const terms = c.byId["m8:series"].value as number[];
    let acc = 0;
    for (const x of terms) acc += x;
    expect(acc).toBe(expected.G1.pvDeath);
  });

  it("자동 코드 명명: q1·v1·l1·d1·pvin1·pvout1·p_annual", () => {
    expect(c.byId["m3:q"].def.code).toBe("q1");
    expect(c.byId["m4:v"].def.code).toBe("v1");
    expect(c.byId["m5:l"].def.code).toBe("l1");
    expect(c.byId["m6:d"].def.code).toBe("d1");
    expect(c.byId["m7:total"].def.code).toBe("pvin1");
    expect(c.byId["m8:total"].def.code).toBe("pvout1");
    expect(c.byId["m9:p"].def.code).toBe("p_annual");
  });
});

describe("computeSheet: G2·G3 변형", () => {
  it("G2: 만기급부 추가 → 생사혼합 P 일치", () => {
    const pipeline = base();
    pipeline.splice(8, 0, mk("m8b", "M07", {
      kind: "maturity", timing: "end", seriesAssetId: "m5:l", vAssetId: "m4:v",
      amountMode: "S", customAmount: 0,
    }));
    pipeline[9] = mk("m9", "M08", {
      incomeAssetIds: ["m7:total"],
      outgoAssetIds: ["m8:total", "m8b:total"],
      lAssetId: "m5:l",
    });
    const c = computeSheet(pipeline);
    expect(c.byId["m8b:total"].value).toBe(expected.G2.pvMaturity);
    expect(c.final.nsp).toBe(expected.G2.NSP);
    expect(c.final.p).toBe(expected.G2.P);
  });

  it("G3: 사망급부 연중 현가 → P 일치", () => {
    const pipeline = base();
    pipeline[7] = mk("m8", "M07", {
      kind: "death", timing: "mid", seriesAssetId: "m6:d", vAssetId: "m4:v",
      amountMode: "S", customAmount: 0,
    });
    const c = computeSheet(pipeline);
    expect(c.final.p).toBe(expected.G3.P);
  });
});

describe("computeSheet: 실패 처리 (§3.9)", () => {
  it("계약조건 없이 M04 → 입력 중(editing) 상태", () => {
    const c = computeSheet([mk("a", "M04", { i: 0.025 })]);
    expect(c.results["a"].status).toBe("editing");
  });

  it("깨진 참조 → 오류 상태 + 원인 메시지", () => {
    const pipeline = base().slice(0, 6);
    pipeline[5] = mk("m6", "M06", { lAssetId: "없는자산", qAssetId: "m3:q" });
    const c = computeSheet(pipeline);
    expect(c.results["m6"].status).toBe("error");
    expect(c.results["m6"].message).toContain("참조 자산");
  });

  it("위험률 표 연령 범위 부족 → 오류", () => {
    const pipeline = base();
    pipeline[1].params = { ...pipeline[1].params, age: 90 };
    const c = computeSheet(pipeline);
    expect(c.results["m5"].status).toBe("error");
    expect(c.results["m5"].message).toContain("연령 범위");
  });
});

describe("recommendNext (§3.1)", () => {
  it("빈 파이프라인 → M01, 위험률 다음 → 이자율", () => {
    expect(recommendNext([])).toEqual(["M01"]);
    expect(recommendNext(base().slice(0, 3))).toEqual(["M04", "M03"]);
  });

  it("반복 불가 모듈은 이미 있으면 추천에서 제외", () => {
    const p = base();
    expect(recommendNext(p)).toEqual([]);
    expect(recommendNext(p.slice(0, 1))).toEqual(["M02"]);
  });
});
