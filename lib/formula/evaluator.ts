import { FormulaError } from "./tokenizer";
import type { BinOp, FormulaNode } from "./parser";

/**
 * 수식 평가기 (설계서 §3.4). 요소별(element-wise) 평가, 계열·스칼라 브로드캐스트.
 * 계열 길이 불일치·미정의 참조는 즉시 FormulaError. 비교 연산은 1(참)·0(거짓)을 반환한다.
 * 순환 참조 차단은 자산 그래프 층(P3)에서 수행한다 — 평가기는 해석된 env만 받는다.
 */

export type FormulaValue = number | number[];
/** 자산 코드 → 값. 경과기간 인덱스 `t`도 호출자가 env로 제공한다(예: [0,1,…,n-1]) */
export type FormulaEnv = Record<string, FormulaValue>;

function zip(a: FormulaValue, b: FormulaValue, f: (x: number, y: number) => number): FormulaValue {
  if (typeof a === "number" && typeof b === "number") return f(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      throw new FormulaError(`계열 길이가 일치하지 않습니다: ${a.length} ≠ ${b.length}`);
    }
    return a.map((x, i) => f(x, b[i]));
  }
  if (Array.isArray(a)) return a.map((x) => f(x, b as number));
  return (b as number[]).map((y) => f(a as number, y));
}

function map1(a: FormulaValue, f: (x: number) => number): FormulaValue {
  return Array.isArray(a) ? a.map(f) : f(a);
}

function asScalar(v: FormulaValue, what: string): number {
  if (typeof v !== "number") throw new FormulaError(`${what}은(는) 스칼라여야 합니다.`);
  return v;
}

function asSeries(v: FormulaValue, what: string): number[] {
  if (!Array.isArray(v)) throw new FormulaError(`${what}은(는) 계열이어야 합니다.`);
  return v;
}

const BIN_FNS: Record<BinOp, (x: number, y: number) => number> = {
  "+": (x, y) => x + y,
  "-": (x, y) => x - y,
  "*": (x, y) => x * y,
  "/": (x, y) => x / y,
  "^": (x, y) => Math.pow(x, y),
  "=": (x, y) => (x === y ? 1 : 0),
  "<>": (x, y) => (x !== y ? 1 : 0),
  "<": (x, y) => (x < y ? 1 : 0),
  "<=": (x, y) => (x <= y ? 1 : 0),
  ">": (x, y) => (x > y ? 1 : 0),
  ">=": (x, y) => (x >= y ? 1 : 0),
};

function roundHalfUp(x: number, p: number): number {
  return x < 0 ? -Math.floor(-x * p + 0.5) / p : Math.floor(x * p + 0.5) / p;
}

function digits(args: FormulaValue[], fn: string): number {
  if (args.length < 2) return 0;
  return asScalar(args[1], `${fn}의 자릿수 인수`);
}

function arity(fn: string, args: FormulaValue[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const range = min === max ? `${min}개` : `${min}~${max}개`;
    throw new FormulaError(`${fn} 함수의 인수는 ${range}여야 합니다.`);
  }
}

/** v1.0 함수 목록 (§3.4) */
function callFn(fn: string, args: FormulaValue[]): FormulaValue {
  switch (fn) {
    case "SUM": {
      arity(fn, args, 1);
      const s = args[0];
      if (typeof s === "number") return s;
      let acc = 0;
      for (const x of s) acc += x;
      return acc;
    }
    case "CUMSUM": {
      arity(fn, args, 1);
      const s = asSeries(args[0], "CUMSUM의 인수");
      const out: number[] = [];
      let acc = 0;
      for (const x of s) {
        acc += x;
        out.push(acc);
      }
      return out;
    }
    case "SHIFT": {
      arity(fn, args, 2);
      const s = asSeries(args[0], "SHIFT의 대상");
      const k = asScalar(args[1], "SHIFT의 이동량");
      if (!Number.isInteger(k)) throw new FormulaError("SHIFT의 이동량은 정수여야 합니다.");
      return s.map((_, i) => s[i - k] ?? 0);
    }
    case "ROUND": {
      arity(fn, args, 1, 2);
      const p = 10 ** digits(args, fn);
      return map1(args[0], (x) => roundHalfUp(x, p));
    }
    case "FLOOR": {
      arity(fn, args, 1, 2);
      const p = 10 ** digits(args, fn);
      return map1(args[0], (x) => Math.floor(x * p) / p);
    }
    case "CEIL": {
      arity(fn, args, 1, 2);
      const p = 10 ** digits(args, fn);
      return map1(args[0], (x) => Math.ceil(x * p) / p);
    }
    case "MIN":
    case "MAX": {
      arity(fn, args, 1, Infinity);
      const f = fn === "MIN" ? Math.min : Math.max;
      return args.reduce((acc, v) => zip(acc, v, f));
    }
    case "IF": {
      arity(fn, args, 3);
      const [c, a, b] = args;
      const lens = [c, a, b].filter(Array.isArray).map((s) => (s as number[]).length);
      if (new Set(lens).size > 1) {
        throw new FormulaError(`계열 길이가 일치하지 않습니다: ${lens.join(" ≠ ")}`);
      }
      const len = lens[0];
      if (len === undefined) {
        return (c as number) !== 0 ? (a as number) : (b as number);
      }
      const at = (v: FormulaValue, i: number) => (Array.isArray(v) ? v[i] : v);
      return Array.from({ length: len }, (_, i) =>
        at(c, i) !== 0 ? at(a, i) : at(b, i),
      );
    }
    case "POW": {
      arity(fn, args, 2);
      return zip(args[0], args[1], Math.pow);
    }
    default:
      throw new FormulaError(`정의되지 않은 함수입니다: ${fn}`);
  }
}

export function evaluate(node: FormulaNode, env: FormulaEnv): FormulaValue {
  switch (node.type) {
    case "num":
      return node.value;
    case "ref": {
      const v = env[node.name];
      if (v === undefined) throw new FormulaError(`정의되지 않은 참조입니다: ${node.name}`);
      return v;
    }
    case "unary":
      return map1(evaluate(node.operand, env), (x) => -x);
    case "binary":
      return zip(evaluate(node.left, env), evaluate(node.right, env), BIN_FNS[node.op]);
    case "call":
      return callFn(node.fn, node.args.map((a) => evaluate(a, env)));
  }
}
