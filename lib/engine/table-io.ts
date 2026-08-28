/**
 * 위험률 표 입출력 (설계서 §3.2 M03, table-io).
 * 클립보드 붙여넣기(TSV)·CSV 텍스트를 결정론적으로 파싱한다 — LLM 미사용.
 * 검증(§3.9): 연령 연속성, q ∈ [0,1]. 결측값은 0으로 처리하고 경고를 남긴다.
 */

export interface ParsedColumn {
  name: string;
  /** 사망률 여부 초기 제안 (열 이름에 '사망' 포함 시 true) */
  isMortality: boolean;
  values: number[];
}

export interface ParsedRateTable {
  startAge: number;
  columns: ParsedColumn[];
  warnings: string[];
}

function detectDelimiter(line: string): RegExp {
  if (line.includes("\t")) return /\t/;
  if (line.includes(",")) return /,/;
  if (line.includes(";")) return /;/;
  return /\s+/;
}

export function parseRateTable(text: string): ParsedRateTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("입력된 내용이 없습니다.");

  const delim = detectDelimiter(lines[0]);
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim()));

  // 헤더 감지: 첫 행의 두 번째 이후 셀 중 숫자가 아닌 것이 있으면 헤더
  const first = rows[0];
  const hasHeader = first.slice(1).some((c) => c !== "" && Number.isNaN(Number(c)));
  const header = hasHeader ? first : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) throw new Error("데이터 행이 없습니다.");

  const colCount = Math.max(...dataRows.map((r) => r.length));
  if (colCount < 2) throw new Error("연령 열과 위험률 열이 최소 1개씩 필요합니다.");

  const warnings: string[] = [];
  let missing = 0;

  // 첫 열 = 연령: 오름차순 연속 정수
  const ages = dataRows.map((r, i) => {
    const a = Number(r[0]);
    if (!Number.isInteger(a)) throw new Error(`${i + 1}번째 데이터 행의 연령 '${r[0]}'이(가) 정수가 아닙니다.`);
    return a;
  });
  for (let i = 1; i < ages.length; i++) {
    if (ages[i] !== ages[i - 1] + 1) {
      throw new Error(`연령이 연속하지 않습니다: ${ages[i - 1]} 다음이 ${ages[i]} (${i + 1}번째 데이터 행).`);
    }
  }

  const columns: ParsedColumn[] = [];
  for (let c = 1; c < colCount; c++) {
    const rawName = header?.[c]?.trim();
    const name = rawName && rawName.length > 0 ? rawName : `열${c}`;
    const values = dataRows.map((r, i) => {
      const cell = r[c] ?? "";
      if (cell === "") {
        missing++;
        return 0;
      }
      const v = Number(cell);
      if (Number.isNaN(v)) throw new Error(`'${name}' 열 ${i + 1}번째 데이터 행의 값 '${cell}'을(를) 숫자로 해석할 수 없습니다.`);
      if (v < 0 || v > 1) throw new Error(`'${name}' 열 연령 ${ages[i]}의 값 ${cell}이(가) [0, 1] 범위를 벗어납니다.`);
      return v;
    });
    columns.push({ name, isMortality: name.includes("사망"), values });
  }

  if (missing > 0) warnings.push(`결측값 ${missing}건을 0으로 처리했습니다.`);
  return { startAge: ages[0], columns, warnings };
}
