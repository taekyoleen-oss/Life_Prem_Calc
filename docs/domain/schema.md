# PremiaFlow DB 스키마 (설계서 §4)

Supabase 프로젝트: `premiaflow` (ref `vldzgbvvpuvyyoekskuh`, Seoul).
마이그레이션: `supabase/migrations/20260828000000_init.sql` (= `output/schema.sql`).
적용: `supabase db push` (링크·DB 비밀번호는 `.env.local`의 `SUPABASE_DB_PASSWORD`).

## 테이블 (프리픽스 `pf_`)

| 테이블 | 핵심 컬럼 | RLS |
|--------|-----------|-----|
| `pf_profiles` | id(auth.users FK)·display_name·role(user/admin) | 본인 행만 select/update/insert. 가입 시 트리거 자동 생성 |
| `pf_workbooks` | id·owner_id·title·memo·updated_at | owner 전권 (`owner_id = auth.uid()`) |
| `pf_sheets` | id·workbook_id·name·sheet_type(shared/normal)·position·**pipeline JSONB** | 워크북 owner 경유. 워크북당 공용탭 1개(부분 유니크 인덱스) |
| `pf_risk_library` | id·owner_id(null=공용)·visibility·title·meta·data JSONB | public은 익명 포함 select, private은 owner만, 공용 등록·수정·삭제는 admin |

- 파이프라인 직렬화 형식 = `types/pipeline.ts` (`SCHEMA_VERSION` 관리, §5).
- 공용탭 = `sheet_type='shared'` 시트 행. 별도 공유 자산 테이블 없음(§4.1).
- 클라이언트는 anon key만 사용 — RLS가 유일한 권한 경계. service_role 미사용(금지사항).
- 자동 저장: 로컬 400ms · 클라우드 2초 디바운스(§4.1). Realtime 없음(v1.0).

## 인증

- 이메일 매직링크(v1.0). `site_url = https://premiaflow.vercel.app`,
  redirect 허용: 배포 URL·localhost — `supabase/config.toml` → `supabase config push`.
- Google OAuth는 로그인 화면에 자리만(비활성) — 콘솔 설정 후 활성화(v1.x).
