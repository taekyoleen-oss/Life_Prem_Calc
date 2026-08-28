import type {
  DecrementCombine,
  M02Params,
  M04Params,
  M04Variant,
  M05Params,
  M05Variant,
  M06Params,
  M07Params,
  M08Params,
  M09Params,
  ModuleInstance,
  PvTiming,
} from "@/types/modules";
import type { ComputedAsset, ModuleResult, RateTable, SheetComputation } from "@/lib/engine/pipeline";
import { MODULE_CATALOG } from "@/lib/engine/pipeline";
import { parse } from "@/lib/formula/parser";
import { astToPython, PY_HELPERS } from "./formula-py";

/**
 * Python 코드 생성 (설계서 §3.5): LLM을 사용하지 않는 결정론적 템플릿.
 * 연산 순서는 엔진·정준 계산 순서(docs/domain/golden-cases.md §2)와 완전히
 * 동일해 float64 대사(생성 코드 실행값 = 엔진값)가 성립한다.
 * 스크립트는 활성 시트 기준이며 공용탭 모듈을 앞에 인라인한다.
 */

export interface CodegenInput {
  sheetName: string;
  /** 공용탭 모듈(있으면) + 시트 모듈, 파이프라인 순서 */
  modules: ModuleInstance[];
  /** 등록 순서의 전체 자산 (공용탭 포함) */
  assets: ComputedAsset[];
  byId: Record<string, ComputedAsset>;
  results: Record<string, ModuleResult>;
  contract: M02Params | null;
}

/** 시트 계산 결과에서 코드 생성 입력을 조립한다 */
export function buildCodegenInput(
  sheet: { name: string; sheetType: "shared" | "normal"; pipeline: ModuleInstance[] },
  shared: { pipeline: ModuleInstance[] } | null,
  comp: SheetComputation,
  sharedComp: SheetComputation | null,
): CodegenInput {
  const includeShared = sheet.sheetType === "normal" && shared && sharedComp;
  return {
    sheetName: sheet.name,
    modules: includeShared ? [...shared.pipeline, ...sheet.pipeline] : sheet.pipeline,
    assets: comp.assets,
    byId: comp.byId,
    results: includeShared ? { ...sharedComp.results, ...comp.results } : comp.results,
    contract: comp.contract,
  };
}

const py = (x: number): string => String(x);
const pyList = (xs: number[]): string => `[${xs.map(py).join(", ")}]`;

const TIMING_KO: Record<PvTiming, string> = { begin: "연시", mid: "연중", end: "연말" };
const COMBINE_KO: Record<DecrementCombine, string> = {
  single: "단일탈퇴", independent: "독립 곱", sum: "단순 합산",
};

interface Gen {
  lines: string[];
  /** 계약 스칼라 변수명 (M02 방출 시 기록) */
  vars: { x: string; n: string; m: string; s: string } | null;
  contract: M02Params | null;
}

function code(input: CodegenInput, assetId: string | null | undefined): string {
  const a = assetId ? input.byId[assetId] : undefined;
  if (!a) throw new Error(`codegen: 자산을 찾을 수 없습니다 (${assetId})`);
  return a.def.code;
}

function sliceOf(table: RateTable, c: M02Params): number[] {
  const start = c.age - table.startAge;
  return table.values.slice(start, start + c.years);
}

