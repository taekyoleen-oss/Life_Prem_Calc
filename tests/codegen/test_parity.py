# -*- coding: utf-8 -*-
"""생성 Python 대사 테스트 (설계서 §3.5, CLAUDE.md 검증 루틴 3).

output/codegen/의 생성 스크립트를 실행해 기대값(expected.json — vitest가
엔진값으로 기록)과 완전 일치하는지 검증한다.

실행: python -m pytest tests/codegen/test_parity.py
  또는 python tests/codegen/test_parity.py  (pytest 없이 단독 실행)

스크립트·기대값 재생성: npx vitest run tests/codegen
"""
import json
import pathlib
import subprocess
import sys

BASE = pathlib.Path(__file__).resolve().parents[2] / "output" / "codegen"
EXPECTED = json.loads((BASE / "expected.json").read_text(encoding="utf-8"))


def _run(name):
    proc = subprocess.run(
        [sys.executable, str(BASE / (name + ".py"))],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    line = next(l for l in proc.stdout.splitlines() if l.startswith("##RESULT## "))
    return json.loads(line[len("##RESULT## "):])


def _check(name):
    got = _run(name)
    exp = EXPECTED[name]
    assert set(got) == set(exp), f"{name}: 변수 목록 불일치"
    for key, val in exp.items():
        assert got[key] == val, f"{name}.{key}: {got[key]!r} != {val!r}"


def test_g1_term():
    _check("g1_term")


def test_g2_g4_endowment():
    _check("g2_g4_endowment")


def test_g3_mid():
    _check("g3_mid")


def test_g5_rider():
    _check("g5_rider")


def test_m10_formula():
    _check("m10_formula")


if __name__ == "__main__":
    for _name in EXPECTED:
        _check(_name)
        print("OK", _name)
    print("전체 대사 일치 (float64 완전 일치)")
