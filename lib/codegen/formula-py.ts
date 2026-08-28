import type { FormulaNode } from "@/lib/formula/parser";

/**
 * M10 수식 AST → Python 표현식 (설계서 §3.5).
 * 요소별 브로드캐스트는 생성 스크립트 상단의 헬퍼(_bc, _map, _sum …)를 사용해
 * 평가기(lib/formula/evaluator.ts)와 동일한 의미를 유지한다. 결정론 변환.
 */

const BIN_LAMBDA: Record<string, string> = {
  "+": "lambda _x, _y: _x + _y",
  "-": "lambda _x, _y: _x - _y",
  "*": "lambda _x, _y: _x * _y",
  "/": "lambda _x, _y: _x / _y",
  "^": "math.pow",
  "=": "lambda _x, _y: 1.0 if _x == _y else 0.0",
  "<>": "lambda _x, _y: 1.0 if _x != _y else 0.0",
  "<": "lambda _x, _y: 1.0 if _x < _y else 0.0",
  "<=": "lambda _x, _y: 1.0 if _x <= _y else 0.0",
  ">": "lambda _x, _y: 1.0 if _x > _y else 0.0",
  ">=": "lambda _x, _y: 1.0 if _x >= _y else 0.0",
};

const FN_HELPER: Record<string, string> = {
  SUM: "_sum",
  CUMSUM: "_cumsum",
  SHIFT: "_shift",
  ROUND: "_round_hu",
  FLOOR: "_floor_d",
  CEIL: "_ceil_d",
  MIN: "_minmax_min",
  MAX: "_minmax_max",
  IF: "_if",
  POW: "_pow",
};

export function astToPython(node: FormulaNode): string {
  switch (node.type) {
    case "num":
      return String(node.value);
    case "ref":
      return node.name;
    case "unary":
      return `_map(${astToPython(node.operand)}, lambda _x: -_x)`;
    case "binary":
      return `_bc(${astToPython(node.left)}, ${astToPython(node.right)}, ${BIN_LAMBDA[node.op]})`;
    case "call": {
      const fn = FN_HELPER[node.fn];
      if (!fn) throw new Error(`Python 변환이 정의되지 않은 함수: ${node.fn}`);
      return `${fn}(${node.args.map(astToPython).join(", ")})`;
    }
  }
}

/** 생성 스크립트 상단 공통 헬퍼 — 평가기와 동일 의미 (결정론 템플릿) */
export const PY_HELPERS = `\
def _map(a, f):
    return [f(x) for x in a] if isinstance(a, list) else f(a)

def _bc(a, b, f):
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            raise ValueError("series length mismatch: %d != %d" % (len(a), len(b)))
        return [f(x, y) for x, y in zip(a, b)]
    if isinstance(a, list):
        return [f(x, b) for x in a]
    if isinstance(b, list):
        return [f(a, y) for y in b]
    return f(a, b)

def _sum(s):
    if not isinstance(s, list):
        return s
    _acc = 0.0
    for _x in s:
        _acc += _x
    return _acc

def _cumsum(s):
    _out = []
    _acc = 0.0
    for _x in s:
        _acc += _x
        _out.append(_acc)
    return _out

def _shift(s, k):
    k = int(k)
    return [s[_i - k] if 0 <= _i - k < len(s) else 0 for _i in range(len(s))]

def _round_hu(x, d=0):
    _p = 10.0 ** d
    def _r(v):
        return -math.floor(-v * _p + 0.5) / _p if v < 0 else math.floor(v * _p + 0.5) / _p
    return _map(x, _r)

def _floor_d(x, d=0):
    _p = 10.0 ** d
    return _map(x, lambda v: math.floor(v * _p) / _p)

def _ceil_d(x, d=0):
    _p = 10.0 ** d
    return _map(x, lambda v: math.ceil(v * _p) / _p)

def _minmax(args, f):
    _acc = args[0]
    for _v in args[1:]:
        _acc = _bc(_acc, _v, f)
    return _acc

def _minmax_min(*args):
    return _minmax(list(args), min)

def _minmax_max(*args):
    return _minmax(list(args), max)

def _if(c, a, b):
    _lists = [len(v) for v in (c, a, b) if isinstance(v, list)]
    if len(set(_lists)) > 1:
        raise ValueError("series length mismatch in IF")
    if not _lists:
        return a if c != 0 else b
    _n = _lists[0]
    def _at(v, i):
        return v[i] if isinstance(v, list) else v
    return [_at(a, _i) if _at(c, _i) != 0 else _at(b, _i) for _i in range(_n)]

def _pow(a, b):
    return _bc(a, b, math.pow)
`;