/** 모듈 하나의 코드 블록. idx는 내부 임시 변수 접미사(결정론). */
function emitModule(input: CodegenInput, g: Gen, mod: ModuleInstance, idx: number): string[] {
  const r = input.results[mod.id];
  const label = MODULE_CATALOG[mod.type].label;
  const head = `# === ${mod.type} ${mod.title ?? label} ===`;
  if (!r || r.status !== "done") {
    return [head, `# (미완성 상태 — 생략: ${r?.message ?? "결과 없음"})`, ""];
  }
  const L: string[] = [head];
  const v = g.vars;

  switch (mod.type) {
    case "M01": {
      const p = mod.params as { productName?: string; productType?: string; memo?: string };
      L.push(`# 상품: ${p.productName ?? ""} (${p.productType ?? ""})`);
      break;
    }
    case "M02": {
      const p = mod.params as unknown as M02Params;
      const xC = code(input, `${mod.id}:x`);
      const nC = code(input, `${mod.id}:n`);
      const mC = code(input, `${mod.id}:m`);
      const sC = code(input, `${mod.id}:s`);
      L.push(
        `${xC} = ${py(p.age)}  # 가입연령 (${p.sex === "male" ? "남" : "여"})`,
        `${nC} = ${py(p.years)}  # 보험기간`,
        `${mC} = ${py(p.payYears)}  # 납입기간 (연납)`,
        `${sC} = ${py(p.sumAssured)}  # 가입금액`,
        `t = list(range(${nC}))  # 경과기간 인덱스`,
      );
      g.vars = { x: xC, n: nC, m: mC, s: sC };
      g.contract = p;
      break;
    }
    case "M03": {
      const c = g.contract;
      if (!c) return [head, "# (계약조건 없음 — 생략)", ""];
      for (const a of r.assets) {
        const table = a.value as RateTable;
        L.push(
          `${a.def.code} = ${pyList(sliceOf(table, c))}  # ${a.def.displayName} · 연령 ${c.age}~${c.age + c.years - 1}`,
        );
      }
      break;
    }
    case "M04": {
      const p = mod.params as unknown as M04Params & { extraTimings?: PvTiming[] };
      const variants: M04Variant[] =
        p.variants ??
        [
          { key: "v", timing: "begin" as PvTiming },
          ...(p.extraTimings ?? []).filter((tt) => tt === "mid" || tt === "end").map((tt) => ({ key: `v_${tt}`, timing: tt })),
        ];
      const base = variants.find((va) => va.timing === "begin");
      const d = `_disc${idx}`;
      L.push(`${d} = 1 / (1 + ${py(p.i)})  # v = 1/(1+i), i = ${p.i * 100}%`);
      // 기준 v^t (연시 소단계가 없으면 내부 변수로만)
      const baseName = base ? code(input, `${mod.id}:${base.key}`) : `_vbase${idx}`;
      L.push(`${baseName} = [1.0]`, `for _t in range(${v!.n}):`, `    ${baseName}.append(${baseName}[_t] * ${d})`);
      for (const va of variants) {
        if (va.timing === "begin") {
          if (va !== base) L.push(`${code(input, `${mod.id}:${va.key}`)} = list(${baseName})`);
          continue;
        }
        const name = code(input, `${mod.id}:${va.key}`);
        if (va.timing === "mid") {
          L.push(`${name} = [_x * math.sqrt(${d}) for _x in ${baseName}]  # 연중 v^(t+1/2)`);
        } else {
          L.push(`${name} = [_x * ${d} for _x in ${baseName}]  # 연말 v^(t+1)`);
        }
      }
      break;
    }
    case "M05": {
      const raw = mod.params as unknown as M05Params & {
        qAssetIds?: string[]; l0?: number; combine?: DecrementCombine; usage?: "survivors" | "payers";
      };
      const variants: M05Variant[] = raw.variants ?? [{
        key: "l", usage: raw.usage ?? "survivors", qAssetIds: raw.qAssetIds ?? [],
        l0: raw.l0 ?? 100_000, combine: raw.combine ?? "single",
      }];
      for (const va of variants) {
        const name = code(input, `${mod.id}:${va.key}`);
        const qs = va.qAssetIds.map((id) => code(input, id));
        const factor =
          va.combine === "sum"
            ? `(1 - (${qs.map((q) => `${q}[_t]`).join(" + ")}))`
            : qs.map((q) => `(1 - ${q}[_t])`).join(" * ");
        L.push(
          `${name} = [float(${py(va.l0)})]  # ${COMBINE_KO[va.combine]}`,
          `for _t in range(${v!.n}):`,
          `    ${name}.append(${name}[_t] * ${factor})`,
        );
      }
      break;
    }
    case "M06": {
      const p = mod.params as unknown as M06Params;
      const name = code(input, `${mod.id}:d`);
      const l = code(input, p.lAssetId);
      const q = code(input, p.qAssetId);
      L.push(`${name} = [${l}[_t] * ${q}[_t] for _t in range(${v!.n})]  # d = l·q`);
      break;
    }
    case "M07": {
      const p = mod.params as unknown as M07Params;
      const vp = code(input, p.vAssetId);
      const amount = p.amountMode === "S" ? v!.s : py(p.customAmount);
      if (p.kind === "income") {
        const lp = code(input, p.seriesAssetId);
        const series = code(input, `${mod.id}:series`);
        const total = code(input, `${mod.id}:total`);
        L.push(
          `${series} = [${lp}[_t] * ${vp}[_t] for _t in range(${v!.m})]  # 수입현가(연시) 연도별`,
          `${total} = 0.0`,
          `for _t in range(${v!.m}):`,
          `    ${total} += ${lp}[_t] * ${vp}[_t]`,
        );
      } else if (p.kind === "death") {
        const dC = code(input, p.seriesAssetId);
        const series = code(input, `${mod.id}:series`);
        const total = code(input, `${mod.id}:total`);
        let term: string;
        if (p.timing === "end") term = `${amount} * ${dC}[_t] * ${vp}[_t + 1]`;
        else if (p.timing === "mid") {
          L.push(`_sqv${idx} = math.sqrt(${vp}[1])`);
          term = `${amount} * ${dC}[_t] * (${vp}[_t] * _sqv${idx})`;
        } else term = `${amount} * ${dC}[_t] * ${vp}[_t]`;
        L.push(
          `${series} = [${term} for _t in range(${v!.n})]  # 지급현가(${TIMING_KO[p.timing]}) 연도별`,
          `${total} = 0.0`,
          `for _t in range(${v!.n}):`,
          `    ${total} += ${term}`,
        );
      } else {
        const l = code(input, p.seriesAssetId);
        const total = code(input, `${mod.id}:total`);
        L.push(`${total} = ${amount} * ${l}[${v!.n}] * ${vp}[${v!.n}]  # 만기 지급현가`);
      }
      break;
    }
    case "M08": {
      const p = mod.params as unknown as M08Params;
      const pIn = `_pvin${idx}`;
      const pOut = `_pvout${idx}`;
      const ordered = (ids: string[]) =>
        input.assets.filter((a) => ids.includes(a.def.id)).map((a) => a.def.code);
      L.push(`${pIn} = 0.0`);
      for (const cc of ordered(p.incomeAssetIds)) L.push(`${pIn} += ${cc}`);
      L.push(`${pOut} = 0.0`);
      for (const cc of ordered(p.outgoAssetIds)) L.push(`${pOut} += ${cc}`);
      L.push(`${code(input, `${mod.id}:p`)} = ${pOut} / ${pIn}  # 연납 순보험료`);
      if (p.lAssetId && input.byId[`${mod.id}:nsp`]) {
        L.push(`${code(input, `${mod.id}:nsp`)} = ${pOut} / ${code(input, p.lAssetId)}[0]  # 일시납 순보험료`);
      }
      break;
    }
    case "M09": {
      const p = mod.params as unknown as M09Params;
      const pIn = `_pvin${idx}`;
      const pOut = `_pvout${idx}`;
      const ordered = (ids: string[]) =>
        input.assets.filter((a) => ids.includes(a.def.id)).map((a) => a.def.code);
      L.push(`${pIn} = 0.0`);
      for (const cc of ordered(p.incomeAssetIds)) L.push(`${pIn} += ${cc}`);
      L.push(`${pOut} = 0.0`);
      for (const cc of ordered(p.outgoAssetIds)) L.push(`${pOut} += ${cc}`);
      const gC = code(input, `${mod.id}:g`);
      if (p.method === "A") {
        const l = code(input, p.lAssetId);
        const vp = code(input, p.vAssetId);
        L.push(
          `_e${idx} = 0.0  # 유지비 기저 E = Σ l·v^t`,
          `for _t in range(${v!.n}):`,
          `    _e${idx} += ${l}[_t] * ${vp}[_t]`,
          `_na${idx} = ${py(p.alpha)} * ${v!.s} * ${l}[0]`,
          `_nb${idx} = ${py(p.beta)} * ${v!.s} * _e${idx}`,
          `${gC} = (${pOut} + _na${idx} + _nb${idx}) / (${pIn} * (1 - ${py(p.gamma)}))  # 방식 A`,
        );
      } else {
        L.push(`${gC} = (${pOut} / ${pIn}) / (1 - ${py(p.loadingK)})  # 방식 B: G = P/(1-k)`);
      }
      break;
    }
    case "M10": {
      const p = mod.params as { expression?: string };
      const name = code(input, `${mod.id}:f`);
      L.push(`${name} = ${astToPython(parse(p.expression ?? ""))}  # 수식: ${p.expression}`);
      break;
    }
    default:
      L.push(`# (${mod.type}: 코드 생성 미지원)`);
  }
  L.push("");
  return L;
}

