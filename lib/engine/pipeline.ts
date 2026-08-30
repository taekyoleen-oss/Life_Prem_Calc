import { ASSET_CODE_RE, type AssetDef } from "@/types/assets";
import type {
  AssetNameOverride,
  DecrementCombine,
  M01Params,
  M02Params,
  M03Params,
  M04Params,
  M04Variant,
  M05Params,
  M05Variant,
  M06Params,
  M07Params,
  M08Params,
  M09Params,
  ModuleInstance,
  ModuleStatus,
  ModuleTypeId,
  PvTiming,
} from "@/types/modules";
import rates from "./seed/dummy-rates.json";
import { parse } from "@/lib/formula/parser";
import { evaluate, type FormulaEnv, type FormulaValue } from "@/lib/formula/evaluator";
import { FormulaError } from "@/lib/formula/tokenizer";
import { deaths, survivors } from "./decrement";
import { discountFactors, pvBenefit, pvIncome, pvMaturity } from "./pv";
import { annualNetPremium, grossPremiumA, grossPremiumB, netSinglePremium, roundPremium } from "./premium";
import { fmt, fmtPct } from "@/lib/format";

/**
 * 파이프라인 계산 레이어 (설계서 §2.3, §3.2).
 * 순수·결정론: 동일 파이프라인 → 동일 결과. 상류 수정 시 전체를 위에서부터
 * 재계산한다(Jupyter식, §9). 모든 수치는 lib/engine 함수로만 산출한다.
 * 단계 순서는 사용자가 자유롭게 바꿀 수 있으며, 하류가 상류보다 앞에 오면
 * 참조 오류로 표시된다(§3.9).
 */

/** 위험률 표 자산 값: 연령 인덱스(startAge 기준) 전연령 계열 */
export interface RateTable {
  startAge: number;
  values: number[];
  isMortality: boolean;
}

export type AssetValue = number | number[] | RateTable;

/** 자산 의미 태그: 참조 후보 필터·자동 연결에 사용 (코드는 사용자가 바꿀 수 있으므로) */
export type AssetTag =
  | "contract"
  | "rate"
  | "discount"
  | "discount_shifted"
  | "survivors"
  | "payers"
  | "deaths"
  | "pv_series"
  | "pv_in"
  | "pv_out"
  | "premium"
  | "formula";

export interface ComputedAsset {
  def: AssetDef;
  value: AssetValue;
  tag: AssetTag;
}

export interface ModuleResult {
  status: ModuleStatus;
  /** 오류·미완성 사유 (카드 상단 표시) */
  message?: string;
  /** 계산은 계속되는 경고 (예: 코드 중복 → 기본 코드 사용) */
  warning?: string;
  /** 카드 표시용 부가 수치 (예: M09 부가보험료 분해) */
  extra?: Record<string, number>;
  assets: ComputedAsset[];
  /** 완료 요약 칩 (§3.1) */
  summary: string[];
}

export interface SheetComputation {
  /** moduleId → 결과 */
  results: Record<string, ModuleResult>;
  /** 파이프라인 순서의 전체 자산 */
  assets: ComputedAsset[];
  byId: Record<string, ComputedAsset>;
  contract: M02Params | null;
  final: { nsp: number | null; p: number | null; pRounded: number | null; g: number | null; gRounded: number | null };
}

/**
 * 공용 라이브러리 (더미 위험률 표 v2, 설계서 §10-2).
 * 성별 구분은 두지 않는다 — 성별은 계약조건(M02)에서만 다루므로 담보별 표 5종으로 제공한다.
 * 일반사망률·암발생률은 v1의 사망률(남)·진단률 값을 그대로 승계한다(골든 기대값 불변).
 */
export const RATE_LIBRARY = {
  mortality: { label: "더미 일반사망률", assetName: "q_일반사망", isMortality: true, values: rates.mortality },
  accident: { label: "더미 재해사망률", assetName: "q_재해사망", isMortality: true, values: rates.accident },
  disability: { label: "더미 50% 이상 장애율", assetName: "q_장애50", isMortality: false, values: rates.disability },
  cancer: { label: "더미 암발생률", assetName: "q_암발생", isMortality: false, values: rates.cancer },
  cancer_surgery: { label: "더미 암수술률", assetName: "q_암수술", isMortality: false, values: rates.cancer_surgery },
} as const;

export type RateLibraryKey = keyof typeof RATE_LIBRARY;

/**
 * 구버전(성별 구분) 키 호환 — 저장된 파이프라인의 자산 참조(`…:q_male` 등)를 깨뜨리지 않는다.
 * 여성 표는 폐지했으므로 일반사망률로 수렴하며, 이 경우 계산값이 달라진다.
 */
const LEGACY_RATE_KEY: Record<string, RateLibraryKey> = {
  male: "mortality",
  female: "mortality",
  diagnosis: "cancer",
};

