import { create } from "zustand";
import type { M02Params, ModuleInstance, ModuleTypeId } from "@/types/modules";
import {
  computeSheet,
  repairRefs,
  type AssetTag,
  type ComputedAsset,
  type SheetSeed,
} from "@/lib/engine/pipeline";
import { GUEST_WORKBOOK_ID, localAdapter, toWorkbookFile } from "@/lib/storage/localAdapter";

/**
 * 게스트 워크북 스토어 (P3: 공용탭 + 다중 일반 탭, 인메모리).
 * sheets[0]은 항상 공용탭(§2.3). 공용탭 자산은 모든 일반 탭이 참조할 수 있고,
 * 공용탭 수정 시 참조 탭 전체가 자동 재계산된다(computeWorkbook이 순수 함수).
 * localStorage 저장은 P5(localAdapter).
 */

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `m_${Math.random().toString(36).slice(2, 10)}`;

export interface SheetState {
  id: string;
  name: string;
  sheetType: "shared" | "normal";
  pipeline: ModuleInstance[];
}

const initialSheets = (): SheetState[] => [
  { id: uid(), name: "공용", sheetType: "shared", pipeline: [] },
  { id: uid(), name: "탭 1", sheetType: "normal", pipeline: [] },
];

const latestByTag = (assets: ComputedAsset[], ...tags: AssetTag[]): string | null => {
  for (let i = assets.length - 1; i >= 0; i--) {
    if (tags.includes(assets[i].tag)) return assets[i].def.id;
  }
  return null;
};

/** 새 모듈의 기본 파라미터 — 삽입 위치의 상류(공용탭 포함) 자산을 자동 연결 (§3.1) */
function defaultParams(
  type: ModuleTypeId,
  assets: ComputedAsset[],
  contract: M02Params | null,
): Record<string, unknown> {
  switch (type) {
    case "M01":
      return { productName: "", productType: "term", memo: "" };
    case "M02":
      return {
        age: 40, sex: "male", years: 20, payYears: 20,
        sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
      };
    case "M03":
      // 성별 자동 적용 (§3.2 M03)
      return { libraryKeys: [contract?.sex === "female" ? "female" : "male"] };
    case "M04":
      // 기본 소단계 2개: 연시 v^t + 연중 v^{t+1/2}
      return {
        i: 0.025,
        variants: [
          { key: "v", timing: "begin" },
          { key: "v_mid", timing: "mid" },
        ],
      };
    case "M05": {
      const q = latestByTag(assets, "rate");
      return {
        variants: [
          { key: "l", usage: "survivors", qAssetIds: q ? [q] : [], l0: 100_000, combine: "single" },
        ],
      };
    }
    case "M06":
      return {
        lAssetId: latestByTag(assets, "survivors"),
        qAssetId: latestByTag(assets, "rate"),
      };
    case "M07": {
      const hasIncome = assets.some((a) => a.tag === "pv_in");
      const kind = hasIncome ? "death" : "income";
      return {
        kind,
        timing: "end",
        seriesAssetId:
          kind === "income"
            ? (latestByTag(assets, "payers") ?? latestByTag(assets, "survivors"))
            : latestByTag(assets, "deaths"),
        vAssetId: latestByTag(assets, "discount"),
        amountMode: "S",
        customAmount: 10_000_000,
      };
    }
    case "M08":
      return {
        incomeAssetIds: assets.filter((a) => a.tag === "pv_in").map((a) => a.def.id),
        outgoAssetIds: assets.filter((a) => a.tag === "pv_out").map((a) => a.def.id),
        lAssetId: latestByTag(assets, "survivors"),
      };
    case "M10":
      return { expression: "" };
    case "M11":
      return { seriesAssetIds: null };
    case "M09":
      return {
        method: "A",
        alpha: 0.03,
        beta: 0.002,
        gamma: 0.03,
        loadingK: 0.1,
        incomeAssetIds: assets.filter((a) => a.tag === "pv_in").map((a) => a.def.id),
        outgoAssetIds: assets.filter((a) => a.tag === "pv_out").map((a) => a.def.id),
        lAssetId: latestByTag(assets, "survivors"),
        vAssetId: latestByTag(assets, "discount"),
      };
    default:
      return {};
  }
}

/** 종목(대표 상품 유형): 표준 산출 플로우 프리셋 */
export type ProductPreset = "term" | "endowment" | "pure";

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id,
  type,
  params,
  refs: [],
  outputs: [],
});

/**
 * 종목별 표준 플로우: 모든 과정이 처음부터 완결 상태로 깔린다.
 * 정기 = 사망급부, 생사혼합 = 사망+만기, 순수생존 = 만기(생존)급부만.
 * (코드 생성 대사 테스트에서도 사용 — export)
 */
