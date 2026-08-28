/**
 * Python 대사 테스트 (설계서 §3.5, §7.1 P4).
 * 생성된 Python 스크립트를 실제 실행해 엔진값과 float64 완전 일치를 검증한다.
 * 스크립트·기대값은 output/codegen/에 기록되어 pytest(test_parity.py)로도
 * 독립 실행할 수 있다.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import expected from "@/tests/golden/expected.json";
import { computeSheet, computeWorkbook, type SheetComputation } from "@/lib/engine/pipeline";
import { buildCodegenInput, generatePython, type CodegenInput } from "@/lib/codegen/python";
import { buildStandardPipeline } from "@/lib/store/workbook";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";

const OUT_DIR = join(process.cwd(), "output", "codegen");
mkdirSync(OUT_DIR, { recursive: true });

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id, type, params, refs: [], outputs: [],
});

/** 스크립트 실행 → ##RESULT## JSON */
function runPython(file: string): Record<string, unknown> {
  const out = execFileSync("python", [file], { encoding: "utf8" });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("##RESULT## "));
  if (!line) throw new Error(`##RESULT## 라인이 없습니다:\n${out.slice(0, 500)}`);
  return JSON.parse(line.slice("##RESULT## ".length));
}

/** 엔진의 비-표 자산 전체와 정확 비교 */
function assertParity(name: string, input: CodegenInput, comp: SheetComputation): Record<string, unknown> {
  const script = generatePython(input);
  const file = join(OUT_DIR, `${name}.py`);
  writeFileSync(file, script, "utf8");
  const got = runPython(file);
  const expectedVals: Record<string, unknown> = {};
  for (const a of comp.assets) {
    if (a.def.kind === "table") continue;
    expectedVals[a.def.code] = a.value;
    expect(got[a.def.code], `${name}: ${a.def.code}`).toEqual(a.value);
  }
  return expectedVals;
}

const normalSheet = (pipeline: ModuleInstance[], name = "탭 1") => ({
  name, sheetType: "normal" as const, pipeline,
});

const allExpected: Record<string, unknown> = {};

describe("생성 Python 실행값 = 엔진값 (완전 일치)", () => {
  it("G1: 정기보험 표준 플로우", () => {
    const pipeline = buildStandardPipeline("term");
    const comp = computeSheet(pipeline);
    const input = buildCodegenInput(normalSheet(pipeline), null, comp, null);
    const vals = assertParity("g1_term", input, comp);
    expect(comp.final.p).toBe(expected.G1.P);
    allExpected["g1_term"] = vals;
  });

  it("G2+G4: 생사혼합 + 사업비 방식 A", () => {
    const pipeline = buildStandardPipeline("endowment");
    const m8 = pipeline[pipeline.length - 1];
    const m5 = pipeline.find((m) => m.type === "M05")!;
    const m4 = pipeline.find((m) => m.type === "M04")!;
    pipeline.push(
      mk("m9x", "M09", {
        method: "A", alpha: 0.03, beta: 0.002, gamma: 0.03, loadingK: 0.1,
        incomeAssetIds: (m8.params.incomeAssetIds as string[]),
        outgoAssetIds: (m8.params.outgoAssetIds as string[]),
        lAssetId: `${m5.id}:l`,
        vAssetId: `${m4.id}:v`,
      }),
    );
    const comp = computeSheet(pipeline);
    expect(comp.final.g).toBe(expected.G4.G);
    const input = buildCodegenInput(normalSheet(pipeline), null, comp, null);
    allExpected["g2_g4_endowment"] = assertParity("g2_g4_endowment", input, comp);
  });

  it("G3: 사망급부 연중 현가", () => {
    const pipeline = buildStandardPipeline("term");
    const m7d = pipeline.find((m) => m.type === "M07" && (m.params.kind as string) === "death")!;
    m7d.params = { ...m7d.params, timing: "mid" };
    const comp = computeSheet(pipeline);
    expect(comp.final.p).toBe(expected.G3.P);
    const input = buildCodegenInput(normalSheet(pipeline), null, comp, null);
    allExpected["g3_mid"] = assertParity("g3_mid", input, comp);
  });

  it("G5: 공용탭 + 진단특약 탭 (공용탭 인라인)", () => {
    const shared = {
      id: "sh", name: "공용", sheetType: "shared" as const,
      pipeline: [
        mk("c1", "M02", { age: 40, sex: "male", years: 20, payYears: 20, sumAssured: 100_000_000, roundDigit: 0, roundMode: "round" }),
        mk("c2", "M03", { libraryKeys: ["male"] }),
        mk("c3", "M04", { i: 0.025, variants: [{ key: "v", timing: "begin" }] }),
      ],
    };
    const rider = {
      id: "rider", name: "진단특약", sheetType: "normal" as const,
      pipeline: [
        mk("b1", "M03", { libraryKeys: ["diagnosis"] }),
        mk("b2", "M05", { variants: [{ key: "l", usage: "survivors", qAssetIds: ["c2:q_male", "b1:q_diagnosis"], l0: 100_000, combine: "independent" }] }),
        mk("b3", "M06", { lAssetId: "b2:l", qAssetId: "b1:q_diagnosis" }),
        mk("b4", "M07", { kind: "income", timing: "begin", seriesAssetId: "b2:l", vAssetId: "c3:v", amountMode: "S", customAmount: 0 }),
        mk("b5", "M07", { kind: "death", timing: "end", seriesAssetId: "b3:d", vAssetId: "c3:v", amountMode: "custom", customAmount: 10_000_000 }),
        mk("b6", "M08", { incomeAssetIds: ["b4:total"], outgoAssetIds: ["b5:total"], lAssetId: "b2:l" }),
      ],
    };
    const comps = computeWorkbook([shared, rider]);
    expect(comps["rider"].final.p).toBe(expected.G5.P);
    const input = buildCodegenInput(rider, shared, comps["rider"], comps["sh"]);
    allExpected["g5_rider"] = assertParity("g5_rider", input, comps["rider"]);
  });

  it("M10 수식 포함 파이프라인 대사", () => {
    const pipeline = buildStandardPipeline("term");
    pipeline.push(
      mk("f1", "M10", { expression: "l1 * v1" }),
      mk("f2", "M10", { expression: "SUM(SHIFT(f1, 1)) / n + MAX(f1) - MIN(f1, 0)" }),
    );
    const comp = computeSheet(pipeline);
    expect(comp.results["f2"].status).toBe("done");
    const input = buildCodegenInput(normalSheet(pipeline), null, comp, null);
    allExpected["m10_formula"] = assertParity("m10_formula", input, comp);
  });

  it("pytest용 기대값 기록 (output/codegen/expected.json)", () => {
    writeFileSync(join(OUT_DIR, "expected.json"), JSON.stringify(allExpected, null, 1) + "\n", "utf8");
    expect(Object.keys(allExpected).length).toBe(5);
  });
});
