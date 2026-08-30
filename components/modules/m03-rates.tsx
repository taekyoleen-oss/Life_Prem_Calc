"use client";

import { useState } from "react";
import type { M03CustomColumn, M03Params } from "@/types/modules";
import { RATE_LIBRARY, normalizeRateKey, type RateTable } from "@/lib/engine/pipeline";
import { parseRateTable } from "@/lib/engine/table-io";
import { DataGrid, type GridColumn } from "@/components/grid/DataGrid";
import { Field, SelectInput } from "./fields";
import type { ModuleFormProps } from "./types";

const KEYS = ["mortality", "accident", "disability", "cancer", "cancer_surgery"] as const;

export function M03Rates({ mod, result, contract, update }: ModuleFormProps) {
  const p = mod.params as unknown as M03Params & { libraryKey?: (typeof KEYS)[number] };
  const source = p.source ?? "library";
  const selected = p.libraryKeys ?? (p.libraryKey ? [p.libraryKey] : []);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // 구버전(성별 구분) 키로 저장된 선택도 같은 담보로 보이게 정규화한다.
  const checkedFor = (key: string) => selected.some((s) => normalizeRateKey(s) === key);
  const toggleLib = (key: (typeof KEYS)[number], on: boolean) =>
    update({
      // 이미 저장된 키는 그대로 유지 — 자산 슬롯(…:q_male)이 바뀌어 하류 참조가 끊기지 않도록.
      libraryKeys: KEYS.filter((k) => (k === key ? on : checkedFor(k))).map(
        (k) => selected.find((s) => normalizeRateKey(s) === k) ?? k,
      ),
      libraryKey: undefined,
    });

  const applyText = (text: string) => {
    try {
      const parsed = parseRateTable(text);
      setParseError(null);
      setParseWarnings(parsed.warnings);
      const columns: M03CustomColumn[] = parsed.columns.map((c) => ({ ...c, selected: true }));
      update({ rawText: text, custom: { startAge: parsed.startAge, columns } });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      update({ rawText: text });
    }
  };

  const patchColumn = (idx: number, patch: Partial<M03CustomColumn>) => {
    if (!p.custom) return;
    update({
      custom: {
        ...p.custom,
        columns: p.custom.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      },
    });
  };

  const tables = result.assets.filter((a) => a.def.kind === "table");
  const columns: GridColumn[] =
    tables.length > 0
      ? [
          {
            label: "연령",
            values: (tables[0].value as RateTable).values.map(
              (_, i) => (tables[0].value as RateTable).startAge + i,
            ),
          },
          ...tables.map((a) => ({
            label: a.def.code,
            values: (a.value as RateTable).values,
            digits: 6,
          })),
        ]
      : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="위험률 출처">
          <SelectInput
            value={source}
            onChange={(v) => update({ source: v })}
            options={[
              { value: "library", label: "공용 라이브러리 (더미 위험률 표 v1)" },
              { value: "custom", label: "직접 입력 — 붙여넣기·CSV 파일" },
            ]}
          />
        </Field>
      </div>

      {source === "library" ? (
        <Field
          label="사용할 담보 선택 (다중)"
          hint="필요한 담보의 q 계열만 골라 변수로 등록합니다. 성별 구분은 없습니다 — 성별은 계약조건(M02)에서 지정합니다."
        >
          <div className="flex flex-col gap-1.5 pt-1">
            {KEYS.map((key) => {
              const lib = RATE_LIBRARY[key];
              return (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checkedFor(key)}
                    onChange={(e) => toggleLib(key, e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="font-medium">{lib.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      lib.isMortality ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {lib.isMortality ? "사망률" : "발생률"}
                  </span>
                </label>
              );
            })}
          </div>
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <Field
            label="표 붙여넣기 (엑셀 복사 → 붙여넣기, 첫 열 = 연령)"
            hint="탭·쉼표 구분, 헤더 행 자동 감지. 검증: 연령 연속·q ∈ [0,1], 결측은 0 처리"
          >
            <textarea
              value={p.rawText ?? ""}
              onChange={(e) => applyText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={"연령\t사망률\t해지율\n40\t0.00207\t0.01\n41\t0.00221\t0.01\n…"}
              className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <div className="flex items-center gap-2 text-sm">
            <label className="cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary">
              CSV 파일 불러오기
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  f.text().then(applyText);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">XLSX는 P5(내보내기와 함께) 지원 예정</span>
          </div>
          {parseError && (
            <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#991b1b]">{parseError}</p>
          )}
          {parseWarnings.map((w, i) => (
            <p key={i} className="rounded-md bg-[#fef3c7] px-3 py-2 text-sm text-[#92400e]">{w}</p>
          ))}
          {p.custom && (
            <Field label="사용할 열 선택 · 사망률 여부">
              <div className="flex flex-col gap-1.5 pt-1">
                {p.custom.columns.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => patchColumn(i, { selected: e.target.checked })}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="font-medium">{c.name}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={c.isMortality}
                        onChange={(e) => patchColumn(i, { isMortality: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                      />
                      사망률
                    </label>
                  </div>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      {columns.length > 0 && (
        <div>
          {contract && (
            <p className="mb-1 text-xs text-muted-foreground">
              계약 적용 구간: {contract.age}세 ~ {contract.age + contract.years - 1}세
            </p>
          )}
          <DataGrid columns={columns} maxHeightClass="max-h-56" />
        </div>
      )}
    </div>
  );
}
