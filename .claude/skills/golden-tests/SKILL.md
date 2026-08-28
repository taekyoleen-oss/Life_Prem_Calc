---
name: golden-tests
description: 골든 케이스 정의·기대값 관리·실행 절차. 엔진·모듈 계산 수정 시 반드시 실행.
---

# golden-tests

## 실행 (엔진·수식·모듈 계산을 수정했다면 무조건)

```bash
npx vitest run
```

`tests/golden/golden.test.ts`가 G1~G4(P3부터 G5)를 고정 기대값과 **float64 완전 일치**로
비교한다. 근사 비교(toBeCloseTo)로 바꾸는 것은 금지.

## 구성 요소

| 파일 | 역할 |
|------|------|
| `docs/domain/golden-cases.md` | 케이스 정의·더미 표 규칙·정준 계산 순서·고정 기대값(단일 기준 문서) |
| `lib/engine/seed/dummy-rates.json` | 더미 위험률 표(시드 데이터, `gen_table.py` 산출물) |
| `tests/golden/expected.json` | 중간 계열 포함 전체 기대값(`reference.py` 산출물, 수기 편집 금지) |
| `scripts/gen_table.py` | 더미 표 생성기 |
| `scripts/reference.py` | 독립 Python 이중 산출(엔진·codegen과 코드 공유 금지) |

## 실패 시

1. 엔진 쪽 연산 순서가 `golden-cases.md` §2 정준 순서와 다른지 먼저 확인한다.
2. 기대값을 엔진에 맞추지 않는다. 케이스 정의 자체가 바뀐 경우에만
   `python .claude/skills/golden-tests/scripts/reference.py`로 재생성하고,
   `golden-cases.md`의 고정 기대값 표를 함께 갱신한 뒤 사용자 검수를 받는다.
3. 3회 재시도 실패 시 산식 가정 확인으로 에스컬레이션(설계서 §7.1).
