# 골든 케이스 G1~G4 독립 이중 산출 스크립트 (설계서 §7.3 확정 절차 2단계)
# - 앱 엔진(lib/engine)·코드 생성 템플릿과 코드·로직을 일절 공유하지 않는 독립 경로.
# - 연산 순서는 docs/domain/golden-cases.md "정준 계산 순서"와 완전히 동일해야 하며,
#   TS 엔진도 같은 순서를 따라 float64 완전 일치를 달성한다.
# 실행: python .claude/skills/golden-tests/scripts/reference.py
# 출력: tests/golden/expected.json (커밋 대상 — 골든 테스트 고정 기대값)
import json
import math
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

with open(os.path.join(ROOT, "lib", "engine", "seed", "dummy-rates.json"), encoding="utf-8") as f:
    RATES = json.load(f)

# ── 공통 입력 (G1 기준) ────────────────────────────────────────────
X = 40            # 가입연령 (남자)
N = 20            # 보험기간
M = 20            # 납입기간
S = 100_000_000   # 가입금액 1억
I = 0.025         # 예정이율 2.5%
L0 = 100_000      # 기수

q = RATES["male"][X : X + N]  # q_{x} .. q_{x+n-1}

# ── 정준 계산 순서 ────────────────────────────────────────────────
v = 1 / (1 + I)
sqv = math.sqrt(v)

# 할인계수: vp[t] = v^t, 누적 곱으로 산출 (t = 0..n)
vp = [1.0]
for t in range(N):
    vp.append(vp[t] * v)

# 생존자수: l[0] = l0, l[t+1] = l[t] * (1 - q[t])  (t = 0..n-1, 길이 n+1)
l = [float(L0)]
for t in range(N):
    l.append(l[t] * (1 - q[t]))

# 사망자수: d[t] = l[t] * q[t]  (t = 0..n-1)
d = [l[t] * q[t] for t in range(N)]

# 수입현가(연시): PVin = Σ_{t=0}^{m-1} l[t] * vp[t]
pv_in = 0.0
for t in range(M):
    pv_in += l[t] * vp[t]

# 사망 지급현가(연말): Σ_{t=0}^{n-1} S * d[t] * vp[t+1]
pv_death_end = 0.0
for t in range(N):
    pv_death_end += S * d[t] * vp[t + 1]

# 사망 지급현가(연중): Σ_{t=0}^{n-1} S * d[t] * (vp[t] * sqv)
pv_death_mid = 0.0
for t in range(N):
    pv_death_mid += S * d[t] * (vp[t] * sqv)

# 만기 지급현가: S * l[n] * vp[n]
pv_mat = S * l[N] * vp[N]

# ── G1: 정기보험, 사망급부 연말 ──────────────────────────────────
g1_nsp = pv_death_end / l[0]
g1_p = pv_death_end / pv_in

# ── G2: G1 + 만기(생존)급부 → 생사혼합 ───────────────────────────
g2_pv_out = pv_death_end + pv_mat
g2_nsp = g2_pv_out / l[0]
g2_p = g2_pv_out / pv_in

# ── G3: G1 사망급부를 연중 현가로 변경 ───────────────────────────
g3_p = pv_death_mid / pv_in
g3_p_diff = g3_p - g1_p

# ── G5: 공용탭(계약·사망률·이자율) + 진단특약 탭 ──────────────────
# l_특약: 사망률 × 진단률 독립 곱, 진단급부 S2 = 1천만, 연말 현가
Q_DIAG = RATES["diagnosis"][X : X + N]
S2 = 10_000_000

l2 = [float(L0)]
for t in range(N):
    l2.append(l2[t] * (1 - q[t]) * (1 - Q_DIAG[t]))

d2 = [l2[t] * Q_DIAG[t] for t in range(N)]

pv_in2 = 0.0
for t in range(M):
    pv_in2 += l2[t] * vp[t]

pv_diag = 0.0
for t in range(N):
    pv_diag += S2 * d2[t] * vp[t + 1]

g5_p = pv_diag / pv_in2

# ── G4: G2 + 사업비 방식 A (α·β·γ 예시값) ────────────────────────
ALPHA = 0.03   # 가입금액 대비 신계약비 (계약 시 1회)
BETA = 0.002   # 가입금액 대비 연간 유지비 (보험기간 연시)
GAMMA = 0.03   # 영업보험료 대비 수금비 (납입기간)

# 유지비 현가 기저: E = Σ_{t=0}^{n-1} l[t] * vp[t] (보험기간 연시)
e_maint = 0.0
for t in range(N):
    e_maint += l[t] * vp[t]

# G·PVin = PVout + α·S·l0 + β·S·E + γ·G·PVin  →  G = (PVout + α·S·l0 + β·S·E) / (PVin·(1-γ))
n_alpha = ALPHA * S * l[0]
n_beta = BETA * S * e_maint
g4_g = (g2_pv_out + n_alpha + n_beta) / (pv_in * (1 - GAMMA))

# 부가보험료 분해 (1건당)
g4_load_alpha = n_alpha / pv_in
g4_load_beta = n_beta / pv_in
g4_load_gamma = GAMMA * g4_g
g4_load_total = g4_g - g2_p

expected = {
    "meta": {
        "inputs": {"x": X, "n": N, "m": M, "S": S, "i": I, "l0": L0, "sex": "male",
                   "alpha": ALPHA, "beta": BETA, "gamma": GAMMA},
        "source": ".claude/skills/golden-tests/scripts/reference.py",
    },
    "G1": {"l": l, "d": d, "vp": vp, "pvIn": pv_in, "pvDeath": pv_death_end,
           "NSP": g1_nsp, "P": g1_p},
    "G2": {"pvMaturity": pv_mat, "pvOut": g2_pv_out, "NSP": g2_nsp, "P": g2_p},
    "G3": {"pvDeathMid": pv_death_mid, "P": g3_p, "PDiff": g3_p_diff},
    "G4": {"maintenanceBase": e_maint, "G": g4_g,
           "loadingAlpha": g4_load_alpha, "loadingBeta": g4_load_beta,
           "loadingGamma": g4_load_gamma, "loadingTotal": g4_load_total},
    "G5": {"S2": S2, "l": l2, "d": d2, "pvIn": pv_in2, "pvDiag": pv_diag, "P": g5_p},
}

out = os.path.join(ROOT, "tests", "golden", "expected.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(expected, f, ensure_ascii=False, indent=1)
    f.write("\n")

print(f"written: {out}")
print(f"G1  NSP = {g1_nsp!r}\nG1    P = {g1_p!r}")
print(f"G2  NSP = {g2_nsp!r}\nG2    P = {g2_p!r}")
print(f"G3    P = {g3_p!r}  (diff = {g3_p_diff!r})")
print(f"G4    G = {g4_g!r}  (loading = {g4_load_total!r})")
print(f"G5    P = {g5_p!r}  (특약 진단급부 {S2:,})")
