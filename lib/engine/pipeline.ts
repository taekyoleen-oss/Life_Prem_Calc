import { ASSET_CODE_RE, type AssetDef } from "@/types/assets";
import type {
  AssetNameOverride,
  M01Params,
  M02Params,
  M03Params,
  M04Params,
  M05Params,
  M06Params,
  M07Params,
  M08Params,
  ModuleInstance,
  ModuleStatus,
  ModuleTypeId,
} from "@/types/modules";
import rates from "./seed/dummy-rates.json";
import { deaths, survivors } from "./decrement";
import { discountFactors, pvBenefit, pvIncome, pvMaturity } from "./pv";
import { annualNetPremium, netSinglePremium, roundPremium } from "./premium";
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
  | "premium";

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
  final: { nsp: number | null; p: number | null; pRounded: number | null };
}

/** 공용 라이브러리 (P2: 더미 표만, 설계서 §10-2) */
export const RATE_LIBRARY = {
  male: { label: "더미 사망률(남)", isMortality: true, values: rates.male },
  female: { label: "더미 사망률(여)", isMortality: true, values: rates.female },
  diagnosis: { label: "더미 진단률", isMortality: false, values: rates.diagnosis },
} as const;

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
  M09: { label: "사업비·영업보험료", repeatable: false, available: false, desc: "P3에서 제공" },
  M10: { label: "사용자 수식", repeatable: true, available: false, desc: "P4에서 제공" },
  M11: { label: "결과 요약", repeatable: false, available: false, desc: "P4에서 제공" },
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
  M08: [],
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

export function computeSheet(pipeline: ModuleInstance[]): SheetComputation {
  const ctx: Ctx = {
    registry: new Map(),
    order: [],
    codes: new Set(),
    contract: null,
  };
  const results: Record<string, ModuleResult> = {};
  const final: SheetComputation["final"] = { nsp: null, p: null, pRounded: null };

  for (const mod of pipeline) {
    const assets: ComputedAsset[] = [];
    const summary: string[] = [];
    const warnings: string[] = [];
    let status: ModuleStatus = "done";
    let message: string | undefined;

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
          const p = mod.params as unknown as M03Params;
          const lib = RATE_LIBRARY[p.libraryKey];
          if (!lib) throw new IncompleteError("위험률을 선택하세요.");
          const table: RateTable = { startAge: 0, values: lib.values as number[], isMortality: lib.isMortality };
          const name = { male: "q_사망_남", female: "q_사망_여", diagnosis: "q_진단" }[p.libraryKey];
          assets.push(
            register(ctx, mod, warnings, {
              slot: "q", code: `q${nextIndex(ctx, "q")}`, displayName: name,
              kind: "table", value: table, tag: "rate", isMortality: lib.isMortality,
            }),
          );
          summary.push(lib.label, lib.isMortality ? "사망률" : "발생률");
          break;
        }
        case "M04": {
          const p = mod.params as unknown as M04Params;
          const c = requireContract(ctx);
          if (!(p.i >= 0)) throw new IncompleteError("예정이율을 입력하세요.");
          // v^t는 n+1개 필요, 연말 이동 계열은 v^{n+1}까지 필요
          const vpFull = discountFactors(p.i, c.years + 2);
          const vp = vpFull.slice(0, c.years + 1);
          const extra = (p.extraTimings ?? []).filter((t) => t === "mid" || t === "end");
          const k = nextIndex(ctx, "v", ["", "_mid", "_end"]);
          assets.push(
            register(ctx, mod, warnings, {
              slot: "v", code: `v${k}`, displayName: `v_${fmtPct(p.i)}`,
              kind: "series", value: vp, tag: "discount",
            }),
          );
          if (extra.includes("mid")) {
            const sqv = Math.sqrt(vpFull[1]);
            assets.push(
              register(ctx, mod, warnings, {
                slot: "v_mid", code: `v${k}_mid`, displayName: `v_${fmtPct(p.i)}(연중)`,
                kind: "series", value: vp.map((x) => x * sqv), tag: "discount_shifted",
              }),
            );
          }
          if (extra.includes("end")) {
            assets.push(
              register(ctx, mod, warnings, {
                slot: "v_end", code: `v${k}_end`, displayName: `v_${fmtPct(p.i)}(연말)`,
                kind: "series", value: vpFull.slice(1, c.years + 2), tag: "discount_shifted",
              }),
            );
          }
          summary.push(`i = ${fmtPct(p.i)}`, "연복리");
          if (extra.length > 0) summary.push(`추가 계열: ${extra.map((t) => TIMING_LABEL[t as "mid" | "end"]).join("·")}`);
          break;
        }
        case "M05": {
          const p = mod.params as unknown as M05Params;
          const c = requireContract(ctx);
          if (p.qAssetIds.length === 0) throw new IncompleteError("탈퇴원인 q 계열을 선택하세요.");
          if (!(p.l0 > 0)) throw new IncompleteError("기수 l0를 입력하세요.");
          const tables = p.qAssetIds.map((id) => asTable(needTag(need(ctx, id), ["rate"], "위험률 표")));
          const slices = tables.map((t) => sliceTable(t, c.age, c.years));
          const l = survivors(p.l0, slices, p.combine);
          const hasMortality = tables.some((t) => t.isMortality);
          const isPayer = p.usage === "payers";
          assets.push(
            register(ctx, mod, warnings, {
              slot: "l",
              code: isPayer ? `lp${nextIndex(ctx, "lp")}` : `l${nextIndex(ctx, "l")}`,
              displayName: isPayer ? "lp_납입자수" : "l_생존자수",
              kind: "series", value: l, tag: isPayer ? "payers" : "survivors",
            }),
          );
          const combineLabel = { single: "단일탈퇴", independent: "독립 곱", sum: "단순 합산" }[p.combine];
          summary.push(
            `l0 = ${fmt(p.l0)}`,
            p.qAssetIds.length > 1 ? `${combineLabel}(${p.qAssetIds.length}원인)` : combineLabel,
            hasMortality ? "사망 포함" : "사망 미포함",
          );
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
      assets,
      summary,
    };
  }

  const byId: Record<string, ComputedAsset> = {};
  for (const a of ctx.order) byId[a.def.id] = a;
  return { results, assets: ctx.order, byId, contract: ctx.contract, final };
}
