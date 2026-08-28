/**
 * 역할별 기능 게이트 (설계서 §2.4).
 * v1.0은 산출 기능 전체를 게스트에게 개방하고, 클라우드 관련 기능만 게이트한다.
 * 게스트 제한 정책이 확정되면(v1.x) 이 목록만 수정한다 — 코드 수정 불필요 구조.
 */
export type Role = "guest" | "user" | "admin";

export type FeatureKey = "cloudSave" | "personalLibrary" | "publicLibraryEdit";

const ALLOW: Record<Role, readonly FeatureKey[]> = {
  guest: [],
  user: ["cloudSave", "personalLibrary"],
  admin: ["cloudSave", "personalLibrary", "publicLibraryEdit"],
};

export function can(role: Role, feature: FeatureKey): boolean {
  return ALLOW[role].includes(feature);
}
