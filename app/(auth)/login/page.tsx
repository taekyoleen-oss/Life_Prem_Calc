"use client";

import { useState } from "react";
import Link from "next/link";
import { cloudEnabled, supabase } from "@/lib/supabase/client";

/**
 * 로그인 (설계서 §2.4): v1.0은 이메일 매직링크만.
 * Google OAuth는 자리만 유지 — Google Cloud Console 설정 완료 후 활성화(v1.x).
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const sendLink = async () => {
    if (!supabase || !email.trim()) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/workbooks` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {cloudEnabled
            ? "이메일로 로그인 링크(매직링크)를 보내드립니다."
            : "클라우드 저장(Supabase) 연동 준비 중입니다 — 지금은 게스트 모드를 이용하세요."}
        </p>
      </div>

      {cloudEnabled && state !== "sent" && (
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendLink();
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {state === "sending" ? "보내는 중…" : "매직링크 보내기"}
          </button>
          {state === "error" && (
            <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#991b1b]">{message}</p>
          )}
          <button
            type="button"
            disabled
            title="Google Cloud Console 설정 완료 후 활성화됩니다 (v1.x)"
            className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted-foreground/50"
          >
            Google로 로그인 (준비 중)
          </button>
        </form>
      )}

      {state === "sent" && (
        <p className="max-w-sm rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
          <strong>{email}</strong> 로 로그인 링크를 보냈습니다. 메일함에서 링크를 열면
          로그인됩니다. (스팸함도 확인해 주세요)
        </p>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/w/guest" className="text-primary hover:underline">
          게스트로 계속하기
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          처음으로
        </Link>
      </div>
    </main>
  );
}
