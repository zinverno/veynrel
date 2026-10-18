import type {BinaryLike} from "node:crypto";
import type corpus from "../tests/fixtures/consolidation-realistic-v1.json";
export type EvaluationCase = typeof corpus.cases[number];
export type Validator = (raw:string,a:string,b:string)=>unknown;
export interface Rate {numerator:number;denominator:number;value:number|null}
export interface ResponseScore {
  id:string;responseSha256:string;shapeValid:boolean;productionAccepted:boolean;productionFailure:string|null;
  relation:string|null;relationCorrect:boolean;uniqueTotal:number;uniqueLiteralCovered:string[];quoteCount:number;exactQuoteCount:number;
  falseMerge:boolean;falseConflict:boolean;abstained:boolean;abstentionRequired:boolean;actionPolicyCorrect:boolean;unsupportedActions:string[];
  semantic:null|{reviewer:string;correctClaims:number;incorrectClaims:number;uncertainClaims:number;uniqueCovered:string[]};
}
export interface EvaluationMetrics {
  responses:number;shape:Rate;productionAcceptance:Rate;relationAccuracy:Rate;uniqueLiteralRecallProxy:Rate;exactQuotePrecision:Rate;
  falseMergePairs:number;falseConflictPairs:number;justifiedAbstentionPrecision:Rate;requiredAbstentionRecall:Rate;actionPolicyAccuracy:Rate;
  unsupportedActionPairs:number;semanticReviewedPairs:number;semanticClaimPrecision:Rate;semanticUniqueRecall:Rate;
}
export function sha256(value:BinaryLike):string;
export function shapeValid(value:unknown):boolean;
export function validateCorpus(value:unknown,validate:Validator):void;
export function scoreResponse(c:EvaluationCase,raw:string,validate:Validator,adjudication?:unknown):ResponseScore;
export function summarize(rows:ResponseScore[]):EvaluationMetrics;