/** 구버전 키를 현재 담보 키로 정규화한다(알 수 없는 키는 그대로 반환). */
export function normalizeRateKey(key: string): string {
  return key in RATE_LIBRARY ? key : (LEGACY_RATE_KEY[key] ?? key);
}

/** 라이브러리 키 해석: 신규 키 우선, 없으면 구버전 키를 매핑한다. */
export function resolveRateLibrary(key: string) {
  return RATE_LIBRARY[normalizeRateKey(key) as RateLibraryKey];
}

/** 모듈 카탈로그 메타 (§3.2): 표시명·반복 가능 여부·사용 가능 여부 */
export const MODULE_CATALOG: Record<
  ModuleTypeId,
  { label: string; repeatable: boolean; available: boolean; desc: string }
> = {
  M01: { label: "상품 기본정보", repeatable: false, available: true, desc: "상품명·유형·메모" },
  M02: { label: "계약조건", repeatable: false, available: true, desc: "x·n·m·S와 단수처리" },
  M03: { label: "위험률 표", repeatable: true, available: true, desc: "라이브러리에서 q 계열 선택" },
  M04: { label: "이자율·현가율", repeatable: true, available: true, desc: "예정이율 → v^t 계열" },
  M05: { label: "생존자수·납입자수", repeatable: true, available: true, desc: "탈퇴 축차 l·lp 계열" },
  M06: { label: "사망자수·발생자수", repeatable: true, available: true, desc: "d = l·q" },
  M07: { label: "현가합", repeatable: true, available: true, desc: "수입·지급 현가와 합계" },
  M08: { label: "순보험료", repeatable: false, available: true, desc: "NSP·연납 P" },
  M09: { label: "사업비·영업보험료", repeatable: false, available: true, desc: "방식 A(3이원)·B(부가율)" },
  M10: { label: "사용자 수식", repeatable: true, available: true, desc: "자산 코드로 자유 수식" },
  M11: { label: "결과 요약", repeatable: false, available: true, desc: "통합 계산표·내보내기" },
};

/** "＋ 다음 단계" 추천 (§3.1): 마지막 모듈 유형 → 자연스러운 다음 모듈 */
const NEXT_RECOMMEND: Partial<Record<ModuleTypeId, ModuleTypeId[]>> = {
  M01: ["M02"],
  M02: ["M03"],
  M03: ["M04", "M03"],
  M04: ["M05"],
  M05: ["M06", "M05"],
  M06: ["M07"],
  M07: ["M07", "M08"],
  M08: ["M09"],
  M09: ["M10", "M11"],
  M10: ["M10", "M11"],
  M11: [],
};

export function recommendNext(pipeline: ModuleInstance[]): ModuleTypeId[] {
  const last = pipeline[pipeline.length - 1];
  const base = last ? (NEXT_RECOMMEND[last.type] ?? []) : ["M01" as ModuleTypeId];
  const present = new Set(pipeline.map((mo) => mo.type));
  return base.filter(
    (t) => MODULE_CATALOG[t].available && (MODULE_CATALOG[t].repeatable || !present.has(t)),
  );
}

// ── 계산 본체 ─────────────────────────────────────────────────────

interface Ctx {
  registry: Map<string, ComputedAsset>;
  order: ComputedAsset[];
  /** 사용 중 코드 (유일성 검사 — 시트 범위, §3.3) */
  codes: Set<string>;
  contract: M02Params | null;
}

/**
 * 접두사의 첫 자유 번호(1부터 탐색 — 빈 번호 재사용, 결정론).
 * suffixes 조합(예: pvin1·pvin1_t)이 모두 비어 있어야 한다.
 * ponytail: O(n²) 탐색 — 시트당 자산 수십 개 수준이라 충분, 커지면 접두사별 인덱스 도입.
 */
function nextIndex(ctx: Ctx, prefix: string, suffixes: string[] = [""]): number {
  let n = 1;
  while (suffixes.some((s) => ctx.codes.has(`${prefix}${n}${s}`))) n++;
  return n;
}

interface RegisterSpec {
  slot: string;
  /** 자동 명명 기본 코드 (오버라이드 실패 시 폴백) */
  code: string;
  displayName: string;
  kind: AssetDef["kind"];
  value: AssetValue;
  tag: AssetTag;
  isMortality?: boolean;
}

function register(ctx: Ctx, mod: ModuleInstance, warnings: string[], spec: RegisterSpec): ComputedAsset {
  const overrides = (mod.params.assetNames ?? {}) as Record<string, AssetNameOverride>;
  const ov = overrides[spec.slot];

  let code = spec.code;
  if (ov?.code && ov.code !== spec.code) {
    if (!ASSET_CODE_RE.test(ov.code)) {
      warnings.push(`코드 '${ov.code}'는 규칙(소문자 시작, a-z·0-9·_, 30자 이내)에 맞지 않아 '${spec.code}'를 사용합니다.`);
    } else if (ctx.codes.has(ov.code)) {
      warnings.push(`코드 '${ov.code}'는 이미 사용 중이라 '${spec.code}'를 사용합니다.`);
    } else {
      code = ov.code;
    }
  }
  ctx.codes.add(code);

  const displayName = ov?.displayName?.trim() ? ov.displayName.trim() : spec.displayName;
  const asset: ComputedAsset = {
    def: {
      id: `${mod.id}:${spec.slot}`,
      code,
      displayName,
      kind: spec.kind,
      ...(spec.isMortality !== undefined ? { isMortality: spec.isMortality } : {}),
    },
    value: spec.value,
    tag: spec.tag,
  };
  ctx.registry.set(asset.def.id, asset);
  ctx.order.push(asset);
  return asset;
}

