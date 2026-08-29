"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 매직링크가 어느 페이지에 착지하든 처리한다(§2.4). 루트 레이아웃에 마운트.
 * - 해시를 먼저 읽은 뒤 동적 import로 Supabase 클라이언트를 생성해야
 *   랜딩(site_url 폴백) 페이지에서도 토큰·오류가 유실되지 않는다.
 * - 오류(만료·재사용 링크)는 /login?error= 로 보내 사용자에게 표시한다.
 */
export function AuthSession() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const err = params.get("error_description") ?? params.get("error_code");
    void import("@/lib/store/cloud").then((m) => m.initCloud());
    if (err) router.replace(`/login?error=${encodeURIComponent(err)}`);
  }, [router]);
  return null;
}
