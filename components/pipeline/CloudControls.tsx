"use client";

import { useEffect } from "react";
import Link from "next/link";
import { cloudEnabled } from "@/lib/supabase/client";
import { initCloud, saveAsNewCloudWorkbook, signOut, useCloud } from "@/lib/store/cloud";

/** 헤더 클라우드 위젯: 로그인 상태·클라우드 저장(게스트 가져오기)·동기화 표시 */
export function CloudControls() {
  const { email, link, sync, syncMessage } = useCloud();

  useEffect(() => {
    initCloud();
  }, []);

  if (!cloudEnabled) return null;

  if (!email) {
    return (
      <Link
        href="/login"
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
      >
        로그인
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      {link ? (
        <span
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            sync === "error"
              ? "bg-[#fee2e2] text-[#991b1b]"
              : "bg-accent text-accent-foreground"
          }`}
          title={syncMessage ?? `클라우드 워크북: ${link.title} — 변경 시 자동 저장`}
        >
          ☁ {sync === "saving" ? "저장 중…" : sync === "error" ? "동기화 오류" : link.title}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            const title = window.prompt("클라우드에 저장할 워크북 이름", "내 워크북");
            if (!title) return;
            saveAsNewCloudWorkbook(title).catch((e) =>
              window.alert(`클라우드 저장 실패: ${e instanceof Error ? e.message : e}`),
            );
          }}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
          title="현재 작업(게스트)을 클라우드 워크북으로 가져오기"
        >
          ☁ 클라우드에 저장
        </button>
      )}
      <Link
        href="/workbooks"
        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
      >
        내 워크북
      </Link>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
        title={`${email} 로그아웃`}
      >
        로그아웃
      </button>
    </span>
  );
}
