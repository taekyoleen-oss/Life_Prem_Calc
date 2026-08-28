/**
 * 골든 테스트 G1~G4 (설계서 §7.3).
 * 기대값은 독립 Python 이중 산출(.claude/skills/golden-tests/scripts/reference.py)로
 * 고정한 tests/golden/expected.json — 엔진 결과와 float64 완전 일치해야 통과다.
 * toBe·toEqual은 근사 없는 정확 비교다.
 */
import { describe, expect, it } from "vitest";
import rates from "@/lib/engine/seed/dummy-rates.json";
import expected from "./expected.json";
import { deaths, survivors } from "@/lib/engine/decrement";
import { discountFactors, pvBenefit, pvIncome, pvMaturity } from "@/lib/engine/pv";
import { annualNetPremium, grossPremiumA, netSinglePremium } from "@/lib/engine/premium";

const { x, n, m, S, i, l0, alpha, beta, gamma } = expected.meta.inputs;

const q = rates.male.slice(x, x + n);
const vp = discountFactors(i, n + 1);
const l = survivors(l0, [q], "single");
const d = deaths(l, q);
const pvIn = pvIncome(l, vp, m);
const pvDeath = pvBenefit(d, vp, S, n, "end");

describe("G1: 40세 남 정기보험 n=m=20, S=1억, i=2.5%, 사망급부 연말", () => {
  it("중간 계열 l·d·v^t 완전 일치", () => {
    expect(vp).toEqual(expected.G1.vp);
    expect(l).toEqual(expected.G1.l);
    expect(d).toEqual(expected.G1.d);
  });

  it("현가·NSP·연납 P 완전 일치", () => {
    expect(pvIn).toBe(expected.G1.pvIn);
    expect(pvDeath).toBe(expected.G1.pvDeath);
    expect(netSinglePremium(pvDeath, l[0])).toBe(expected.G1.NSP);
    expect(annualNetPremium(pvDeath, pvIn)).toBe(expected.G1.P);
  });
});

describe("G2: G1 + 만기(생존)급부 → 생사혼합", () => {
  const pvMat = pvMaturity(S, l[n], vp[n]);
  const pvOut = pvDeath + pvMat;

  it("만기현가·NSP·연납 P 완전 일치", () => {
    expect(pvMat).toBe(expected.G2.pvMaturity);
    expect(pvOut).toBe(expected.G2.pvOut);
    expect(netSinglePremium(pvOut, l[0])).toBe(expected.G2.NSP);
    expect(annualNetPremium(pvOut, pvIn)).toBe(expected.G2.P);
  });
});

describe("G3: G1 사망급부를 연중 현가로 변경", () => {
  const pvDeathMid = pvBenefit(d, vp, S, n, "mid");

  it("연중 현가·연납 P·차이 완전 일치", () => {
    expect(pvDeathMid).toBe(expected.G3.pvDeathMid);
    const p = annualNetPremium(pvDeathMid, pvIn);
    expect(p).toBe(expected.G3.P);
    expect(p - annualNetPremium(pvDeath, pvIn)).toBe(expected.G3.PDiff);
  });
});

describe("G4: G2 + 사업비 방식 A (α=3%·β=0.2%·γ=3%)", () => {
  const pvOut = pvDeath + pvMaturity(S, l[n], vp[n]);
  // 유지비 기저 E = Σ_{t=0}^{n-1} l·v^t — 연시 누적이므로 pvIncome과 동일한 축차
  const maintenanceBase = pvIncome(l, vp, n);
  const r = grossPremiumA({ alpha, beta, gamma, S, l0: l[0], pvOut, pvIn, maintenanceBase });

  it("영업보험료 G·부가보험료 분해 완전 일치", () => {
    expect(maintenanceBase).toBe(expected.G4.maintenanceBase);
    expect(r.G).toBe(expected.G4.G);
    expect(r.loadingAlpha).toBe(expected.G4.loadingAlpha);
    expect(r.loadingBeta).toBe(expected.G4.loadingBeta);
    expect(r.loadingGamma).toBe(expected.G4.loadingGamma);
    expect(r.loadingTotal).toBe(expected.G4.loadingTotal);
  });
});
