"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloudEnabled } from "@/lib/supabase/client";
import { cloudAdapter } from "@/lib/storage/cloudAdapter";
import type { WorkbookMeta } from "@/lib/storage/adapter";
import { initCloud, loadCloudWorkbook, useCloud } from "@/lib/store/cloud";

/** 내 워크북 목록 (설계서 §2.1): 클라우드 워크북 CRUD. */
export default function WorkbooksPage() {
  const router = useRouter();
  const { email } = useCloud();
  const [list, setList] = useState<WorkbookMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initCloud();
  }, []);

  useEffect(() => {
    if (!email) return;
    cloudAdapter
      .listWorkbooks()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [email]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-baseline gap-3">
        <Link href="/" className="text-lg font-bold text-primary">
          PremiaFlow
        </Link>
        <h1 className="text-base font-semibold">내 워크북</h1>
        <Link href="/w/guest" className="ml-auto text-sm text-primary hover:underline">
          작업공간으로 →
        </Link>
      </header>

      {!cloudEnabled && (
        <p className="text-sm text-muted-foreground">클라우드가 설정되지 않았습니다 — 게스트 모드를 이용하세요.</p>
      )}

      {cloudEnabled && !email && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm">
          <p className="text-muted-foreground">로그인하면 워크북을 클라우드에 보관하고 어디서나 이어서 작업할 수 있습니다.</p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground hover:opacity-90"
          >
            이메일로 로그인
          </Link>
        </div>
      )}

      {email && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">{email} 로 로그인됨</p>
          {error && <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>}
          {list === null && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          {list?.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              아직 클라우드 워크북이 없습니다. 작업공간 헤더의 <strong>☁ 클라우드에 저장</strong>으로
              현재 게스트 작업을 가져올 수 있습니다.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {list?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    수정: {new Date(m.updatedAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await loadCloudWorkbook(m.id).catch((e) => {
                      window.alert(`불러오기 실패: ${e instanceof Error ? e.message : e}`);
                      return false;
                    });
                    if (ok) router.push("/w/guest");
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`'${m.title}' 워크북을 삭제할까요? 되돌릴 수 없습니다.`)) return;
                    try {
                      await cloudAdapter.deleteWorkbook(m.id);
                      setList((cur) => cur?.filter((x) => x.id !== m.id) ?? null);
                    } catch (e) {
                      window.alert(`삭제 실패: ${e instanceof Error ? e.message : e}`);
                    }
                  }}
                  className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-[#fee2e2] hover:text-[#991b1b]"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