function need(ctx: Ctx, assetId: string | null | undefined): ComputedAsset {
  if (!assetId) throw new IncompleteError("참조 자산을 선택하세요.");
  const a = ctx.registry.get(assetId);
  if (!a) throw new Error("참조 자산을 찾을 수 없습니다. 이 단계보다 위에서 산출되는지 확인하세요.");
  return a;
}

/** 미완성 입력(오류가 아닌 '입력 중' 상태) 표시용 */
class IncompleteError extends Error {}

function requireContract(ctx: Ctx): M02Params {
  if (!ctx.contract) throw new IncompleteError("계약조건(M02)을 먼저 완료하세요.");
  return ctx.contract;
}

function sliceTable(table: RateTable, age: number, n: number): number[] {
  const start = age - table.startAge;
  if (start < 0 || start + n > table.values.length) {
    throw new Error(`위험률 표의 연령 범위가 부족합니다 (필요: ${age}~${age + n - 1}세).`);
  }
  return table.values.slice(start, start + n);
}

function asSeries(a: ComputedAsset): number[] {
  if (!Array.isArray(a.value)) throw new Error(`'${a.def.displayName}'은(는) 계열 자산이 아닙니다.`);
  return a.value;
}

function asTable(a: ComputedAsset): RateTable {
  if (typeof a.value !== "object" || Array.isArray(a.value)) {
    throw new Error(`'${a.def.displayName}'은(는) 위험률 표 자산이 아닙니다.`);
  }
  return a.value;
}

function asScalar(a: ComputedAsset): number {
  if (typeof a.value !== "number") throw new Error(`'${a.def.displayName}'은(는) 스칼라 자산이 아닙니다.`);
  return a.value;
}

function needTag(a: ComputedAsset, tags: AssetTag[], what: string): ComputedAsset {
  if (!tags.includes(a.tag)) {
    throw new Error(`'${a.def.displayName}'은(는) ${what} 자산이 아닙니다.`);
  }
  return a;
}

const TIMING_LABEL = { begin: "연시", mid: "연중", end: "연말" } as const;

/** 공용탭 자산을 일반 탭 계산에 주입하는 시드 (§2.3) */
export interface SheetSeed {
  assets: ComputedAsset[];
  contract: M02Params | null;
}

