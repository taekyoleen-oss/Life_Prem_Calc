-- PremiaFlow 초기 스키마 (설계서 §4.1, 프리픽스 pf_)
-- RLS: 본인 데이터만. service_role 우회 없음(금지사항).

-- ── 프로필 ─────────────────────────────────────────────────────
create table public.pf_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.pf_profiles enable row level security;

create policy "profiles: 본인 조회" on public.pf_profiles
  for select using (auth.uid() = id);
create policy "profiles: 본인 수정" on public.pf_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: 본인 생성" on public.pf_profiles
  for insert with check (auth.uid() = id);

-- 가입 시 프로필 자동 생성
create function public.pf_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pf_profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger pf_on_auth_user_created
  after insert on auth.users
  for each row execute function public.pf_handle_new_user();

-- ── 워크북 ─────────────────────────────────────────────────────
create table public.pf_workbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.pf_profiles (id) on delete cascade,
  title text not null default '새 워크북',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pf_workbooks enable row level security;

create policy "workbooks: owner 전권" on public.pf_workbooks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── 시트 (공용탭 1 + 일반 탭 n, 파이프라인 JSONB 직렬화 §5) ────
create table public.pf_sheets (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.pf_workbooks (id) on delete cascade,
  name text not null,
  sheet_type text not null check (sheet_type in ('shared', 'normal')),
  position int not null default 0,
  pipeline jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 워크북당 공용탭 1개 강제 (부분 유니크, §4.1)
create unique index pf_sheets_one_shared_per_workbook
  on public.pf_sheets (workbook_id) where sheet_type = 'shared';
create index pf_sheets_workbook_position on public.pf_sheets (workbook_id, position);

alter table public.pf_sheets enable row level security;

create policy "sheets: 워크북 owner 경유" on public.pf_sheets
  for all
  using (exists (
    select 1 from public.pf_workbooks w
    where w.id = workbook_id and w.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.pf_workbooks w
    where w.id = workbook_id and w.owner_id = auth.uid()
  ));

-- ── 위험률 라이브러리 ──────────────────────────────────────────
create table public.pf_risk_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.pf_profiles (id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  title text not null,
  source_note text,
  meta jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pf_risk_library enable row level security;

-- public은 익명 포함 전체 조회, private은 owner만 (§4.1)
create policy "library: 공개 또는 본인 조회" on public.pf_risk_library
  for select using (visibility = 'public' or owner_id = auth.uid());

-- 등록: private은 본인, public은 admin만
create policy "library: 등록" on public.pf_risk_library
  for insert with check (
    (visibility = 'private' and owner_id = auth.uid())
    or (visibility = 'public' and exists (
      select 1 from public.pf_profiles p where p.id = auth.uid() and p.role = 'admin'
    ))
  );

-- 수정·삭제: 본인 행, 공용 행은 admin
create policy "library: 수정" on public.pf_risk_library
  for update using (
    owner_id = auth.uid()
    or (visibility = 'public' and exists (
      select 1 from public.pf_profiles p where p.id = auth.uid() and p.role = 'admin'
    ))
  );
create policy "library: 삭제" on public.pf_risk_library
  for delete using (
    owner_id = auth.uid()
    or (visibility = 'public' and exists (
      select 1 from public.pf_profiles p where p.id = auth.uid() and p.role = 'admin'
    ))
  );
