---
name: codegen-templates
description: Python·VBA 코드 생성 템플릿 규약·스타일·대사 테스트 방법. 코드 생성 기능 작업 시 참조.
---

# codegen-templates

## 구성

| 파일 | 역할 |
|------|------|
| `lib/codegen/python.ts` | 시트 전체 .py 생성 + 모듈별 스니펫 (`generatePython`, `generatePythonModule`) |
| `lib/codegen/formula-py.ts` | M10 AST → Python 표현식 + 공통 헬퍼(`PY_HELPERS`) |
| `lib/codegen/vba.ts` | 시트 전체 .bas 생성 (M10 Variant 헬퍼 포함) |
| `tests/codegen/python-parity.test.ts` | 대사: 생성 코드 실행값 = 엔진값 (G1~G5·M10, 완전 일치) |
| `tests/codegen/test_parity.py` | pytest 독립 재검증 (`output/codegen/` 산출물 사용) |

## 템플릿 규약

- 결정론: 입력이 같으면 문자열까지 동일. `Date`·난수 금지.
- 스크립트는 **활성 시트 기준**, 공용탭 모듈을 앞에 인라인.
- 변수명 = 자산 코드(§3.3) — 코드가 곧 Python·VBA 식별자.
- 내부 임시 변수는 `_이름{모듈인덱스}` (사용자 코드와 충돌 불가: 코드는 `_` 시작 금지).
- 숫자 리터럴은 JS `String(x)` (shortest round-trip) — Python이 동일 double로 복원.
- 연산 순서는 정준 계산 순서(golden-cases.md §2) 미러링 — float64 대사의 전제.
- 미완성(오류·입력 중) 모듈은 주석으로 생략 표기.

## 대사 실행

```bash
npx vitest run tests/codegen              # 생성→실행→비교 + output/codegen 갱신
python -m pytest tests/codegen/test_parity.py   # 독립 재검증
```

코드 생성 로직을 수정하면 두 명령 모두 통과해야 하고, VBA는
`output/codegen/g1_term.bas`를 Excel에서 실행해 골든 수치를 스팟 체크한다.
