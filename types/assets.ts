/** 자산(Asset): 모듈이 산출하여 이름이 부여된 계열·표·스칼라 (설계서 §1.6, §3.3) */

export type AssetKind = "series" | "scalar" | "table";

export interface AssetDef {
  /** 내부 참조용 불변 ID. 이름 변경 시에도 하류 참조가 유지된다 (§3.3) */
  id: string;
  /** 코드 식별자: 수식 빌더·생성 코드의 변수명. ASSET_CODE_RE 준수 */
  code: string;
  /** 표시명(한글 허용) */
  displayName: string;
  kind: AssetKind;
  /** 위험률 계열의 사망률 플래그 (§3.2.1). 위험률 자산에만 의미 있음 */
  isMortality?: boolean;
}

/** 자산 참조: 시트 ID + 자산 ID (§4.1). 공용탭 자산 참조 시 sheetId = 공용탭 시트 ID */
export interface AssetRef {
  sheetId: string;
  assetId: string;
}

/** 코드 식별자 규칙 (§3.3) */
export const ASSET_CODE_RE = /^[a-z][a-z0-9_]{0,29}$/;
