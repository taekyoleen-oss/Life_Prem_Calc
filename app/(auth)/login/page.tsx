import Link from "next/link";

/**
 * 로그인 (설계서 §2.4): v1.0은 이메일 매직링크.
 * Supabase 프로젝트 연동(환경 변수) 전에는 게스트 모드를 안내한다.
 * Google OAuth는 자리만 유지(v1.x 활성화).
 */
export default function LoginPage() {
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {cloudReady
            ? "이메일로 매직링크를 보내드립니다."
            : "클라우드 저장(Supabase) 연동 준비 중입니다 — 지금은 게스트 모드를 이용하세요."}
        </p>
      </div>
      {!cloudReady && (
        <Link
          href="/w/guest"
          className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
        >
          게스트로 계속하기 (브라우저 자동 저장)
        </Link>
      )}
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← 처음으로
      </Link>
    </main>
  );
}
