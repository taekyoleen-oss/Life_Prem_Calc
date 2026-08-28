import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">PremiaFlow</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          생명보험 보험료를 단계별로 산출하고, 동일한 계산을 Python·VBA 코드로
          검증합니다.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/w/guest"
          className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
        >
          바로 시작 (게스트)
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border bg-card px-5 py-2.5 font-semibold hover:bg-muted"
        >
          로그인
        </Link>
      </div>
    </main>
  );
}
