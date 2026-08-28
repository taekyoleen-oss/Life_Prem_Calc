/**
 * 수식 토크나이저 (설계서 §3.4). eval·Function 금지 — 자체 구현만 사용한다.
 * 블록 모드의 ×·÷·− 기호는 ASCII 연산자로 정규화해 처리한다.
 */

export type TokenType = "num" | "ident" | "op" | "lparen" | "rparen" | "comma";

export interface Token {
  type: TokenType;
  value: string;
  /** 원본 문자열 내 시작 위치 (오류 표시용) */
  pos: number;
}

export class FormulaError extends Error {
  pos?: number;
  constructor(message: string, pos?: number) {
    super(message);
    this.name = "FormulaError";
    this.pos = pos;
  }
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

export function tokenize(src: string): Token[] {
  // 블록 모드 기호 정규화 (×÷−는 1문자 치환이므로 pos가 보존된다)
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (DIGIT.test(c) || (c === "." && DIGIT.test(s[i + 1] ?? ""))) {
      const start = i;
      while (i < s.length && DIGIT.test(s[i])) i++;
      if (s[i] === ".") {
        i++;
        while (i < s.length && DIGIT.test(s[i])) i++;
      }
      tokens.push({ type: "num", value: s.slice(start, i), pos: start });
      continue;
    }
    if (IDENT_START.test(c)) {
      const start = i;
      while (i < s.length && IDENT_CHAR.test(s[i])) i++;
      tokens.push({ type: "ident", value: s.slice(start, i), pos: start });
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", value: c, pos: i++ });
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", value: c, pos: i++ });
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", value: c, pos: i++ });
      continue;
    }
    // 2문자 비교 연산자 우선
    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      tokens.push({ type: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if ("+-*/^<>=".includes(c)) {
      tokens.push({ type: "op", value: c, pos: i++ });
      continue;
    }
    throw new FormulaError(`인식할 수 없는 문자입니다: '${c}'`, i);
  }
  return tokens;
}
