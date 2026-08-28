import { create } from "zustand";
import type { M02Params, ModuleInstance, ModuleTypeId } from "@/types/modules";
import { computeSheet, repairRefs, type AssetTag, type ComputedAsset } from "@/lib/engine/pipeline";

/**
 * 게스트 워크북 스토어 (P2: 인메모리 단일 시트).
 * localStorage 저장은 P5(localAdapter), 공용탭·다중 시트는 P3에서 확장한다.
 * 계산 결과는 저장하지 않는다 — 항상 computeSheet로 파생(§3.1 하류 자동 재계산).
 * 단계는 임의 위치 삽입·순서 변경이 가능하다(한국형 유연성 요구).
 */

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `m_${Math.random().toString(36).slice(2, 10)}`;

const latestByTag = (assets: ComputedAsset[], ...tags: AssetTag[]): string | null => {
  for (let i = assets.length - 1; i >= 0; i--) {
    if (tags.includes(assets[i].tag)) return assets[i].def.id;
  }
  return null;
};

/** 새 모듈의 기본 파라미터 — 삽입 위치의 상류 자산을 자동 연결해 클릭 수를 줄인다 (§3.1) */
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
      return { i: 0.025, extraTimings: [] };
    case "M05": {
      const q = latestByTag(assets, "rate");
      return { qAssetIds: q ? [q] : [], l0: 100_000, combine: "single", usage: "survivors" };
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
 */
function buildStandardPipeline(kind: ProductPreset): ModuleInstance[] {
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
    mk(m4, "M04", { i: 0.025, extraTimings: [] }),
    mk(m5, "M05", { qAssetIds: [q], l0: 100_000, combine: "single", usage: "survivors" }),
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
  pipeline: ModuleInstance[];
  expandedId: string | null;
  /** 종목 선택 → 표준 플로우 전체 구성 (빈 워크북에서) */
  applyPreset: (kind: ProductPreset) => void;
  /** 끝에 추가 */
  addModule: (type: ModuleTypeId) => void;
  /** index 위치에 삽입 (0 = 맨 앞) */
  addModuleAt: (index: number, type: ModuleTypeId) => void;
  moveModule: (id: string, dir: "up" | "down") => void;
  /** 깨진·빈 참조를 상류 자산으로 자동 재연결 */
  reconnectRefs: (id: string) => void;
  updateParams: (id: string, patch: Record<string, unknown>) => void;
  updateTitle: (id: string, title: string) => void;
  removeModule: (id: string) => void;
  setExpanded: (id: string | null) => void;
  reset: () => void;
}

export const useWorkbook = create<WorkbookStore>((set, get) => ({
  pipeline: [],
  expandedId: null,

  applyPreset: (kind) => {
    const pipeline = buildStandardPipeline(kind);
    set({ pipeline, expandedId: pipeline[0].id });
  },

  addModule: (type) => get().addModuleAt(get().pipeline.length, type),

  addModuleAt: (index, type) => {
    const { pipeline } = get();
    // 삽입 위치의 상류만으로 기본 참조를 채운다
    const comp = computeSheet(pipeline.slice(0, index));
    const mod: ModuleInstance = {
      id: uid(),
      type,
      params: defaultParams(type, comp.assets, comp.contract),
      refs: [],
      outputs: [],
    };
    const next = [...pipeline.slice(0, index), mod, ...pipeline.slice(index)];
    set({ pipeline: next, expandedId: mod.id });
  },

  moveModule: (id, dir) =>
    set((s) => {
      const i = s.pipeline.findIndex((m) => m.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= s.pipeline.length) return s;
      const next = [...s.pipeline];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, pipeline: next };
    }),

  reconnectRefs: (id) => {
    const { pipeline } = get();
    const i = pipeline.findIndex((m) => m.id === id);
    if (i < 0) return;
    const comp = computeSheet(pipeline.slice(0, i));
    const patch = repairRefs(pipeline[i], comp.assets);
    if (patch) get().updateParams(id, patch);
  },

  updateParams: (id, patch) =>
    set((s) => ({
      pipeline: s.pipeline.map((m) =>
        m.id === id ? { ...m, params: { ...m.params, ...patch } } : m,
      ),
    })),

  updateTitle: (id, title) =>
    set((s) => ({
      pipeline: s.pipeline.map((m) => (m.id === id ? { ...m, title: title || undefined } : m)),
    })),

  removeModule: (id) =>
    set((s) => ({
      pipeline: s.pipeline.filter((m) => m.id !== id),
      expandedId: s.expandedId === id ? null : s.expandedId,
    })),

  setExpanded: (id) => set({ expandedId: id }),

  reset: () => set({ pipeline: [], expandedId: null }),
}));
