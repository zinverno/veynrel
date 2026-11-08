import type { RecallCardCandidate } from "./card";

export type RecallKind = "study" | "vocabulary";
export interface VocabularyMetadata {
  readonly language: string;
  readonly translationLanguage: string;
  readonly direction: "forward" | "reverse";
}
export interface RecallScope {
  readonly kind?: RecallKind;
  /** Empty string selects untagged cards. */
  readonly tag?: string;
  readonly language?: string;
  readonly path?: string;
}

export function isStudyTag(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && /^flashcards(?:\/[\p{L}\p{N}_-]+)*$/iu.test(value);
}
export function studyTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (!isStudyTag(value) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function isRecallLanguage(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu.test(value) && value.length <= 40;
}
export function matchesRecallScope(card: RecallCardCandidate, scope: RecallScope = {}): boolean {
  const tag = scope.tag?.toLowerCase();
  return (!scope.kind || card.kind === scope.kind) && (!scope.path || card.path === scope.path) &&
    (!scope.language || card.vocabulary?.language.toLowerCase() === scope.language.toLowerCase()) &&
    (tag === undefined || (tag === "" ? card.studyTags.length === 0 : card.studyTags.some(value =>
      value.toLowerCase() === tag || value.toLowerCase().startsWith(`${tag}/`))));
}