export function computeSheet(pipeline: ModuleInstance[], seed?: SheetSeed): SheetComputation {
  const ctx: Ctx = {
    registry: new Map(),
    order: [],
    codes: new Set(),
    contract: null,
  };
  if (seed) {
    // 공용탭 자산: 참조 가능 + 코드 유일성 범위 공유 (§3.3 — 일반 탭이 공용탭 코드 재사용 금지)
    for (const a of seed.assets) {
      ctx.registry.set(a.def.id, a);
      ctx.order.push(a);
      ctx.codes.add(a.def.code);
    }
    ctx.contract = seed.contract;
  }
  const results: Record<string, ModuleResult> = {};
  const final: SheetComputation["final"] = { nsp: null, p: null, pRounded: null, g: null, gRounded: null };

  for (const mod of pipeline) {
    const assets: ComputedAsset[] = [];
    const summary: string[] = [];
    const warnings: string[] = [];
    let status: ModuleStatus = "done";
    let message: string | undefined;
    let extraOut: Record<string, number> | undefined;

    try {
      switch (mod.type) {
        case "M01": {
          const p = mod.params as unknown as M01Params;
          if (!p.productName.trim()) throw new IncompleteError("상품명을 입력하세요.");
          const typeLabel = { term: "정기", endowment: "생사혼합", pure: "순수생존", other: "기타" }[p.productType];
          summary.push(p.productName, typeLabel);
          break;
        }
        case "M02": {
          const p = mod.params as unknown as M02Params;
          if (!Number.isInteger(p.age) || p.age < 0 || p.age > 100) throw new IncompleteError("가입연령은 0~100 정수입니다.");
          if (!Number.isInteger(p.years) || p.years < 1) throw new IncompleteError("보험기간은 1 이상 정수입니다.");
          if (!Number.isInteger(p.payYears) || p.payYears < 1 || p.payYears > p.years) {
            throw new IncompleteError("납입기간은 1 이상, 보험기간 이하 정수입니다.");
          }
          if (!(p.sumAssured > 0)) throw new IncompleteError("가입금액을 입력하세요.");
          if (ctx.contract) throw new Error("계약조건(M02)은 하나만 둘 수 있습니다.");
          ctx.contract = p;
          assets.push(
            register(ctx, mod, warnings, { slot: "x", code: "x", displayName: "가입연령 x", kind: "scalar", value: p.age, tag: "contract" }),
            register(ctx, mod, warnings, { slot: "n", code: "n", displayName: "보험기간 n", kind: "scalar", value: p.years, tag: "contract" }),
            register(ctx, mod, warnings, { slot: "m", code: "m", displayName: "납입기간 m", kind: "scalar", value: p.payYears, tag: "contract" }),
            register(ctx, mod, warnings, { slot: "s", code: "s", displayName: "가입금액 S", kind: "scalar", value: p.sumAssured, tag: "contract" }),
          );
          summary.push(
            `${p.age}세 ${p.sex === "male" ? "남" : "여"}`,
            `${p.years}년 만기 / ${p.payYears}년납`,
            `S = ${fmt(p.sumAssured)}원`,
          );
          break;
        }
        case "M03": {
          const p = mod.params as unknown as M03Params & { libraryKey?: string };
          if ((p.source ?? "library") === "custom") {
            // 직접 입력(붙여넣기·CSV) — 파싱은 lib/engine/table-io.ts(결정론)
            if (!p.custom || p.custom.columns.length === 0) {
              throw new IncompleteError("표를 붙여넣거나 CSV 파일을 불러오세요.");
            }
            const selected = p.custom.columns
              .map((col, idx) => ({ col, idx }))
              .filter((x) => x.col.selected);
            if (selected.length === 0) throw new IncompleteError("사용할 열을 1개 이상 선택하세요.");
            for (const { col, idx } of selected) {
              const table: RateTable = {
                startAge: p.custom.startAge,
                values: col.values,
                isMortality: col.isMortality,
              };
              assets.push(
                register(ctx, mod, warnings, {
                  slot: `c${idx}`, code: `q${nextIndex(ctx, "q")}`, displayName: `q_${col.name}`,
                  kind: "table", value: table, tag: "rate", isMortality: col.isMortality,
                }),
              );
              summary.push(col.name);
            }
            const len = p.custom.columns[0]?.values.length ?? 0;
            summary.push(`직접 입력 · 연령 ${p.custom.startAge}~${p.custom.startAge + len - 1}`);
            break;
          }
          // 공용 라이브러리 (구버전 단일 선택 호환)
          const keys: string[] = p.libraryKeys ?? (p.libraryKey ? [p.libraryKey] : []);
          if (keys.length === 0) throw new IncompleteError("위험률을 1개 이상 선택하세요.");
          for (const key of keys) {
            const lib = resolveRateLibrary(key);
            if (!lib) throw new Error(`알 수 없는 라이브러리 항목입니다: ${key}`);
            const table: RateTable = { startAge: 0, values: lib.values as unknown as number[], isMortality: lib.isMortality };
            assets.push(
              register(ctx, mod, warnings, {
                // 슬롯은 저장된 원래 키로 둔다 — 구버전 파이프라인의 `…:q_male` 참조 보존
                slot: `q_${key}`, code: `q${nextIndex(ctx, "q")}`, displayName: lib.assetName,
                kind: "table", value: table, tag: "rate", isMortality: lib.isMortality,
              }),
            );
            summary.push(lib.label);
          }
          break;
        }
        case "M04": {
          const p = mod.params as unknown as M04Params & { extraTimings?: PvTiming[] };
          const c = requireContract(ctx);
          if (!(p.i >= 0)) throw new IncompleteError("예정이율을 입력하세요.");
          // 소단계 목록 (구버전 extraTimings·단일 파라미터 호환)
          const variants: M04Variant[] =
            p.variants ??
            [
              { key: "v", timing: "begin" as PvTiming },
              ...(p.extraTimings ?? [])
                .filter((t) => t === "mid" || t === "end")
                .map((t) => ({ key: `v_${t}`, timing: t })),
            ];
          if (variants.length === 0) throw new IncompleteError("현가율 소단계를 1개 이상 두세요.");
          // v^t는 n+1개 필요, 연말 이동 계열은 v^{n+1}까지 필요
          const vpFull = discountFactors(p.i, c.years + 2);
          const vp = vpFull.slice(0, c.years + 1);
          const sqv = Math.sqrt(vpFull[1]);
          for (const va of variants) {
            const value =
              va.timing === "begin" ? vp
              : va.timing === "mid" ? vp.map((x) => x * sqv)
              : vpFull.slice(1, c.years + 2);
            assets.push(
              register(ctx, mod, warnings, {
                slot: va.key,
                code: `v${nextIndex(ctx, "v")}`,
                displayName: `v_${fmtPct(p.i)}(${TIMING_LABEL[va.timing]})`,
                kind: "series", value,
                tag: va.timing === "begin" ? "discount" : "discount_shifted",
              }),
            );
          }
          summary.push(
            `i = ${fmtPct(p.i)}`, "연복리",
            `계열 ${variants.length}개: ${variants.map((va) => TIMING_LABEL[va.timing]).join("·")}`,
          );
          break;
        }
        case "M05": {
          const raw = mod.params as unknown as M05Params & {
            qAssetIds?: string[]; l0?: number; combine?: DecrementCombine; usage?: "survivors" | "payers";
          };
          const c = requireContract(ctx);
          // 소단계 목록 (구버전 평면 파라미터 호환)
          const variants: M05Variant[] = raw.variants ?? [{
            key: "l",
            usage: raw.usage ?? "survivors",
            qAssetIds: raw.qAssetIds ?? [],
            l0: raw.l0 ?? 100_000,
            combine: raw.combine ?? "single",
          }];
          if (variants.length === 0) throw new IncompleteError("소단계를 1개 이상 두세요.");
          for (const va of variants) {
            if (va.qAssetIds.length === 0) throw new IncompleteError("탈퇴원인 q 계열을 선택하세요.");
            if (!(va.l0 > 0)) throw new IncompleteError("기수 l0를 입력하세요.");
            const tables = va.qAssetIds.map((id) => asTable(needTag(need(ctx, id), ["rate"], "위험률 표")));
            const slices = tables.map((t) => sliceTable(t, c.age, c.years));
            const l = survivors(va.l0, slices, va.combine);
            const hasMortality = tables.some((t) => t.isMortality);
            const isPayer = va.usage === "payers";
            assets.push(
              register(ctx, mod, warnings, {
                slot: va.key,
                code: isPayer ? `lp${nextIndex(ctx, "lp")}` : `l${nextIndex(ctx, "l")}`,
                displayName: isPayer ? "lp_납입자수" : "l_생존자수",
                kind: "series", value: l, tag: isPayer ? "payers" : "survivors",
              }),
            );
            const combineLabel = { single: "단일탈퇴", independent: "독립 곱", sum: "단순 합산" }[va.combine];
            summary.push(
              `${isPayer ? "lp" : "l"}: ${combineLabel}${va.qAssetIds.length > 1 ? `(${va.qAssetIds.length}원인)` : ""} · ${hasMortality ? "사망 포함" : "사망 미포함"}`,
            );
          }
          break;
        }
        case "M06": {
          const p = mod.params as unknown as M06Params;
          const c = requireContract(ctx);
          const lAsset = needTag(need(ctx, p.lAssetId), ["survivors", "payers"], "생존자수·납입자수");
          const qAsset = needTag(need(ctx, p.qAssetId), ["rate"], "위험률 표");
          const l = asSeries(lAsset);
          const table = asTable(qAsset);
          const q = sliceTable(table, c.age, c.years);
          const d = deaths(l, q);
          assets.push(
            register(ctx, mod, warnings, {
              slot: "d", code: `d${nextIndex(ctx, "d")}`,
              displayName: table.isMortality ? "d_사망" : "d_발생",
              kind: "series", value: d, tag: "deaths",
            }),
          );
          summary.push(`${lAsset.def.code} × ${qAsset.def.code}`, table.isMortality ? "사망자수" : "발생자수");
          break;
        }
        case "M07": {
          const p = mod.params as unknown as M07Params;
          const c = requireContract(ctx);
          const vp = asSeries(needTag(need(ctx, p.vAssetId), ["discount"], "현가율(v^t)"));
          const amount = p.amountMode === "S" ? c.sumAssured : p.customAmount;
          if (p.kind !== "income" && !(amount > 0)) throw new IncompleteError("급부금액을 입력하세요.");

          if (p.kind === "income") {
            const lp = asSeries(needTag(need(ctx, p.seriesAssetId), ["survivors", "payers"], "생존자수·납입자수"));
            const total = pvIncome(lp, vp, c.payYears);
            const terms = Array.from({ length: c.payYears }, (_, t) => lp[t] * vp[t]);
            const k = nextIndex(ctx, "pvin", ["", "_t"]);
            assets.push(
              register(ctx, mod, warnings, { slot: "series", code: `pvin${k}_t`, displayName: "PV_수입(연도별)", kind: "series", value: terms, tag: "pv_series" }),
              register(ctx, mod, warnings, { slot: "total", code: `pvin${k}`, displayName: "PV_수입", kind: "scalar", value: total, tag: "pv_in" }),
            );
            summary.push("수입현가(연시)", `합계 ${fmt(total, 2)}`);
          } else if (p.kind === "death") {
            const dAsset = needTag(need(ctx, p.seriesAssetId), ["deaths"], "사망·발생자수");
            const d = asSeries(dAsset);
            const total = pvBenefit(d, vp, amount, c.years, p.timing);
            const sqv = Math.sqrt(vp[1]);
            const terms = Array.from({ length: c.years }, (_, t) =>
              p.timing === "end" ? amount * d[t] * vp[t + 1]
              : p.timing === "mid" ? amount * d[t] * (vp[t] * sqv)
              : amount * d[t] * vp[t],
            );
            const isDeath = dAsset.def.displayName.includes("사망");
            const name = isDeath ? "PV_사망지급" : "PV_발생지급";
            const k = nextIndex(ctx, "pvout", ["", "_t"]);
            assets.push(
              register(ctx, mod, warnings, { slot: "series", code: `pvout${k}_t`, displayName: `${name}(연도별)`, kind: "series", value: terms, tag: "pv_series" }),
              register(ctx, mod, warnings, { slot: "total", code: `pvout${k}`, displayName: name, kind: "scalar", value: total, tag: "pv_out" }),
            );
            summary.push(`지급현가(${TIMING_LABEL[p.timing]})`, `급부 ${fmt(amount)}원`, `합계 ${fmt(total, 2)}`);
          } else {
            const l = asSeries(needTag(need(ctx, p.seriesAssetId), ["survivors", "payers"], "생존자수"));
            if (l.length < c.years + 1) throw new Error("만기급부에는 길이 n+1의 생존자수 계열이 필요합니다.");
            const total = pvMaturity(amount, l[c.years], vp[c.years]);
            assets.push(
              register(ctx, mod, warnings, { slot: "total", code: `pvout${nextIndex(ctx, "pvout", ["", "_t"])}`, displayName: "PV_만기지급", kind: "scalar", value: total, tag: "pv_out" }),
            );
            summary.push("지급현가(만기)", `급부 ${fmt(amount)}원`, `합계 ${fmt(total, 2)}`);
          }
          break;
        }
        case "M08": {
          const p = mod.params as unknown as M08Params;
          const c = requireContract(ctx);
          if (p.incomeAssetIds.length === 0) throw new IncompleteError("수입현가 자산을 선택하세요.");
          if (p.outgoAssetIds.length === 0) throw new IncompleteError("지급현가 자산을 선택하세요.");
          // 합산은 파이프라인 등록 순서로 진행 (결정론)
          const pickOrdered = (ids: string[]) =>
            ctx.order.filter((a) => ids.includes(a.def.id)).map((a) => asScalar(a));
          let pvIn = 0;
          for (const x of pickOrdered(p.incomeAssetIds)) pvIn += x;
          let pvOut = 0;
          for (const x of pickOrdered(p.outgoAssetIds)) pvOut += x;
          const pAnnual = annualNetPremium(pvOut, pvIn);
          assets.push(
            register(ctx, mod, warnings, { slot: "p", code: "p_annual", displayName: "연납 순보험료 P", kind: "scalar", value: pAnnual, tag: "premium" }),
          );
          if (p.lAssetId) {
            const l = asSeries(needTag(need(ctx, p.lAssetId), ["survivors", "payers"], "생존자수"));
            const nsp = netSinglePremium(pvOut, l[0]);
            assets.push(
              register(ctx, mod, warnings, { slot: "nsp", code: "nsp", displayName: "일시납 순보험료 NSP", kind: "scalar", value: nsp, tag: "premium" }),
            );
            final.nsp = nsp;
          }
          final.p = pAnnual;
          final.pRounded = roundPremium(pAnnual, c.roundDigit, c.roundMode);
          summary.push(`연납 P = ${fmt(pAnnual, 2)}원`, `단수처리 후 ${fmt(final.pRounded)}원`);
          break;
        }
        case "M09": {
          const p = mod.params as unknown as M09Params;
          const c = requireContract(ctx);
          if (p.incomeAssetIds.length === 0) throw new IncompleteError("수입현가 자산을 선택하세요.");
          if (p.outgoAssetIds.length === 0) throw new IncompleteError("지급현가 자산을 선택하세요.");
          const pickOrdered = (sel: string[]) =>
            ctx.order.filter((a) => sel.includes(a.def.id)).map((a) => asScalar(a));
          let pvIn = 0;
          for (const x of pickOrdered(p.incomeAssetIds)) pvIn += x;
          let pvOut = 0;
          for (const x of pickOrdered(p.outgoAssetIds)) pvOut += x;

          let G: number;
          if (p.method === "A") {
            if (!(p.alpha >= 0) || !(p.beta >= 0) || !(p.gamma >= 0) || p.gamma >= 1) {
              throw new IncompleteError("α·β·γ를 입력하세요 (γ < 1).");
            }
            const l = asSeries(needTag(need(ctx, p.lAssetId), ["survivors", "payers"], "생존자수"));
            const vp = asSeries(needTag(need(ctx, p.vAssetId), ["discount"], "현가율(v^t)"));
            // 유지비 기저 E = Σ_{t=0}^{n-1} l·v^t (보험기간 연시) — pvIncome과 동일 축차
            const maintenanceBase = pvIncome(l, vp, c.years);
            const r = grossPremiumA({
              alpha: p.alpha, beta: p.beta, gamma: p.gamma,
              S: c.sumAssured, l0: l[0], pvOut, pvIn, maintenanceBase,
            });
            G = r.G;
            extraOut = {
              loadingAlpha: r.loadingAlpha,
              loadingBeta: r.loadingBeta,
              loadingGamma: r.loadingGamma,
              loadingTotal: r.loadingTotal,
              maintenanceBase,
            };
          } else {
            if (!(p.loadingK >= 0) || p.loadingK >= 1) throw new IncompleteError("부가율 k를 입력하세요 (0 ≤ k < 1).");
            const net = annualNetPremium(pvOut, pvIn);
            G = grossPremiumB(net, p.loadingK);
            extraOut = { loadingTotal: G - net };
          }
          assets.push(
            register(ctx, mod, warnings, {
              slot: "g", code: "g_annual", displayName: "연납 영업보험료 G",
              kind: "scalar", value: G, tag: "premium",
            }),
          );
          final.g = G;
          final.gRounded = roundPremium(G, c.roundDigit, c.roundMode);
          summary.push(
            p.method === "A" ? `방식 A (α=${fmtPct(p.alpha)}·β=${fmtPct(p.beta)}·γ=${fmtPct(p.gamma)})` : `방식 B (k=${fmtPct(p.loadingK)})`,
            `G = ${fmt(G, 2)}원`,
            `단수처리 후 ${fmt(final.gRounded)}원`,
          );
          break;
        }
        case "M10": {
          const p = mod.params as unknown as { expression?: string };
          if (!p.expression?.trim()) throw new IncompleteError("수식을 입력하세요.");
          // env: 상류 자산 코드 → 값. 표 자산은 계약 구간(x..x+n-1) 슬라이스 계열로 노출.
          // 수식은 상류 env만 보므로 자기·하류 참조는 '정의되지 않은 참조'로 차단된다(순환 차단).
          const env: FormulaEnv = {};
          for (const a of ctx.order) {
            if (typeof a.value === "number" || Array.isArray(a.value)) {
              env[a.def.code] = a.value as FormulaValue;
            } else if (ctx.contract) {
              env[a.def.code] = sliceTable(a.value as RateTable, ctx.contract.age, ctx.contract.years);
            }
          }
          if (ctx.contract) {
            env["t"] = Array.from({ length: ctx.contract.years }, (_, t) => t);
          }
          let value: FormulaValue;
          try {
            value = evaluate(parse(p.expression), env);
          } catch (e) {
            // 문법·참조·길이 오류는 입력 중 인라인 오류 (§3.4)
            if (e instanceof FormulaError) throw new IncompleteError(e.message);
            throw e;
          }
          const isSeries = Array.isArray(value);
          assets.push(
            register(ctx, mod, warnings, {
              slot: "f", code: `f${nextIndex(ctx, "f")}`, displayName: "수식 결과",
              kind: isSeries ? "series" : "scalar", value: value as AssetValue, tag: "formula",
            }),
          );
          summary.push(
            p.expression.length > 36 ? `${p.expression.slice(0, 36)}…` : p.expression,
            isSeries ? `계열 (${(value as number[]).length}개)` : `= ${fmt(value as number, 4)}`,
          );
          break;
        }
        case "M11": {
          // 통합 계산표(§3.6): 자산을 만들지 않는 조회 모듈 — 표 구성은 카드에서
          const seriesCount = ctx.order.filter((a) => a.def.kind === "series").length;
          const scalarCount = ctx.order.filter((a) => a.def.kind === "scalar").length;
          summary.push(`계열 ${seriesCount}개 · 스칼라 ${scalarCount}개`);
          break;
        }
        default:
          throw new Error(`${mod.type} 모듈은 이후 페이즈에서 제공됩니다.`);
      }
    } catch (e) {
      assets.length = 0;
      if (e instanceof IncompleteError) {
        status = "editing";
        message = e.message;
      } else {
        status = "error";
        message = e instanceof Error ? e.message : String(e);
      }
    }

    results[mod.id] = {
      status,
      message,
      warning: warnings.length > 0 ? warnings.join(" ") : undefined,
      extra: extraOut,
      assets,
      summary,
    };
  }

  const byId: Record<string, ComputedAsset> = {};
  for (const a of ctx.order) byId[a.def.id] = a;
  return { results, assets: ctx.order, byId, contract: ctx.contract, final };
}

