"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloudEnabled, supabase } from "@/lib/supabase/client";

/**
 * 로그인·회원가입 (설계서 §2.4): 이메일 + 비밀번호.
 * 한 번 가입하면 이후에는 비밀번호로 바로 로그인하고, 세션은 브라우저에 유지된다
 * (supabase-js persistSession·autoRefreshToken 기본값). 프로젝트가 메일 확인 없이
 * 즉시 가입 완료(mailer_autoconfirm)라 가입 버튼 한 번이면 끝난다.
 * 비밀번호 재설정은 재설정 메일 → 같은 페이지의 새 비밀번호 폼으로 처리한다.
 * Google OAuth는 자리만 유지 — Google Cloud Console 설정 완료 후 활성화(v1.x).
 */

type Mode = "signin" | "signup" | "reset" | "newpw";

const KO: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "User already registered": "이미 가입된 이메일입니다 — '로그인'으로 들어오세요.",
  "Email not confirmed": "이메일 확인이 아직 완료되지 않았습니다.",
  "Auth session missing!": "재설정 링크가 만료되었습니다 — 링크를 다시 받아 주세요.",
};

const ko = (m: string): string =>
  KO[m] ??
  (/Password should be at least/.test(m) ? "비밀번호는 6자 이상이어야 합니다." : m);

const LABEL: Record<Mode, { title: string; submit: string }> = {
  signin: { title: "로그인", submit: "로그인" },
  signup: { title: "회원가입", submit: "가입하기" },
  reset: { title: "비밀번호 재설정", submit: "재설정 링크 보내기" },
  newpw: { title: "새 비밀번호 설정", submit: "비밀번호 변경" },
};

const inputCls =
  "rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 재설정 메일 링크는 /login?reset=1 로 착지한다. AuthSession이 링크 오류를 ?error= 로 넘긴다.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("reset")) setMode("newpw");
    const err = q.get("error");
    if (err) setError(`이메일 링크가 만료되었거나 이미 사용되었습니다. (${err})`);
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    if (!supabase) return;
    const mail = email.trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: mail, password });
        if (error) throw error;
        if (!data.session) {
          setNotice(`${mail} 로 보낸 확인 메일의 링크를 열면 가입이 완료됩니다.`);
          return;
        }
        router.push("/workbooks");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        router.push("/workbooks");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, {
          redirectTo: `${window.location.origin}/login?reset=1`,
        });
        if (error) throw error;
        setNotice(`${mail} 로 재설정 링크를 보냈습니다 — 이 브라우저에서 열어 주세요. (스팸함도 확인)`);
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        router.push("/workbooks");
      }
    } catch (e) {
      setError(ko(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">{LABEL[mode].title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {!cloudEnabled
            ? "클라우드 저장(Supabase) 연동 준비 중입니다 — 지금은 게스트 모드를 이용하세요."
            : mode === "signup"
              ? "이메일과 비밀번호로 한 번만 가입하면, 이후에는 비밀번호로 바로 로그인합니다."
              : mode === "reset"
                ? "가입한 이메일로 비밀번호 재설정 링크를 보내드립니다."
                : mode === "newpw"
                  ? "새 비밀번호를 입력하세요 (6자 이상)."
                  : "로그인하면 워크북이 클라우드에 자동 저장됩니다."}
        </p>
      </div>

      {cloudEnabled && (
        <form
          className="flex w-full max-w-sm flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {(mode === "signin" || mode === "signup") && (
            <div className="mb-1 flex rounded-lg border border-border p-0.5 text-sm">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {LABEL[m].title}
                </button>
              ))}
            </div>
          )}

          {mode !== "newpw" && (
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          )}

          {mode !== "reset" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (6자 이상)"
              className={inputCls}
            />
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "처리 중…" : LABEL[mode].submit}
          </button>

          {error && (
            <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>
          )}
          {notice && (
            <p className="rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
              {notice}
            </p>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              비밀번호를 잊으셨나요?
            </button>
          )}
          {(mode === "reset" || mode === "newpw") && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              로그인으로 돌아가기
            </button>
          )}

          {mode === "signin" && (
            <button
              type="button"
              disabled
              title="Google Cloud Console 설정 완료 후 활성화됩니다 (v1.x)"
              className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted-foreground/50"
            >
              Google로 로그인 (준비 중)
            </button>
          )}
        </form>
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