export function buildStandardPipeline(kind: ProductPreset): ModuleInstance[] {
  const m1 = uid(), m2 = uid(), m3 = uid(), m4 = uid(), m5 = uid();
  const m6 = uid(), m7in = uid(), m7d = uid(), m7m = uid(), m8 = uid();
  const q = `${m3}:q_male`, v = `${m4}:v`, l = `${m5}:l`, d = `${m6}:d`;
  const productName = { term: "정기보험", endowment: "생사혼합보험", pure: "순수생존보험" }[kind];
  const hasDeath = kind !== "pure";
  const hasMaturity = kind !== "term";

  return [
    mk(m1, "M01", { productName, productType: kind, memo: "" }),
    mk(m2, "M02", {
      age: 40, sex: "male", years: 20, payYears: 20,
      sumAssured: 100_000_000, roundDigit: 0, roundMode: "round",
    }),
    mk(m3, "M03", { libraryKeys: ["male"] }),
    mk(m4, "M04", {
      i: 0.025,
      variants: [
        { key: "v", timing: "begin" },
        { key: "v_mid", timing: "mid" },
      ],
    }),
    mk(m5, "M05", {
      variants: [
        { key: "l", usage: "survivors", qAssetIds: [q], l0: 100_000, combine: "single" },
      ],
    }),
    ...(hasDeath ? [mk(m6, "M06", { lAssetId: l, qAssetId: q })] : []),
    mk(m7in, "M07", {
      kind: "income", timing: "begin", seriesAssetId: l, vAssetId: v,
      amountMode: "S", customAmount: 0,
    }),
    ...(hasDeath
      ? [mk(m7d, "M07", {
          kind: "death", timing: "end", seriesAssetId: d, vAssetId: v,
          amountMode: "S", customAmount: 0,
        })]
      : []),
    ...(hasMaturity
      ? [mk(m7m, "M07", {
          kind: "maturity", timing: "end", seriesAssetId: l, vAssetId: v,
          amountMode: "S", customAmount: 0,
        })]
      : []),
    mk(m8, "M08", {
      incomeAssetIds: [`${m7in}:total`],
      outgoAssetIds: [
        ...(hasDeath ? [`${m7d}:total`] : []),
        ...(hasMaturity ? [`${m7m}:total`] : []),
      ],
      lAssetId: l,
    }),
  ];
}

interface WorkbookStore {
  sheets: SheetState[];
  activeSheetId: string;
  expandedId: string | null;
  /** localStorage 복원 완료 여부 — 복원 전에는 자동 저장하지 않는다 */
  hydrated: boolean;

  /** localStorage에서 게스트 워크북 복원 (마운트 시 1회) */
  hydrate: () => Promise<void>;

  // ── 시트 조작 ──
  setActiveSheet: (id: string) => void;
  addSheet: () => void;
  duplicateSheet: (id: string) => void;
  removeSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;

  // ── 활성 시트의 모듈 조작 ──
  applyPreset: (kind: ProductPreset) => void;
  addModule: (type: ModuleTypeId) => void;
  addModuleAt: (index: number, type: ModuleTypeId) => void;
  moveModule: (id: string, dir: "up" | "down") => void;
  reconnectRefs: (id: string) => void;
  updateParams: (id: string, patch: Record<string, unknown>) => void;
  updateTitle: (id: string, title: string) => void;
  removeModule: (id: string) => void;
  setExpanded: (id: string | null) => void;
  reset: () => void;
}

/** 대상 시트가 일반 탭이면 공용탭 시드 반환 */
function seedFor(sheets: SheetState[], sheetId: string): SheetSeed | undefined {
  const target = sheets.find((s) => s.id === sheetId);
  if (!target || target.sheetType === "shared") return undefined;
  const shared = sheets.find((s) => s.sheetType === "shared");
  if (!shared) return undefined;
  const comp = computeSheet(shared.pipeline);
  return { assets: comp.assets, contract: comp.contract };
}

