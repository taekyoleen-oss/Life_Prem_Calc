"use client";

import { useRef } from "react";
import type { M10Params } from "@/types/modules";
import { fmt } from "@/lib/format";
import { DataGrid } from "@/components/grid/DataGrid";
import { Field } from "./fields";
import type { ModuleFormProps } from "./types";

const FUNCTIONS = ["SUM(", "CUMSUM(", "SHIFT(", "ROUND(", "FLOOR(", "CEIL(", "MIN(", "MAX(", "IF(", "POW("];
const OPERATORS = ["+", "-", "*", "/", "^", "(", ")", ","];

/**
 * M10 사용자 수식 — 텍스트 모드 + 클릭 팔레트 (§3.4).
 * 팔레트 칩을 누르면 커서 위치에 토큰이 삽입된다.
 * (드래그 블록 모드는 v1.x — 텍스트·팔레트가 동일 AST를 공유)
 */
export function M10Formula({ mod, result, upstream, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M10Params;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    const el = inputRef.current;
    const cur = p.expression ?? "";
    if (!el) {
      update({ expression: cur + token });
      return;
    }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    update({ expression: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const refChips = upstream.filter((a) => a.def.kind !== "table" || contract);
  const value = result.assets[0]?.value;

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="수식 (엑셀식 텍스트 모드)"
        hint="상류 자산 코드와 경과기간 t를 변수로 사용합니다. 예: SUM(l1 * v1) / l1[?]… 대신 SHIFT·CUMSUM 등 함수를 쓰세요."
      >
        <textarea
          ref={inputRef}
          value={p.expression ?? ""}
          onChange={(e) => update({ expression: e.target.value })}
          rows={2}
          spellCheck={false}
          placeholder="예: SUM(SHIFT(l1, 1) * v1) / n"
          className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">자산 팔레트 (클릭해서 삽입)</p>
        <div className="flex flex-wrap gap-1">
          {refChips.map((a) => (
            <button
              key={a.def.id}
              type="button"
              onClick={() => insert(a.def.code)}
              title={a.def.displayName}
              className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs hover:border-[var(--primary)] hover:text-primary"
            >
              {a.def.code}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insert("t")}
            className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs hover:border-[var(--primary)] hover:text-primary"
          >
            t
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {FUNCTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => insert(f)}
              className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-xs hover:border-[var(--primary)] hover:text-primary"
            >
              {f.slice(0, -1)}
            </button>
          ))}
          {OPERATORS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => insert(` ${o} `)}
              className="rounded border border-border bg-secondary/50 px-2 py-0.5 font-mono text-xs hover:border-[var(--primary)] hover:text-primary"
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {typeof value === "number" && (
        <p className="text-sm">
          결과&nbsp;<span className="font-semibold tabular">{fmt(value, 6)}</span>
          <span className="ml-1 text-xs text-muted-foreground">(스칼라)</span>
        </p>
      )}
      {Array.isArray(value) && contract && (
        <DataGrid
          columns={[
            { label: "t", values: value.map((_, t) => t) },
            { label: "연령", values: value.map((_, t) => contract.age + t) },
            { label: result.assets[0].def.code, values: value, digits: 6 },
          ]}
        />
      )}
    </div>
  );
}
