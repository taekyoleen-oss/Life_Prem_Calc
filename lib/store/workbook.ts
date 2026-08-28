import { create } from "zustand";
import type { M02Params, ModuleInstance, ModuleTypeId } from "@/types/modules";
import { computeSheet, type ComputedAsset } from "@/lib/engine/pipeline";

/**
 * 게스트 워크북 스토어 (P2: 인메모리 단일 시트).
 * localStorage 저장은 P5(localAdapter), 공용탭·다중 시트는 P3에서 확장한다.
 * 계산 결과는 저장하지 않는다 — 항상 computeSheet로 파생(§3.1 하류 자동 재계산).
 */

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `m_${Math.random().toString(36).slice(2, 10)}`;

const latest = (assets: ComputedAsset[], pred: (a: ComputedAsset) => boolean): string | null => {
  for (let i = assets.length - 1; i >= 0; i--) if (pred(assets[i])) return assets[i].def.id;
  return null;
};

const byCode = (re: RegExp) => (a: ComputedAsset) => re.test(a.def.code);
const isTable = (a: ComputedAsset) => a.def.kind === "table";

/** 새 모듈의 기본 파라미터 — 상류 자산을 자동 연결해 클릭 수를 줄인다 (§3.1) */
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
      return { libraryKey: contract?.sex === "female" ? "female" : "male" };
    case "M04":
      return { i: 0.025 };
    case "M05": {
      const q = latest(assets, isTable);
      return { qAssetIds: q ? [q] : [], l0: 100_000, combine: "single", usage: "survivors" };
    }
    case "M06":
      return {
        lAssetId: latest(assets, byCode(/^l\d+$/)),
        qAssetId: latest(assets, isTable),
      };
    case "M07": {
      const hasIncome = assets.some(byCode(/^pvin\d+$/));
      const kind = hasIncome ? "death" : "income";
      return {
        kind,
        timing: "end",
        seriesAssetId:
          kind === "income"
            ? (latest(assets, byCode(/^lp\d+$/)) ?? latest(assets, byCode(/^l\d+$/)))
            : latest(assets, byCode(/^d\d+$/)),
        vAssetId: latest(assets, byCode(/^v\d+$/)),
        amountMode: "S",
        customAmount: 10_000_000,
      };
    }
    case "M08":
      return {
        incomeAssetIds: assets.filter(byCode(/^pvin\d+$/)).map((a) => a.def.id),
        outgoAssetIds: assets.filter(byCode(/^pvout\d+$/)).map((a) => a.def.id),
        lAssetId: latest(assets, byCode(/^l\d+$/)),
      };
    default:
      return {};
  }
}

interface WorkbookStore {
  pipeline: ModuleInstance[];
  expandedId: string | null;
  addModule: (type: ModuleTypeId) => void;
  updateParams: (id: string, patch: Record<string, unknown>) => void;
  removeModule: (id: string) => void;
  setExpanded: (id: string | null) => void;
  reset: () => void;
}

export const useWorkbook = create<WorkbookStore>((set, get) => ({
  pipeline: [],
  expandedId: null,

  addModule: (type) => {
    const { pipeline } = get();
    const comp = computeSheet(pipeline);
    const mod: ModuleInstance = {
      id: uid(),
      type,
      params: defaultParams(type, comp.assets, comp.contract),
      refs: [],
      outputs: [],
    };
    set({ pipeline: [...pipeline, mod], expandedId: mod.id });
  },

  updateParams: (id, patch) =>
    set((s) => ({
      pipeline: s.pipeline.map((m) =>
        m.id === id ? { ...m, params: { ...m.params, ...patch } } : m,
      ),
    })),

  removeModule: (id) =>
    set((s) => ({
      pipeline: s.pipeline.filter((m) => m.id !== id),
      expandedId: s.expandedId === id ? null : s.expandedId,
    })),

  setExpanded: (id) => set({ expandedId: id }),

  reset: () => set({ pipeline: [], expandedId: null }),
}));
