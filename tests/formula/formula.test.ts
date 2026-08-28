import { describe, expect, it } from "vitest";
import { FormulaError, tokenize } from "@/lib/formula/tokenizer";
import { parse } from "@/lib/formula/parser";
import { evaluate, type FormulaEnv } from "@/lib/formula/evaluator";

const ev = (src: string, env: FormulaEnv = {}) => evaluate(parse(src), env);

describe("tokenizer", () => {
  it("블록 모드 기호 ×÷−를 정규화한다", () => {
    const ops = tokenize("1×2÷3−4").filter((t) => t.type === "op").map((t) => t.value);
    expect(ops).toEqual(["*", "/", "-"]);
  });

  it("2문자 비교 연산자를 우선 인식한다", () => {
    const ops = tokenize("a<=b<>c>=d").filter((t) => t.type === "op").map((t) => t.value);
    expect(ops).toEqual(["<=", "<>", ">="]);
  });

  it("인식할 수 없는 문자는 위치와 함께 오류", () => {
    expect(() => tokenize("1 @ 2")).toThrow(FormulaError);
  });
});

describe("parser·evaluator: 산술", () => {
  it("연산자 우선순위", () => {
    expect(ev("1+2*3")).toBe(7);
    expect(ev("(1+2)*3")).toBe(9);
    expect(ev("10/4")).toBe(2.5);
    expect(ev("1+2*3^2")).toBe(19);
  });

  it("^는 우결합, 단항 −는 ^보다 낮게 결합 (-2^2 = -4)", () => {
    expect(ev("2^3^2")).toBe(512);
    expect(ev("-2^2")).toBe(-4);
    expect(ev("2^-2")).toBe(0.25);
    expect(ev("--3")).toBe(3);
  });

  it("비교 연산은 1·0을 반환한다", () => {
    expect(ev("1+1=2")).toBe(1);
    expect(ev("3>2")).toBe(1);
    expect(ev("2<>2")).toBe(0);
  });

  it("문법 오류", () => {
    expect(() => parse("1+")).toThrow(FormulaError);
    expect(() => parse("(1")).toThrow(FormulaError);
    expect(() => parse("1 2")).toThrow(FormulaError);
    expect(() => parse("")).toThrow(FormulaError);
  });
});

describe("evaluator: 참조·브로드캐스트", () => {
  const env: FormulaEnv = { s: [1, 2, 3], s2: [1, 2], k: 2, t: [0, 1, 2] };

  it("계열·스칼라 브로드캐스트", () => {
    expect(ev("s*k", env)).toEqual([2, 4, 6]);
    expect(ev("s+s", env)).toEqual([2, 4, 6]);
    expect(ev("1-s", env)).toEqual([0, -1, -2]);
  });

  it("경과기간 t는 env로 제공되는 계열이다", () => {
    expect(ev("s*t", env)).toEqual([0, 2, 6]);
  });

  it("계열 길이 불일치·미정의 참조는 오류", () => {
    expect(() => ev("s+s2", env)).toThrow(FormulaError);
    expect(() => ev("x+1", env)).toThrow(FormulaError);
  });
});

describe("evaluator: 함수 (v1.0 목록)", () => {
  const env: FormulaEnv = { s: [1, 2, 3], t: [0, 1, 2] };

  it("SUM·CUMSUM·SHIFT", () => {
    expect(ev("SUM(s)", env)).toBe(6);
    expect(ev("SUM(5)", env)).toBe(5);
    expect(ev("CUMSUM(s)", env)).toEqual([1, 3, 6]);
    expect(ev("SHIFT(s, 1)", env)).toEqual([0, 1, 2]);
    expect(ev("SHIFT(s, -1)", env)).toEqual([2, 3, 0]);
  });

  it("ROUND(half-up)·FLOOR·CEIL", () => {
    expect(ev("ROUND(1.5)")).toBe(2);
    expect(ev("ROUND(-1.5)")).toBe(-2);
    expect(ev("ROUND(1.25, 1)")).toBe(1.3);
    expect(ev("FLOOR(1.9)")).toBe(1);
    expect(ev("FLOOR(-1.1)")).toBe(-2);
    expect(ev("CEIL(1.1)")).toBe(2);
  });

  it("MIN·MAX·IF·POW", () => {
    expect(ev("MIN(3, 1, 2)")).toBe(1);
    expect(ev("MAX(s, 2)", env)).toEqual([2, 2, 3]);
    expect(ev("IF(1>2, 5, 6)")).toBe(6);
    expect(ev("IF(s>1, s, 0)", env)).toEqual([0, 2, 3]);
    expect(ev("POW(2, 10)")).toBe(1024);
    expect(ev("POW(s, 2)", env)).toEqual([1, 4, 9]);
  });

  it("인수 개수·정의되지 않은 함수는 오류", () => {
    expect(() => ev("SUM()")).toThrow(FormulaError);
    expect(() => ev("IF(1, 2)")).toThrow(FormulaError);
    expect(() => ev("FOO(1)")).toThrow(FormulaError);
    expect(() => ev("SHIFT(1, 1)")).toThrow(FormulaError);
    expect(() => ev("SHIFT(s, 0.5)", env)).toThrow(FormulaError);
  });
});
