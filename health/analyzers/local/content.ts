import { stableHash } from "../../../utils/stableHash";

export const NEAR_EMPTY_MEANINGFUL_CHARACTERS = 32;

/** Exact comparison retains frontmatter, case, formatting and all internal whitespace. */
export function normalizeExactContent(content: string): string {
  return content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
}

/** Only a leading, closed --- frontmatter block is removed; malformed blocks remain body. */
export function noteBody(content: string): string {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const start = /^---[\t ]*\n/u.exec(normalized);
  if (!start) return normalized;
  const rest = normalized.slice(start[0].length);
  const end = /(?:^|\n)---[\t ]*(?:\n|$)/u.exec(rest);
  return end ? rest.slice(end.index + end[0].length) : normalized;
}

export function meaningfulCharacterCount(content: string): number {
  let count = 0;
  for (const character of content) if (/[\p{L}\p{N}]/u.test(character)) count++;
  return count;
}

export function duplicateBucketKey(content: string): string {
  return stableHash(content);
}

/** Bounded identity for a content pattern, independent of the current member paths. */
export function exactContentSignature(content: string): string {
  return `v1:${content.length}:${stableHash(content)}:${stableHash(`veynrel-duplicate-v1:${content}`)}`;
}
