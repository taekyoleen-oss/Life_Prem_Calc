export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workbookId: string }>;
}) {
  const { workbookId } = await params;
  return (
    <main className="p-8">
      작업공간 {workbookId} — P2에서 구현 (설계서 §2.1)
    </main>
  );
}
