import type {
  DecrementCombine,
  M02Params,
  M04Params,
  M04Variant,
  M05Params,
  M05Variant,
  M07Params,
  M08Params,
  M09Params,
  PvTiming,
} from "@/types/modules";
import type { RateTable } from "@/lib/engine/pipeline";
import { MODULE_CATALOG } from "@/lib/engine/pipeline";
import { parse, type FormulaNode } from "@/lib/formula/parser";
import type { CodegenInput } from "./python";

/**
 * VBA 코드 생성 (설계서 §3.5): 표준 모듈 .bas — 배열 계산 후 단계별 표를
 * 워크시트에 기록한다. CI 자동 실행이 불가하므로(Excel 필요) 골든 케이스
 * 수동 스팟 체크로 검증한다(v1.2 확정). 결정론 템플릿, LLM 미사용.
 */

const vb = (x: number): string => {
  const s = String(x);
  return s.includes("e") ? s.replace("e", "E") : s;
};

// ── M10 AST → VBA (Variant 헬퍼 기반, 평가기와 동일 의미) ─────────
const BIN_FN: Record<string, string> = {
  "+": "PfAdd", "-": "PfSub", "*": "PfMul", "/": "PfDiv", "^": "PfPow",
  "=": "PfEq", "<>": "PfNe", "<": "PfLt", "<=": "PfLe", ">": "PfGt", ">=": "PfGe",
};

function astToVba(node: FormulaNode): string {
  switch (node.type) {
    case "num":
      return vb(node.value);
    case "ref":
      return node.name;
    case "unary":
      return `PfNeg(${astToVba(node.operand)})`;
    case "binary":
      return `${BIN_FN[node.op]}(${astToVba(node.left)}, ${astToVba(node.right)})`;
    case "call": {
      const args = node.args.map(astToVba);
      switch (node.fn) {
        case "SUM": return `PfSum(${args[0]})`;
        case "CUMSUM": return `PfCumSum(${args[0]})`;
        case "SHIFT": return `PfShift(${args[0]}, ${args[1]})`;
        case "ROUND": return `PfRoundHU(${args[0]}, ${args[1] ?? "0"})`;
        case "FLOOR": return `PfFloorD(${args[0]}, ${args[1] ?? "0"})`;
        case "CEIL": return `PfCeilD(${args[0]}, ${args[1] ?? "0"})`;
        case "MIN": return args.reduce((acc, a) => (acc ? `PfMin2(${acc}, ${a})` : a), "");
        case "MAX": return args.reduce((acc, a) => (acc ? `PfMax2(${acc}, ${a})` : a), "");
        case "IF": return `PfIf(${args.join(", ")})`;
        case "POW": return `PfPow(${args[0]}, ${args[1]})`;
        default: throw new Error(`VBA 변환이 정의되지 않은 함수: ${node.fn}`);
      }
    }
  }
}

const TIMING_KO: Record<PvTiming, string> = { begin: "연시", mid: "연중", end: "연말" };
const COMBINE_KO: Record<DecrementCombine, string> = {
  single: "단일탈퇴", independent: "독립 곱", sum: "단순 합산",
};

function code(input: CodegenInput, assetId: string | null | undefined): string {
  const a = assetId ? input.byId[assetId] : undefined;
  if (!a) throw new Error(`codegen: 자산을 찾을 수 없습니다 (${assetId})`);
  return a.def.code;
}

/** Variant 배열 리터럴: 여러 줄 이어쓰기(_)로 분할 */
function arrayLiteral(name: string, values: number[], comment: string): string[] {
  const parts = values.map(vb);
  const lines: string[] = [`    ${name} = Array( _`];
  for (let i = 0; i < parts.length; i += 8) {
    const chunk = parts.slice(i, i + 8).join(", ");
    lines.push(`        ${chunk}${i + 8 < parts.length ? ", _" : ")"}`);
  }
  lines[lines.length - 1] += `  ' ${comment}`;
  return lines;
}

