# PremiaFlow 자동 생성 Python 스크립트 — 시트: 탭 1
# 동일 파이프라인은 항상 동일한 코드를 생성합니다 (결정론 템플릿, LLM 미사용).
# 연산 순서는 앱 엔진의 정준 계산 순서와 동일하여 실행값이 화면 값과 일치합니다.
import math
import json

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


# === M01 상품 기본정보 ===
# 상품: 생사혼합보험 (endowment)

# === M02 계약조건 ===
x = 40  # 가입연령 (남)
n = 20  # 보험기간
m = 20  # 납입기간 (연납)
s = 100000000  # 가입금액
t = list(range(n))  # 경과기간 인덱스

# === M03 위험률 표 ===
q1 = [0.00207, 0.002212, 0.002366, 0.002534, 0.002717, 0.002916, 0.003134, 0.003371, 0.003629, 0.003911, 0.004218, 0.004552, 0.004917, 0.005315, 0.005748, 0.00622, 0.006735, 0.007296, 0.007908, 0.008575]  # q_사망_남 · 연령 40~59

# === M04 이자율·현가율 ===
_disc3 = 1 / (1 + 0.025)  # v = 1/(1+i), i = 2.5%
v1 = [1.0]
for _t in range(n):
    v1.append(v1[_t] * _disc3)
v2 = [_x * math.sqrt(_disc3) for _x in v1]  # 연중 v^(t+1/2)

# === M05 생존자수·납입자수 ===
l1 = [float(100000)]  # 단일탈퇴
for _t in range(n):
    l1.append(l1[_t] * (1 - q1[_t]))

# === M06 사망자수·발생자수 ===
d1 = [l1[_t] * q1[_t] for _t in range(n)]  # d = l·q

# === M07 현가합 ===
pvin1_t = [l1[_t] * v1[_t] for _t in range(m)]  # 수입현가(연시) 연도별
pvin1 = 0.0
for _t in range(m):
    pvin1 += l1[_t] * v1[_t]

# === M07 현가합 ===
pvout1_t = [s * d1[_t] * v1[_t + 1] for _t in range(n)]  # 지급현가(연말) 연도별
pvout1 = 0.0
for _t in range(n):
    pvout1 += s * d1[_t] * v1[_t + 1]

# === M07 현가합 ===
pvout2 = s * l1[n] * v1[n]  # 만기 지급현가

# === M08 순보험료 ===
_pvin9 = 0.0
_pvin9 += pvin1
_pvout9 = 0.0
_pvout9 += pvout1
_pvout9 += pvout2
p_annual = _pvout9 / _pvin9  # 연납 순보험료
nsp = _pvout9 / l1[0]  # 일시납 순보험료

# === M09 사업비·영업보험료 ===
_pvin10 = 0.0
_pvin10 += pvin1
_pvout10 = 0.0
_pvout10 += pvout1
_pvout10 += pvout2
_e10 = 0.0  # 유지비 기저 E = Σ l·v^t
for _t in range(n):
    _e10 += l1[_t] * v1[_t]
_na10 = 0.03 * s * l1[0]
_nb10 = 0.002 * s * _e10
g_annual = (_pvout10 + _na10 + _nb10) / (_pvin10 * (1 - 0.03))  # 방식 A

# === 결과 ===
_result = {}
_result["x"] = x
_result["n"] = n
_result["m"] = m
_result["s"] = s
_result["v1"] = v1
_result["v2"] = v2
_result["l1"] = l1
_result["d1"] = d1
_result["pvin1_t"] = pvin1_t
_result["pvin1"] = pvin1
_result["pvout1_t"] = pvout1_t
_result["pvout1"] = pvout1
_result["pvout2"] = pvout2
_result["p_annual"] = p_annual
_result["nsp"] = nsp
_result["g_annual"] = g_annual
print("##RESULT## " + json.dumps(_result))

# 사람이 읽는 요약
for _k in ("nsp", "p_annual", "g_annual"):
    if _k in _result:
        print(_k, "=", _result[_k])
try:
    import pandas as _pd
    _series = {_k: _v for _k, _v in _result.items() if isinstance(_v, list)}
    if _series:
        _n = max(len(_v) for _v in _series.values())
        _df = _pd.DataFrame({_k: _v + [None] * (_n - len(_v)) for _k, _v in _series.items()})
        print(_df.to_string())
except ImportError:
    pass
