import { create } from "zustand";
import { supabase, cloudEnabled } from "@/lib/supabase/client";
import { cloudAdapter } from "@/lib/storage/cloudAdapter";
import { toWorkbookFile } from "@/lib/storage/localAdapter";
import { useWorkbook, type SheetState } from "./workbook";

/**
 * 클라우드 연동 상태 (설계서 §4.3): 로그인 세션 + 현재 작업공간 ↔ 클라우드
 * 워크북 연결. 연결되면 변경 2초 디바운스로 클라우드에도 자동 저장한다(§4.1).
 * 게스트 → 로그인 이전은 saveAsNewCloudWorkbook(무손실: 시트 id만 재발급).
 */

const LINK_KEY = "pf_cloud_link";

interface CloudLink {
  id: string;
  title: string;
}

interface CloudState {
  email: string | null;
  link: CloudLink | null;
  sync: "idle" | "saving" | "saved" | "error";
  syncMessage?: string;
}

export const useCloud = create<CloudState>(() => ({
  email: null,
  link: null,
  sync: "idle",
}));

function readLink(): CloudLink | null {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    return raw ? (JSON.parse(raw) as CloudLink) : null;
  } catch {
    return null;
  }
}

function writeLink(link: CloudLink | null): void {
  if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
  else localStorage.removeItem(LINK_KEY);
  useCloud.setState({ link });
}

const uid = () => globalThis.crypto.randomUUID();

/** 현재 작업공간을 새 클라우드 워크북으로 저장 (게스트 가져오기). */
export async function saveAsNewCloudWorkbook(title: string): Promise<void> {
  const s = useWorkbook.getState();
  // 시트 id 재발급: 다른 워크북과의 PK 충돌 방지. 모듈·자산 참조는 모듈 id 기반이라 무손실.
  const idMap = new Map(s.sheets.map((sh) => [sh.id, uid()]));
  const sheets: SheetState[] = s.sheets.map((sh) => ({ ...sh, id: idMap.get(sh.id)! }));
  const wbId = uid();
  useCloud.setState({ sync: "saving" });
  try {
    await cloudAdapter.saveWorkbook(toWorkbookFile(sheets, wbId, title));
    useWorkbook.setState({ sheets, activeSheetId: idMap.get(s.activeSheetId) ?? sheets[1].id });
    writeLink({ id: wbId, title });
    useCloud.setState({ sync: "saved", syncMessage: undefined });
  } catch (e) {
    useCloud.setState({ sync: "error", syncMessage: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** 클라우드 워크북을 현재 작업공간으로 불러오기 */
export async function loadCloudWorkbook(id: string): Promise<boolean> {
  const wb = await cloudAdapter.loadWorkbook(id);
  if (!wb) return false;
  const sheets = wb.sheets as SheetState[];
  const normal = sheets.find((sh) => sh.sheetType === "normal");
  if (!sheets.some((sh) => sh.sheetType === "shared") || !normal) return false;
  useWorkbook.setState({ sheets, activeSheetId: normal.id, expandedId: null, hydrated: true });
  writeLink({ id: wb.id, title: wb.title });
  useCloud.setState({ sync: "saved", syncMessage: undefined });
  return true;
}

export function unlinkCloud(): void {
  writeLink(null);
  useCloud.setState({ sync: "idle", syncMessage: undefined });
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  unlinkCloud();
}

// ── 초기화: 세션 구독 + 연결 복원 + 클라우드 자동 저장(2초 디바운스) ──
let initialized = false;

export function initCloud(): void {
  if (initialized || !cloudEnabled || typeof window === "undefined") return;
  initialized = true;

  useCloud.setState({ link: readLink() });

  supabase!.auth.getSession().then(({ data }) => {
    useCloud.setState({ email: data.session?.user.email ?? null });
  });
  supabase!.auth.onAuthStateChange((_event, session) => {
    useCloud.setState({ email: session?.user.email ?? null });
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  useWorkbook.subscribe((s, prev) => {
    if (!s.hydrated || s.sheets === prev.sheets) return;
    const { email, link } = useCloud.getState();
    if (!email || !link) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      useCloud.setState({ sync: "saving" });
      try {
        await cloudAdapter.saveWorkbook(toWorkbookFile(s.sheets, link.id, link.title));
        useCloud.setState({ sync: "saved", syncMessage: undefined });
      } catch (e) {
        useCloud.setState({
          sync: "error",
          syncMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }, 2000);
  });
}
