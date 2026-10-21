import type {EvaluationMetrics,ResponseScore} from "./consolidation-evaluation-metrics.mjs";
export interface EvaluationReport {
  version:number;kind:string;profile:string;corpusSha256:string;promptSha256:string;annotation:unknown;inputGated:string[];
  missingEligible:string[];metrics:EvaluationMetrics;rows:ResponseScore[];limitations:string[];
}
export function inputs():Promise<{corpusSha256:string;promptSha256:string;
  api:{relationshipPrompt(language:"en"|"ru"):string};requests:Array<{id:string;input:string;tooLarge:boolean}>}>;
export function evaluate(responseFile?:string|null,adjudicationFile?:string|null):Promise<EvaluationReport>;
export function compare(files:string[]):Promise<{kind:string;coverageComparable:boolean;profiles:EvaluationReport[];limits:string}>;
