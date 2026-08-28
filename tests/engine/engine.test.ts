import { describe, expect, it } from "vitest";
import { deaths, survivors } from "@/lib/engine/decrement";
import { discountFactors, pvBenefit, pvIncome, pvMaturity } from "@/lib/engine/pv";
import {
  annualNetPremium,
  grossPremiumA,
  grossPremiumB,
  netSinglePremium,
  roundPremium,
} from "@/lib/engine/premium";

describe("decrement (M05·M06)", () => {
  it("단일탈퇴: l_{t+1} = l_t(1-q_t)", () => {
    const l = survivors(1000, [[0.1, 0.2]], "single");
    expect(l).toHaveLength(3);
    expect(l[0]).toBe(1000);
    expect(l[1]).toBeCloseTo(900, 10);
    expect(l[2]).toBeCloseTo(720, 10);
  });

  it("독립 곱 결합: l_{t+1} = l_t(1-q1)(1-q2)", () => {
    const l = survivors(1000, [[0.1, 0.1], [0.2, 0.2]], "independent");
    expect(l[1]).toBeCloseTo(720, 10);
    expect(l[2]).toBeCloseTo(518.4, 10);
  });

  it("단순 합산 결합: l_{t+1} = l_t(1-Σq)", () => {
    const l = survivors(1000, [[0.1], [0.2]], "sum");
    expect(l[1]).toBeCloseTo(700, 10);
  });

  it("단일탈퇴에 q 2개 선택·길이 불일치는 오류", () => {
    expect(() => survivors(1000, [[0.1], [0.2]], "single")).toThrow();
    expect(() => survivors(1000, [[0.1, 0.2], [0.2]], "independent")).toThrow();
    expect(() => survivors(1000, [], "independent")).toThrow();
  });

  it("사망자수: d_t = l_t·q_t", () => {
    const d = deaths([1000, 900], [0.1, 0.2]);
    expect(d[0]).toBeCloseTo(100, 10);
    expect(d[1]).toBeCloseTo(180, 10);
    expect(() => deaths([1000], [0.1, 0.2])).toThrow();
  });
});

describe("pv (M04·M07)", () => {
  it("할인계수: v^t 누적 곱", () => {
    expect(discountFactors(0, 3)).toEqual([1, 1, 1]);
    // i=1 → v=0.5 (이진수로 정확)
    expect(discountFactors(1, 3)).toEqual([1, 0.5, 0.25]);
  });

  it("수입현가(연시): Σ lp·v^t", () => {
    expect(pvIncome([10, 20, 30], [1, 0.5, 0.25], 3)).toBe(10 + 10 + 7.5);
    expect(pvIncome([10, 20, 30], [1, 0.5, 0.25], 2)).toBe(20);
    expect(() => pvIncome([10], [1], 2)).toThrow();
  });

  it("지급현가 시점: 연말 v^{t+1} · 연시 v^t · 연중 v^{t+1/2}", () => {
    const vp = [1, 0.5, 0.25];
    expect(pvBenefit([8, 16], vp, 1, 2, "end")).toBe(8 * 0.5 + 16 * 0.25);
    expect(pvBenefit([8, 16], vp, 1, 2, "begin")).toBe(8 + 16 * 0.5);
    const sq = Math.sqrt(0.5);
    expect(pvBenefit([8, 16], vp, 1, 2, "mid")).toBeCloseTo(8 * sq + 16 * 0.5 * sq, 10);
    // i=0이면 세 시점이 모두 동일
    const vp0 = [1, 1, 1];
    for (const timing of ["begin", "mid", "end"] as const) {
      expect(pvBenefit([10, 20], vp0, 2, 2, timing)).toBe(60);
    }
  });

  it("만기 지급현가: amount·l_n·v^n", () => {
    expect(pvMaturity(2, 100, 0.25)).toBe(50);
  });
});

describe("premium (M08·M09)", () => {
  it("NSP·연납 P·방식 B", () => {
    expect(netSinglePremium(200, 100)).toBe(2);
    expect(annualNetPremium(200, 50)).toBe(4);
    expect(grossPremiumB(100, 0.2)).toBe(125);
  });

  it("방식 A: 수지상등 항등식 G = P + 부가보험료 합", () => {
    const r = grossPremiumA({
      alpha: 0.03,
      beta: 0.002,
      gamma: 0.03,
      S: 1000,
      l0: 100,
      pvOut: 50_000,
      pvIn: 1_400,
      maintenanceBase: 1_500,
    });
    const p = 50_000 / 1_400;
    expect(r.G).toBeCloseTo(p + r.loadingAlpha + r.loadingBeta + r.loadingGamma, 8);
    expect(r.loadingTotal).toBeCloseTo(r.G - p, 10);
    expect(r.loadingGamma).toBeCloseTo(0.03 * r.G, 12);
  });

  it("γ=0이면 G = (PVout + α·S·l0 + β·S·E) / PVin", () => {
    const r = grossPremiumA({
      alpha: 0.1,
      beta: 0,
      gamma: 0,
      S: 10,
      l0: 100,
      pvOut: 900,
      pvIn: 100,
      maintenanceBase: 0,
    });
    expect(r.G).toBe((900 + 0.1 * 10 * 100) / 100);
  });

  it("단수처리: half-up 반올림·절사·올림", () => {
    expect(roundPremium(1234.5)).toBe(1235);
    expect(roundPremium(1234.4)).toBe(1234);
    expect(roundPremium(1236, 1, "floor")).toBe(1230);
    expect(roundPremium(1231, 1, "ceil")).toBe(1240);
  });
});