export const useWorkbook = create<WorkbookStore>((set, get) => {
  const patchActive = (fn: (pipeline: ModuleInstance[]) => ModuleInstance[]) =>
    set((s) => ({
      sheets: s.sheets.map((sh) =>
        sh.id === s.activeSheetId ? { ...sh, pipeline: fn(sh.pipeline) } : sh,
      ),
    }));
  const active = () => {
    const s = get();
    return s.sheets.find((sh) => sh.id === s.activeSheetId)!;
  };

  const first = initialSheets();
  return {
    sheets: first,
    activeSheetId: first[1].id,
    expandedId: null,
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const wb = await localAdapter.loadWorkbook(GUEST_WORKBOOK_ID);
        const sheets = wb?.sheets as SheetState[] | undefined;
        const normal = sheets?.find((sh) => sh.sheetType === "normal");
        if (sheets && sheets.some((sh) => sh.sheetType === "shared") && normal) {
          set({ sheets, activeSheetId: normal.id, expandedId: null });
        }
      } finally {
        set({ hydrated: true });
      }
    },

    setActiveSheet: (id) => set({ activeSheetId: id, expandedId: null }),

    addSheet: () =>
      set((s) => {
        const n = s.sheets.filter((sh) => sh.sheetType === "normal").length + 1;
        const sheet: SheetState = { id: uid(), name: `탭 ${n}`, sheetType: "normal", pipeline: [] };
        return { sheets: [...s.sheets, sheet], activeSheetId: sheet.id, expandedId: null };
      }),

    duplicateSheet: (id) =>
      set((s) => {
        const src = s.sheets.find((sh) => sh.id === id);
        if (!src) return s;
        // 모듈 id 재발급 + 시트 내부 참조 재연결 (공용탭 참조는 그대로 유지)
        let json = JSON.stringify(src.pipeline);
        for (const m of src.pipeline) json = json.split(m.id).join(uid());
        const sheet: SheetState = {
          id: uid(),
          name: `${src.name} 복사본`,
          sheetType: "normal",
          pipeline: JSON.parse(json),
        };
        const i = s.sheets.findIndex((sh) => sh.id === id);
        const sheets = [...s.sheets.slice(0, i + 1), sheet, ...s.sheets.slice(i + 1)];
        return { sheets, activeSheetId: sheet.id, expandedId: null };
      }),

    removeSheet: (id) =>
      set((s) => {
        const target = s.sheets.find((sh) => sh.id === id);
        if (!target || target.sheetType === "shared") return s;
        let sheets = s.sheets.filter((sh) => sh.id !== id);
        if (!sheets.some((sh) => sh.sheetType === "normal")) {
          sheets = [...sheets, { id: uid(), name: "탭 1", sheetType: "normal", pipeline: [] }];
        }
        const activeSheetId =
          s.activeSheetId === id
            ? sheets.find((sh) => sh.sheetType === "normal")!.id
            : s.activeSheetId;
        return { sheets, activeSheetId, expandedId: null };
      }),

    renameSheet: (id, name) =>
      set((s) => ({
        sheets: s.sheets.map((sh) => (sh.id === id ? { ...sh, name: name || sh.name } : sh)),
      })),

    applyPreset: (kind) => {
      const pipeline = buildStandardPipeline(kind);
      patchActive(() => pipeline);
      set({ expandedId: pipeline[0].id });
    },

    addModule: (type) => get().addModuleAt(active().pipeline.length, type),

    addModuleAt: (index, type) => {
      const s = get();
      const seed = seedFor(s.sheets, s.activeSheetId);
      const comp = computeSheet(active().pipeline.slice(0, index), seed);
      const mod: ModuleInstance = {
        id: uid(),
        type,
        params: defaultParams(type, comp.assets, comp.contract),
        refs: [],
        outputs: [],
      };
      patchActive((p) => [...p.slice(0, index), mod, ...p.slice(index)]);
      set({ expandedId: mod.id });
    },

    moveModule: (id, dir) =>
      patchActive((p) => {
        const i = p.findIndex((m) => m.id === id);
        const j = dir === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= p.length) return p;
        const next = [...p];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),

    reconnectRefs: (id) => {
      const s = get();
      const pipeline = active().pipeline;
      const i = pipeline.findIndex((m) => m.id === id);
      if (i < 0) return;
      const seed = seedFor(s.sheets, s.activeSheetId);
      const comp = computeSheet(pipeline.slice(0, i), seed);
      const patch = repairRefs(pipeline[i], comp.assets);
      if (patch) get().updateParams(id, patch);
    },

    updateParams: (id, patch) =>
      patchActive((p) =>
        p.map((m) => (m.id === id ? { ...m, params: { ...m.params, ...patch } } : m)),
      ),

    updateTitle: (id, title) =>
      patchActive((p) => p.map((m) => (m.id === id ? { ...m, title: title || undefined } : m))),

    removeModule: (id) => {
      patchActive((p) => p.filter((m) => m.id !== id));
      set((s) => ({ expandedId: s.expandedId === id ? null : s.expandedId }));
    },

    setExpanded: (id) => set({ expandedId: id }),

    reset: () => {
      const sheets = initialSheets();
      set({ sheets, activeSheetId: sheets[1].id, expandedId: null });
      if (typeof localStorage !== "undefined") {
        localAdapter.deleteWorkbook(GUEST_WORKBOOK_ID).catch(() => {});
      }
    },
  };
});

// ── 자동 저장: 시트 변경 시 400ms 디바운스로 localStorage에 기록 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
  useWorkbook.subscribe((s, prev) => {
    if (!s.hydrated || s.sheets === prev.sheets) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localAdapter.saveWorkbook(toWorkbookFile(s.sheets)).catch(() => {});
    }, 400);
  });
}
