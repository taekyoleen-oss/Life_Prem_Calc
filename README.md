# PremiaFlow

생명보험 보험료 단계별 산출 웹앱 (강의·실습용). 수지상등 방식 보험료를 위저드형
파이프라인(M01~M11)으로 산출한다. 상세 설계: `PremiaFlow_설계서_v1.2.md`.

현재 진행 상태: **P5 로컬 파트 완료** — 계산 엔진·골든 테스트(P1), 파이프라인 UI(P2),
공용탭·다중 탭·M09(P3), M10 수식·Python/VBA 코드 생성·대사·강의 모드(P4)에 이어,
브라우저 자동 저장(localStorage)·M11 통합 계산표·CSV/XLSX 내보내기·라이브러리
페이지·키보드 이동(Alt+↑↓)까지 구현. 남은 것: Supabase 연동(로그인·클라우드 저장)과
Vercel 배포 — 계정 연결 필요.

```bash
python -m pytest tests/codegen/test_parity.py   # 생성 Python 대사 (실행값 = 엔진값)
```

## 로컬 실행

요구 사항: Node 22 · npm 10 · (골든 기대값 재생성 시에만) Python 3

```bash
npm install
npm run dev        # http://localhost:3000 → "바로 시작 (게스트)" → 단계 추가로 산출
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
