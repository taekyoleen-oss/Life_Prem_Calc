/**
 * VBA 생성 스모크 테스트: 구조 검증 + 수동 스팟 체크용 .bas 산출 (설계서 §3.5).
 * 실행값 검증은 Excel이 필요해 CI 불가 — 골든 케이스 수동 스팟 체크(v1.2 확정).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeSheet } from "@/lib/engine/pipeline";
import { buildCodegenInput } from "@/lib/codegen/python";
import { generateVba } from "@/lib/codegen/vba";
import { buildStandardPipeline } from "@/lib/store/workbook";
import type { ModuleInstance, ModuleTypeId } from "@/types/modules";

const OUT_DIR = join(process.cwd(), "output", "codegen");
mkdirSync(OUT_DIR, { recursive: true });

const mk = (id: string, type: ModuleTypeId, params: Record<string, unknown>): ModuleInstance => ({
  id, type, params, refs: [], outputs: [],
});

describe("generateVba", () => {
  it("정기보험 + M10: 결정론 .bas 생성 (동일 입력 → 동일 출력)", () => {
    const pipeline = buildStandardPipeline("term");
    pipeline.push(mk("f1", "M10", { expression: "ROUND(l1 * v1, 2)" }));
    const comp = computeSheet(pipeline);
    const input = buildCodegenInput(
      { name: "탭 1", sheetType: "normal", pipeline }, null, comp, null,
    );
    const bas = generateVba(input);
    expect(generateVba(input)).toBe(bas); // 결정론
    expect(bas).toContain("Sub PremiaFlow_Calc()");
    expect(bas).toContain("p_annual = pvout");
    expect(bas).toContain("PfRoundHU");
    expect(bas).toContain("End Sub");
    writeFileSync(join(OUT_DIR, "g1_term.bas"), bas, "utf8");
  });
});
