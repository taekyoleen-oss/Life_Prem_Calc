import type { ComputedAsset, ModuleResult } from "@/lib/engine/pipeline";
import type { M02Params, ModuleInstance } from "@/types/modules";

/** 모듈 폼 공통 props: StepCard가 주입한다 */
export interface ModuleFormProps {
  mod: ModuleInstance;
  result: ModuleResult;
  /** 이 모듈보다 상류에서 등록된 자산 (참조 후보) */
  upstream: ComputedAsset[];
  contract: M02Params | null;
  update: (patch: Record<string, unknown>) => void;
}