export function generateVba(input: CodegenInput): string {
  const body: string[] = [];
  const dims: string[] = [];
  const seriesVars: string[] = [];
  const scalarVars: string[] = [];
  let vars: { x: string; n: string; m: string; s: string } | null = null;
  let contract: M02Params | null = null;

  const dim = (name: string, kind: "Variant" | "Double") => {
    dims.push(`    Dim ${name} As ${kind}`);
    (kind === "Variant" ? seriesVars : scalarVars).push(name);
  };

  input.modules.forEach((mod, idx) => {
    const r = input.results[mod.id];
    const label = MODULE_CATALOG[mod.type].label;
    body.push(`    ' === ${mod.type} ${mod.title ?? label} ===`);
    if (!r || r.status !== "done") {
      body.push(`    ' (미완성 상태 — 생략)`, "");
      return;
    }
    const v = vars;

    switch (mod.type) {
      case "M01":
        break;
      case "M02": {
        const p = mod.params as unknown as M02Params;
        const xC = code(input, `${mod.id}:x`);
        const nC = code(input, `${mod.id}:n`);
        const mC = code(input, `${mod.id}:m`);
        const sC = code(input, `${mod.id}:s`);
        for (const c of [xC, nC, mC, sC]) dim(c, "Double");
        body.push(
          `    ${xC} = ${vb(p.age)}: ${nC} = ${vb(p.years)}: ${mC} = ${vb(p.payYears)}: ${sC} = ${vb(p.sumAssured)}`,
        );
        vars = { x: xC, n: nC, m: mC, s: sC };
        contract = p;
        break;
      }
      case "M03": {
        if (!contract) { body.push(`    ' (계약조건 없음 — 생략)`); break; }
        for (const a of r.assets) {
          const table = a.value as RateTable;
          const start = contract.age - table.startAge;
          dim(a.def.code, "Variant");
          body.push(...arrayLiteral(a.def.code, table.values.slice(start, start + contract.years), a.def.displayName));
        }
        break;
      }
      case "M04": {
        const p = mod.params as unknown as M04Params & { extraTimings?: PvTiming[] };
        const variants: M04Variant[] =
          p.variants ?? [
            { key: "v", timing: "begin" as PvTiming },
            ...(p.extraTimings ?? []).filter((t) => t === "mid" || t === "end").map((t) => ({ key: `v_${t}`, timing: t })),
          ];
        const d = `disc${idx}`;
        dims.push(`    Dim ${d} As Double, i${idx} As Long`);
        const base = variants.find((va) => va.timing === "begin");
        const baseName = base ? code(input, `${mod.id}:${base.key}`) : `vbase${idx}`;
        dim(baseName, "Variant");
        body.push(
          `    ${d} = 1 / (1 + ${vb(p.i)})  ' i = ${p.i * 100}%`,
          `    ReDim tmp${idx}(0 To ${v!.n}) As Double`,
          `    tmp${idx}(0) = 1`,
          `    For i${idx} = 1 To ${v!.n}: tmp${idx}(i${idx}) = tmp${idx}(i${idx} - 1) * ${d}: Next i${idx}`,
          `    ${baseName} = tmp${idx}`,
        );
        for (const va of variants) {
          if (va.timing === "begin") continue;
          const name = code(input, `${mod.id}:${va.key}`);
          dim(name, "Variant");
          const factor = va.timing === "mid" ? `Sqr(${d})` : d;
          body.push(
            `    ${name} = ${baseName}`,
            `    For i${idx} = 0 To ${v!.n}: ${name}(i${idx}) = ${name}(i${idx}) * ${factor}: Next i${idx}  ' ${TIMING_KO[va.timing]}`,
          );
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
        dims.push(`    Dim t${idx} As Long`);
        variants.forEach((va, vi) => {
          const name = code(input, `${mod.id}:${va.key}`);
          const qs = va.qAssetIds.map((id) => code(input, id));
          const factor =
            va.combine === "sum"
              ? `(1 - (${qs.map((q) => `${q}(t${idx})`).join(" + ")}))`
              : qs.map((q) => `(1 - ${q}(t${idx}))`).join(" * ");
          dim(name, "Variant");
          body.push(
            `    ReDim lv${idx}_${vi}(0 To ${v!.n}) As Double  ' ${COMBINE_KO[va.combine]}`,
            `    lv${idx}_${vi}(0) = ${vb(va.l0)}`,
            `    For t${idx} = 0 To ${v!.n} - 1: lv${idx}_${vi}(t${idx} + 1) = lv${idx}_${vi}(t${idx}) * ${factor}: Next t${idx}`,
            `    ${name} = lv${idx}_${vi}`,
          );
        });
        break;
      }
      case "M06": {
        const p = mod.params as unknown as import("@/types/modules").M06Params;
        const name = code(input, `${mod.id}:d`);
        const l = code(input, p.lAssetId);
        const q = code(input, p.qAssetId);
        dim(name, "Variant");
        dims.push(`    Dim t${idx} As Long`);
        body.push(
          `    ReDim dv${idx}(0 To ${v!.n} - 1) As Double`,
          `    For t${idx} = 0 To ${v!.n} - 1: dv${idx}(t${idx}) = ${l}(t${idx}) * ${q}(t${idx}): Next t${idx}  ' d = l·q`,
          `    ${name} = dv${idx}`,
        );
        break;
      }
      case "M07": {
        const p = mod.params as unknown as M07Params;
        const vp = code(input, p.vAssetId);
        const amount = p.amountMode === "S" ? v!.s : vb(p.customAmount);
        dims.push(`    Dim t${idx} As Long`);
        if (p.kind === "income") {
          const lp = code(input, p.seriesAssetId);
          const total = code(input, `${mod.id}:total`);
          dim(total, "Double");
          body.push(
            `    ${total} = 0  ' 수입현가(연시)`,
            `    For t${idx} = 0 To ${v!.m} - 1: ${total} = ${total} + ${lp}(t${idx}) * ${vp}(t${idx}): Next t${idx}`,
          );
        } else if (p.kind === "death") {
          const dC = code(input, p.seriesAssetId);
          const total = code(input, `${mod.id}:total`);
          dim(total, "Double");
          const term =
            p.timing === "end" ? `${amount} * ${dC}(t${idx}) * ${vp}(t${idx} + 1)`
            : p.timing === "mid" ? `${amount} * ${dC}(t${idx}) * (${vp}(t${idx}) * Sqr(${vp}(1)))`
            : `${amount} * ${dC}(t${idx}) * ${vp}(t${idx})`;
          body.push(
            `    ${total} = 0  ' 지급현가(${TIMING_KO[p.timing]})`,
            `    For t${idx} = 0 To ${v!.n} - 1: ${total} = ${total} + ${term}: Next t${idx}`,
          );
        } else {
          const l = code(input, p.seriesAssetId);
          const total = code(input, `${mod.id}:total`);
          dim(total, "Double");
          body.push(`    ${total} = ${amount} * ${l}(${v!.n}) * ${vp}(${v!.n})  ' 만기 지급현가`);
        }
        break;
      }
      case "M08": {
        const p = mod.params as unknown as M08Params;
        const ordered = (ids: string[]) =>
          input.assets.filter((a) => ids.includes(a.def.id)).map((a) => a.def.code);
        dims.push(`    Dim pvin${idx} As Double, pvout${idx} As Double`);
        body.push(`    pvin${idx} = 0`);
        for (const cc of ordered(p.incomeAssetIds)) body.push(`    pvin${idx} = pvin${idx} + ${cc}`);
        body.push(`    pvout${idx} = 0`);
        for (const cc of ordered(p.outgoAssetIds)) body.push(`    pvout${idx} = pvout${idx} + ${cc}`);
        const pC = code(input, `${mod.id}:p`);
        dim(pC, "Double");
        body.push(`    ${pC} = pvout${idx} / pvin${idx}  ' 연납 순보험료`);
        if (p.lAssetId && input.byId[`${mod.id}:nsp`]) {
          const nspC = code(input, `${mod.id}:nsp`);
          dim(nspC, "Double");
          body.push(`    ${nspC} = pvout${idx} / ${code(input, p.lAssetId)}(0)  ' 일시납 순보험료`);
        }
        break;
      }
      case "M09": {
        const p = mod.params as unknown as M09Params;
        const ordered = (ids: string[]) =>
          input.assets.filter((a) => ids.includes(a.def.id)).map((a) => a.def.code);
        dims.push(`    Dim pvin${idx} As Double, pvout${idx} As Double, t${idx} As Long`);
        body.push(`    pvin${idx} = 0`);
        for (const cc of ordered(p.incomeAssetIds)) body.push(`    pvin${idx} = pvin${idx} + ${cc}`);
        body.push(`    pvout${idx} = 0`);
        for (const cc of ordered(p.outgoAssetIds)) body.push(`    pvout${idx} = pvout${idx} + ${cc}`);
        const gC = code(input, `${mod.id}:g`);
        dim(gC, "Double");
        if (p.method === "A") {
          const l = code(input, p.lAssetId);
          const vp = code(input, p.vAssetId);
          dims.push(`    Dim e${idx} As Double`);
          body.push(
            `    e${idx} = 0  ' 유지비 기저 E`,
            `    For t${idx} = 0 To ${v!.n} - 1: e${idx} = e${idx} + ${l}(t${idx}) * ${vp}(t${idx}): Next t${idx}`,
            `    ${gC} = (pvout${idx} + ${vb(p.alpha)} * ${v!.s} * ${l}(0) + ${vb(p.beta)} * ${v!.s} * e${idx}) / (pvin${idx} * (1 - ${vb(p.gamma)}))  ' 방식 A`,
          );
        } else {
          body.push(`    ${gC} = (pvout${idx} / pvin${idx}) / (1 - ${vb(p.loadingK)})  ' 방식 B`);
        }
        break;
      }
      case "M10": {
        const p = mod.params as { expression?: string };
        const name = code(input, `${mod.id}:f`);
        dim(name, "Variant");
        body.push(`    ${name} = ${astToVba(parse(p.expression ?? ""))}  ' 수식: ${p.expression}`);
        break;
      }
      default:
        body.push(`    ' (${mod.type}: 코드 생성 미지원)`);
    }
    body.push("");
  });

  // 워크시트 출력: 계열은 열로, 스칼라는 우측 요약으로
  const out: string[] = [
    `Attribute VB_Name = "PremiaFlow"`,
    `' PremiaFlow 자동 생성 VBA — 시트: ${input.sheetName}`,
    `' 동일 파이프라인은 항상 동일한 코드를 생성합니다 (결정론 템플릿, LLM 미사용).`,
    `' 실행: 표준 모듈로 가져온 뒤 PremiaFlow_Calc 실행 → 활성 워크시트에 결과 기록.`,
    `' 검증: 골든 케이스 수동 스팟 체크 (CI 자동 대사는 Python 스크립트가 담당).`,
    `Option Explicit`,
    ``,
    `Sub PremiaFlow_Calc()`,
    ...dims,
    `    Dim ws As Worksheet, r As Long, c As Long`,
    ``,
    ...body,
    `    ' === 워크시트 출력 ===`,
    `    Set ws = ActiveSheet`,
    `    ws.Cells.Clear`,
    `    ws.Cells(1, 1).Value = "t"`,
  ];
  let col = 2;
  for (const name of seriesVars) {
    out.push(
      `    ws.Cells(1, ${col}).Value = "${name}"`,
      `    For r = LBound(${name}) To UBound(${name}): ws.Cells(r + 2, ${col}).Value = ${name}(r): Next r`,
    );
    col++;
  }
  out.push(`    For r = 0 To 25: ws.Cells(r + 2, 1).Value = r: Next r`);
  let srow = 1;
  out.push(`    ws.Cells(1, ${col + 1}).Value = "스칼라"`);
  for (const name of scalarVars) {
    srow++;
    out.push(
      `    ws.Cells(${srow}, ${col + 1}).Value = "${name}"`,
      `    ws.Cells(${srow}, ${col + 2}).Value = ${name}`,
    );
  }
  out.push(`End Sub`, ``, VBA_HELPERS);
  return out.join("\r\n");
}

/** M10 수식용 Variant 헬퍼 (고정 템플릿) */
const VBA_HELPERS = `\
' === 수식(M10) 헬퍼: 계열(Variant 배열)·스칼라 브로드캐스트 ===
Private Function PfIsArr(v As Variant) As Boolean
    PfIsArr = IsArray(v)
End Function

Private Function PfBc(a As Variant, b As Variant, op As String) As Variant
    Dim i As Long, outv() As Variant
    If PfIsArr(a) And PfIsArr(b) Then
        ReDim outv(LBound(a) To UBound(a))
        For i = LBound(a) To UBound(a): outv(i) = PfOp(a(i), b(i), op): Next i
        PfBc = outv
    ElseIf PfIsArr(a) Then
        ReDim outv(LBound(a) To UBound(a))
        For i = LBound(a) To UBound(a): outv(i) = PfOp(a(i), b, op): Next i
        PfBc = outv
    ElseIf PfIsArr(b) Then
        ReDim outv(LBound(b) To UBound(b))
        For i = LBound(b) To UBound(b): outv(i) = PfOp(a, b(i), op): Next i
        PfBc = outv
    Else
        PfBc = PfOp(a, b, op)
    End If
End Function

Private Function PfOp(x As Variant, y As Variant, op As String) As Variant
    Select Case op
        Case "+": PfOp = x + y
        Case "-": PfOp = x - y
        Case "*": PfOp = x * y
        Case "/": PfOp = x / y
        Case "^": PfOp = x ^ y
        Case "=": PfOp = IIf(x = y, 1#, 0#)
        Case "<>": PfOp = IIf(x <> y, 1#, 0#)
        Case "<": PfOp = IIf(x < y, 1#, 0#)
        Case "<=": PfOp = IIf(x <= y, 1#, 0#)
        Case ">": PfOp = IIf(x > y, 1#, 0#)
        Case ">=": PfOp = IIf(x >= y, 1#, 0#)
        Case "min": PfOp = IIf(x < y, x, y)
        Case "max": PfOp = IIf(x > y, x, y)
        Case "rhu": PfOp = IIf(x < 0, -Int(-x * y + 0.5), Int(x * y + 0.5)) / y
        Case "flr": PfOp = Int(x * y) / y
        Case "cel": PfOp = -Int(-(x * y)) / y
    End Select
End Function

Function PfAdd(a As Variant, b As Variant) As Variant
    PfAdd = PfBc(a, b, "+")
End Function
Function PfSub(a As Variant, b As Variant) As Variant
    PfSub = PfBc(a, b, "-")
End Function
Function PfMul(a As Variant, b As Variant) As Variant
    PfMul = PfBc(a, b, "*")
End Function
Function PfDiv(a As Variant, b As Variant) As Variant
    PfDiv = PfBc(a, b, "/")
End Function
Function PfPow(a As Variant, b As Variant) As Variant
    PfPow = PfBc(a, b, "^")
End Function
Function PfEq(a As Variant, b As Variant) As Variant
    PfEq = PfBc(a, b, "=")
End Function
Function PfNe(a As Variant, b As Variant) As Variant
    PfNe = PfBc(a, b, "<>")
End Function
Function PfLt(a As Variant, b As Variant) As Variant
    PfLt = PfBc(a, b, "<")
End Function
Function PfLe(a As Variant, b As Variant) As Variant
    PfLe = PfBc(a, b, "<=")
End Function
Function PfGt(a As Variant, b As Variant) As Variant
    PfGt = PfBc(a, b, ">")
End Function
Function PfGe(a As Variant, b As Variant) As Variant
    PfGe = PfBc(a, b, ">=")
End Function
Function PfMin2(a As Variant, b As Variant) As Variant
    PfMin2 = PfBc(a, b, "min")
End Function
Function PfMax2(a As Variant, b As Variant) As Variant
    PfMax2 = PfBc(a, b, "max")
End Function

Function PfNeg(a As Variant) As Variant
    PfNeg = PfBc(0#, a, "-")
End Function

Function PfSum(s As Variant) As Variant
    If Not IsArray(s) Then PfSum = s: Exit Function
    Dim i As Long, acc As Double
    acc = 0
    For i = LBound(s) To UBound(s): acc = acc + s(i): Next i
    PfSum = acc
End Function

Function PfCumSum(s As Variant) As Variant
    Dim i As Long, acc As Double, outv() As Variant
    ReDim outv(LBound(s) To UBound(s))
    acc = 0
    For i = LBound(s) To UBound(s): acc = acc + s(i): outv(i) = acc: Next i
    PfCumSum = outv
End Function

Function PfShift(s As Variant, k As Variant) As Variant
    Dim i As Long, outv() As Variant
    ReDim outv(LBound(s) To UBound(s))
    For i = LBound(s) To UBound(s)
        If i - k >= LBound(s) And i - k <= UBound(s) Then outv(i) = s(i - k) Else outv(i) = 0
    Next i
    PfShift = outv
End Function

Function PfRoundHU(x As Variant, d As Variant) As Variant
    PfRoundHU = PfBc(x, 10 ^ d, "rhu")
End Function
' 반올림(half-up)·절사·올림은 자릿수 스칼라 전제
Function PfFloorD(x As Variant, d As Variant) As Variant
    PfFloorD = PfBc(x, 10 ^ d, "flr")
End Function
Function PfCeilD(x As Variant, d As Variant) As Variant
    PfCeilD = PfBc(x, 10 ^ d, "cel")
End Function

Function PfIf(c As Variant, a As Variant, b As Variant) As Variant
    Dim i As Long, outv() As Variant
    If Not IsArray(c) And Not IsArray(a) And Not IsArray(b) Then
        PfIf = IIf(c <> 0, a, b): Exit Function
    End If
    Dim ref As Variant
    If IsArray(c) Then ref = c ElseIf IsArray(a) Then ref = a Else ref = b
    ReDim outv(LBound(ref) To UBound(ref))
    For i = LBound(ref) To UBound(ref)
        outv(i) = IIf(PfAt(c, i) <> 0, PfAt(a, i), PfAt(b, i))
    Next i
    PfIf = outv
End Function

Private Function PfAt(v As Variant, i As Long) As Variant
    If IsArray(v) Then PfAt = v(i) Else PfAt = v
End Function
`;
