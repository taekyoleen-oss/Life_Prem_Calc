# PremiaFlow

생명보험 보험료 단계별 산출 웹앱 (강의·실습용). 수지상등 방식 보험료를 위저드형
파이프라인(M01~M11)으로 산출한다. 상세 설계: `PremiaFlow_설계서_v1.2.md`.

현재 진행 상태: **P1 완료** — 계산 엔진(`lib/engine`)·수식 파서(`lib/formula`)·골든 테스트
G1~G4 통과. UI는 P2에서 구현 예정(현재 화면은 라우팅 골격만 있다).

## 로컬 실행

요구 사항: Node 22 · npm 10 · (골든 기대값 재생성 시에만) Python 3

```bash
npm install
npm run dev        # http://localhost:3000 (P1 시점에는 스캐폴드 화면만)
```

## 계산 검증 (P1 핵심)

```bash
npm test           # vitest — 단위 테스트 + 골든 G1~G4 (float64 완전 일치 비교)
npm run build      # 빌드·타입 오류 0 확인
```

골든 기준 수치를 직접 재산출해 보려면(앱 엔진과 독립된 Python 경로):

```bash
python .claude/skills/golden-tests/scripts/reference.py
```

케이스 정의·더미 위험률 표 규칙·고정 기대값: `docs/domain/golden-cases.md`

| 케이스 | 내용 | 확인 값 |
|--------|------|---------|
| G1 | 40세 남, 정기 20년, 1억, 2.5%, 사망급부 연말 | 연납 P = 410,386원 |
| G2 | G1 + 만기급부(생사혼합) | 연납 P = 3,999,133원 |
| G3 | G1 사망급부 연중 현가 | 연납 P = 415,484원 |
| G4 | G2 + 사업비 방식 A(α=3%·β=0.2%·γ=3%) | 영업보험료 G = 4,528,121원 |
