import type { FindingAction } from "./finding";

export interface Recommendation {
  id: string;
  findingId?: string;
  title: string;
  explanation: string;
  action: FindingAction;
}