export function generatePython(input: CodegenInput): string {
  const g: Gen = { lines: [], vars: null, contract: null };
  const out: string[] = [
    `# PremiaFlow 자동 생성 Python 스크립트 — 시트: ${input.sheetName}`,
    `# 동일 파이프라인은 항상 동일한 코드를 생성합니다 (결정론 템플릿, LLM 미사용).`,
    `# 연산 순서는 앱 엔진의 정준 계산 순서와 동일하여 실행값이 화면 값과 일치합니다.`,
    `import math`,
    `import json`,
    ``,
    PY_HELPERS,
    ``,
  ];
  input.modules.forEach((mod, i) => {
    out.push(...emitModule(input, g, mod, i));
  });

  // 결과: 완료 모듈의 모든 자산(표 제외)을 JSON으로 출력 — 대사 테스트가 정확 비교
  out.push(`# === 결과 ===`, `_result = {}`);
  for (const a of input.assets) {
    if (a.def.kind === "table") continue;
    out.push(`_result[${JSON.stringify(a.def.code)}] = ${a.def.code}`);
  }
  out.push(
    `print("##RESULT## " + json.dumps(_result))`,
    ``,
    `# 사람이 읽는 요약`,
    `for _k in ("nsp", "p_annual", "g_annual"):`,
    `    if _k in _result:`,
    `        print(_k, "=", _result[_k])`,
    `try:`,
    `    import pandas as _pd`,
    `    _series = {_k: _v for _k, _v in _result.items() if isinstance(_v, list)}`,
    `    if _series:`,
    `        _n = max(len(_v) for _v in _series.values())`,
    `        _df = _pd.DataFrame({_k: _v + [None] * (_n - len(_v)) for _k, _v in _series.items()})`,
    `        print(_df.to_string())`,
    `except ImportError:`,
    `    pass`,
    ``,
  );
  return out.join("\n");
}

/** 모듈 카드의 코드 보기 스니펫 (해당 모듈 블록만) */
export function generatePythonModule(input: CodegenInput, moduleId: string): string {
  const g: Gen = { lines: [], vars: null, contract: null };
  let snippet = `# (이 블록은 상류 변수 정의를 전제합니다 — 전체 스크립트 내보내기 참고)`;
  input.modules.forEach((mod, i) => {
    const lines = emitModule(input, g, mod, i); // vars·contract 추적을 위해 전부 순회
    if (mod.id === moduleId) snippet = lines.join("\n");
  });
  return snippet;
}