/**
 * 워크북 전체 계산 (§2.3): 공용탭을 먼저 계산하고, 그 자산·계약조건을
 * 모든 일반 탭에 시드로 주입한다. 공용탭 수정 시 참조 탭 전체가 자동
 * 재계산되는 것은 이 함수가 순수 함수라는 사실에서 따라온다.
 */
export function computeWorkbook(
  sheets: { id: string; sheetType: "shared" | "normal"; pipeline: ModuleInstance[] }[],
): Record<string, SheetComputation> {
  const shared = sheets.find((s) => s.sheetType === "shared");
  const sharedComp = shared ? computeSheet(shared.pipeline) : null;
  const seed: SheetSeed | undefined = sharedComp
    ? { assets: sharedComp.assets, contract: sharedComp.contract }
    : undefined;
  const out: Record<string, SheetComputation> = {};
  for (const s of sheets) {
    out[s.id] = s.sheetType === "shared" ? sharedComp! : computeSheet(s.pipeline, seed);
  }
  return out;
}

// ── 참조 자동 재연결 (§3.9 보강) ─────────────────────────────────
// 단계 이동·삭제·삽입으로 참조가 깨지거나 비어 있을 때, 상류 자산에서
// 의미 태그가 맞는 후보로 재연결하는 패치를 제안한다.

