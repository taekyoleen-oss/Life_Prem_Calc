/** 표시 자릿수 관리 (설계서 §1.5): 내부 계산은 전체 자릿수, 표시만 반올림한다. */

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 소수 이율 → "2.5%" (불필요한 0 제거) */
export function fmtPct(x: number, maxDigits = 4): string {
  return `${(x * 100).toLocaleString("ko-KR", { maximumFractionDigits: maxDigits })}%`;
}
