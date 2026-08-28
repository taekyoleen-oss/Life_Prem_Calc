import { FormulaError, tokenize, type Token } from "./tokenizer";

/**
 * 수식 파서 (설계서 §3.4). 텍스트 모드·블록 모드가 공유하는 AST를 생성한다.
 * 우선순위(낮음→높음): 비교 < +− < ×÷ < 단항 − < ^(우결합).
 * 단항 −는 ^보다 낮게 결합한다: -2^2 = -(2^2) = -4 (Python·수학 표기와 동일,
 * 코드 생성 시 AST를 괄호로 명시 변환하므로 대상 언어 차이는 없다).
 */

export type BinOp =
  | "+" | "-" | "*" | "/" | "^"
  | "=" | "<>" | "<" | "<=" | ">" | ">=";

export type FormulaNode =
  | { type: "num"; value: number }
  | { type: "ref"; name: string }
  | { type: "unary"; op: "-"; operand: FormulaNode }
  | { type: "binary"; op: BinOp; left: FormulaNode; right: FormulaNode }
  | { type: "call"; fn: string; args: FormulaNode[] };

const CMP_OPS = new Set(["=", "<>", "<", "<=", ">", ">="]);

export function parse(src: string): FormulaNode {
  const tokens = tokenize(src);
  let idx = 0;

  const peek = (): Token | undefined => tokens[idx];
  const next = (): Token | undefined => tokens[idx++];

  function expect(type: Token["type"], what: string): Token {
    const t = next();
    if (!t || t.type !== type) {
      throw new FormulaError(`${what}이(가) 필요합니다.`, t?.pos ?? src.length);
    }
    return t;
  }

  // comparison := additive (cmpOp additive)*
  function comparison(): FormulaNode {
    let left = additive();
    while (peek()?.type === "op" && CMP_OPS.has(peek()!.value)) {
      const op = next()!.value as BinOp;
      left = { type: "binary", op, left, right: additive() };
    }
    return left;
  }

  // additive := term (('+'|'-') term)*
  function additive(): FormulaNode {
    let left = term();
    while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = next()!.value as BinOp;
      left = { type: "binary", op, left, right: term() };
    }
    return left;
  }

  // term := factor (('*'|'/') factor)*
  function term(): FormulaNode {
    let left = factor();
    while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/")) {
      const op = next()!.value as BinOp;
      left = { type: "binary", op, left, right: factor() };
    }
    return left;
  }

  // factor := '-' factor | power
  function factor(): FormulaNode {
    if (peek()?.type === "op" && peek()!.value === "-") {
      next();
      return { type: "unary", op: "-", operand: factor() };
    }
    return power();
  }

  // power := atom ('^' factor)?  — 우결합, 지수에 단항 − 허용 (2^-3)
  function power(): FormulaNode {
    const base = atom();
    if (peek()?.type === "op" && peek()!.value === "^") {
      next();
      return { type: "binary", op: "^", left: base, right: factor() };
    }
    return base;
  }

  // atom := num | ident ('(' args ')')? | '(' comparison ')'
  function atom(): FormulaNode {
    const t = next();
    if (!t) throw new FormulaError("수식이 완결되지 않았습니다.", src.length);
    if (t.type === "num") return { type: "num", value: Number(t.value) };
    if (t.type === "ident") {
      if (peek()?.type === "lparen") {
        next();
        const args: FormulaNode[] = [];
        if (peek()?.type !== "rparen") {
          args.push(comparison());
          while (peek()?.type === "comma") {
            next();
            args.push(comparison());
          }
        }
        expect("rparen", "닫는 괄호 ')'");
        return { type: "call", fn: t.value, args };
      }
      return { type: "ref", name: t.value };
    }
    if (t.type === "lparen") {
      const inner = comparison();
      expect("rparen", "닫는 괄호 ')'");
      return inner;
    }
    throw new FormulaError(`예상하지 못한 토큰입니다: '${t.value}'`, t.pos);
  }

  const root = comparison();
  const rest = peek();
  if (rest) throw new FormulaError(`예상하지 못한 토큰입니다: '${rest.value}'`, rest.pos);
  return root;
}