interface RefFieldSpec {
  field: string;
  many?: boolean;
  /** many에서 유효 참조가 하나도 없을 때: true = 후보 전부, false = 최신 1개 */
  fillAll?: boolean;
  tags: (params: Record<string, unknown>) => AssetTag[];
}

const REF_FIELDS: Partial<Record<ModuleTypeId, RefFieldSpec[]>> = {
  M05: [{ field: "qAssetIds", many: true, tags: () => ["rate"] }],
  M06: [
    { field: "lAssetId", tags: () => ["survivors", "payers"] },
    { field: "qAssetId", tags: () => ["rate"] },
  ],
  M07: [
    { field: "seriesAssetId", tags: (p) => (p.kind === "death" ? ["deaths"] : ["survivors", "payers"]) },
    { field: "vAssetId", tags: () => ["discount"] },
  ],
  M08: [
    { field: "incomeAssetIds", many: true, fillAll: true, tags: () => ["pv_in"] },
    { field: "outgoAssetIds", many: true, fillAll: true, tags: () => ["pv_out"] },
    { field: "lAssetId", tags: () => ["survivors"] },
  ],
  M09: [
    { field: "incomeAssetIds", many: true, fillAll: true, tags: () => ["pv_in"] },
    { field: "outgoAssetIds", many: true, fillAll: true, tags: () => ["pv_out"] },
    { field: "lAssetId", tags: () => ["survivors"] },
    { field: "vAssetId", tags: () => ["discount"] },
  ],
};

