"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 이메일 링크(비밀번호 재설정)가 어느 페이지에 착지하든 처리한다(§2.4). 루트 레이아웃에 마운트.
 * - 해시를 먼저 읽은 뒤 동적 import로 Supabase 클라이언트를 생성해야
 *   랜딩(site_url 폴백) 페이지에서도 토큰·오류가 유실되지 않는다.
 * - 오류(만료·사용된 링크)는 /login?error= 로 보내 사용자에게 표시한다.
 * - 재설정 링크(type=recovery)는 해시가 세션으로 교환된 뒤 /login?reset=1 로 보낸다.
 *   redirect 허용 목록이 없어 site_url로 폴백해도 새 비밀번호를 설정할 수 있다.
 */
export function AuthSession() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const err = params.get("error_description") ?? params.get("error_code");
    const recovery = params.get("type") === "recovery";
    void import("@/lib/store/cloud").then(async (m) => {
      m.initCloud();
      if (err) {
        router.replace(`/login?error=${encodeURIComponent(err)}`);
      } else if (recovery) {
        const { supabase } = await import("@/lib/supabase/client");
        await supabase?.auth.getSession(); // 해시 → 세션 교환 완료를 기다린다
        router.replace("/login?reset=1");
      }
    });
  }, [router]);
  return null;
}
