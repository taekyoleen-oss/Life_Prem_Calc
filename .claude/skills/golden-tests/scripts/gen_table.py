# 더미 위험률 표 생성기 (설계서 §7.3 확정 절차 1단계)
# 생성 규칙은 docs/domain/golden-cases.md 에 기록된 것과 동일해야 한다.
# 실행: python .claude/skills/golden-tests/scripts/gen_table.py
# 출력: lib/engine/seed/dummy-rates.json (커밋 대상 — 이 파일이 단일 기준 데이터)
import json
import math
import os

AGES = range(0, 101)  # 연령 0~100


def round6(x: float) -> float:
    """소수 6자리 반올림(half-up). 언어 간 동일 재현을 위해 floor 기반으로 정의."""
    return math.floor(x * 1e6 + 0.5) / 1e6


def q_male(x: int) -> float:
    return min(round6(0.0005 + 0.00005 * 1.09**x), 0.999999)


def q_female(x: int) -> float:
    return min(round6(0.0003 + 0.000035 * 1.09**x), 0.999999)


def q_diagnosis(x: int) -> float:
    return min(round6(0.0002 + 0.00002 * 1.08**x), 0.999999)


table = {
    "meta": {
        "name": "PremiaFlow 더미 위험률 표 v1",
        "rule": {
            "male": "min(round6(0.0005 + 0.00005 * 1.09^x), 0.999999)",
            "female": "min(round6(0.0003 + 0.000035 * 1.09^x), 0.999999)",
            "diagnosis": "min(round6(0.0002 + 0.00002 * 1.08^x), 0.999999)",
            "round6": "floor(q * 1e6 + 0.5) / 1e6",
        },
        "ages": [0, 100],
        "isMortality": {"male": True, "female": True, "diagnosis": False},
    },
    "male": [q_male(x) for x in AGES],
    "female": [q_female(x) for x in AGES],
    "diagnosis": [q_diagnosis(x) for x in AGES],
}

root = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
out = os.path.normpath(os.path.join(root, "lib", "engine", "seed", "dummy-rates.json"))
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(table, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"written: {out}")
print(f"q_male[40]={table['male'][40]}, q_male[59]={table['male'][59]}, q_male[100]={table['male'][100]}")