export const REF_FIELD_LABEL: Record<string, string> = {
  variants: "탈퇴원인 q (소단계)",
  qAssetIds: "탈퇴원인 q",
  lAssetId: "l 계열",
  qAssetId: "q 계열",
  seriesAssetId: "대상 계열",
  vAssetId: "현가율 v",
  incomeAssetIds: "수입현가",
  outgoAssetIds: "지급현가",
};

/**
 * 깨졌거나 비어 있는 참조를 상류 자산으로 재연결하는 params 패치.
 * 바꿀 것이 없으면 null. 유효한 기존 참조는 절대 바꾸지 않는다.
 */
export function repairRefs(
  mod: ModuleInstance,
  upstream: ComputedAsset[],
): Record<string, unknown> | null {
  const ids = new Set(upstream.map((a) => a.def.id));
  const byTag = (tags: AssetTag[]) => upstream.filter((a) => tags.includes(a.tag));

  // M05 소단계: 각 변형의 qAssetIds를 개별 수리
  if (mod.type === "M05" && Array.isArray(mod.params.variants)) {
    const variants = mod.params.variants as M05Variant[];
    let changed = false;
    const next = variants.map((va) => {
      const kept = va.qAssetIds.filter((x) => ids.has(x));
      let ids2 = kept;
      if (kept.length === 0) {
        const cands = byTag(["rate"]);
        ids2 = cands.length > 0 ? [cands[cands.length - 1].def.id] : [];
      }
      if (ids2.length !== va.qAssetIds.length || ids2.some((x, i) => x !== va.qAssetIds[i])) {
        changed = true;
        return { ...va, qAssetIds: ids2 };
      }
      return va;
    });
    return changed ? { variants: next } : null;
  }

  const specs = REF_FIELDS[mod.type];
  if (!specs) return null;
  const patch: Record<string, unknown> = {};

  for (const s of specs) {
    const tags = s.tags(mod.params);
    if (s.many) {
      const cur = (mod.params[s.field] ?? []) as string[];
      const kept = cur.filter((x) => ids.has(x));
      let next = kept;
      if (kept.length === 0) {
        const cands = byTag(tags);
        next = s.fillAll
          ? cands.map((a) => a.def.id)
          : cands.length > 0
            ? [cands[cands.length - 1].def.id]
            : [];
      }
      if (next.length !== cur.length || next.some((x, i) => x !== cur[i])) {
        patch[s.field] = next;
      }
    } else {
      const cur = (mod.params[s.field] ?? null) as string | null;
      if (cur && ids.has(cur)) continue;
      const cands = byTag(tags);
      const next = cands.length > 0 ? cands[cands.length - 1].def.id : null;
      if (next !== cur) patch[s.field] = next;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
