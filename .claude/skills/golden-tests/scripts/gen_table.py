# 더미 위험률 표 생성기 (설계서 §7.3 확정 절차 1단계)
# 생성 규칙은 docs/domain/golden-cases.md 에 기록된 것과 동일해야 한다.
# 실행: python .claude/skills/golden-tests/scripts/gen_table.py
# 출력: lib/engine/seed/dummy-rates.json (커밋 대상 — 이 파일이 단일 기준 데이터)
#
# v2: 성별 구분 폐지(성별은 M02 계약조건에서만 다룬다). 담보 5종으로 재편하고,
#     일반사망률·암발생률은 v1의 사망률(남)·진단률 산식을 그대로 승계해
#     골든 케이스 G1~G5 고정 기대값이 변하지 않게 한다.
import json
import math
import os

AGES = range(0, 101)  # 연령 0~100


def round6(x: float) -> float:
    """소수 6자리 반올림(half-up). 언어 간 동일 재현을 위해 floor 기반으로 정의."""
    return math.floor(x * 1e6 + 0.5) / 1e6


def q_mortality(x: int) -> float:  # 일반사망률 (v1 사망률(남) 산식 승계)
    return min(round6(0.0005 + 0.00005 * 1.09**x), 0.999999)


def q_accident(x: int) -> float:  # 재해사망률 — 연령 의존이 약한 저빈도 담보
    return min(round6(0.00025 + 0.000002 * 1.06**x), 0.999999)


def q_disability(x: int) -> float:  # 50% 이상 장애율
    return min(round6(0.00008 + 0.000008 * 1.09**x), 0.999999)


def q_cancer(x: int) -> float:  # 암발생률 (v1 진단률 산식 승계)
    return min(round6(0.0002 + 0.00002 * 1.08**x), 0.999999)


def q_cancer_surgery(x: int) -> float:  # 암수술률 — 암발생률의 부분집합이라 낮게 둔다
    return min(round6(0.00015 + 0.000015 * 1.08**x), 0.999999)


SERIES = {
    "mortality": (q_mortality, "min(round6(0.0005 + 0.00005 * 1.09^x), 0.999999)", True),
    "accident": (q_accident, "min(round6(0.00025 + 0.000002 * 1.06^x), 0.999999)", True),
    "disability": (q_disability, "min(round6(0.00008 + 0.000008 * 1.09^x), 0.999999)", False),
    "cancer": (q_cancer, "min(round6(0.0002 + 0.00002 * 1.08^x), 0.999999)", False),
    "cancer_surgery": (q_cancer_surgery, "min(round6(0.00015 + 0.000015 * 1.08^x), 0.999999)", False),
}

table = {
    "meta": {
        "name": "PremiaFlow 더미 위험률 표 v2",
        "rule": {k: v[1] for k, v in SERIES.items()} | {"round6": "floor(q * 1e6 + 0.5) / 1e6"},
        "ages": [0, 100],
        "isMortality": {k: v[2] for k, v in SERIES.items()},
    },
    **{k: [v[0](x) for x in AGES] for k, v in SERIES.items()},
}

root = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
out = os.path.normpath(os.path.join(root, "lib", "engine", "seed", "dummy-rates.json"))
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(table, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"written: {out}")
for k in SERIES:
    print(f"  {k}: q(40)={table[k][40]}, q(60)={table[k][60]}, q(100)={table[k][100]}")
