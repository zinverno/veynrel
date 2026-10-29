import { parseYaml } from "obsidian";
import { ensure, STUDIO_LIMITS, StudioError } from "./recipe";

export const DOCUMENT_POLICY = 1 as const;
export interface DocumentEnvelope { prefix: string; body: string; bodyStart: number; properties: boolean }
export interface PreservedDocument {
  policyVersion: typeof DOCUMENT_POLICY;
  sourcePrefix: string; proposedPrefix: string; properties: boolean;
  body: string; separateBody: string; after: string;
}

/** UTF-8/string policy: exact delimiters, no YAML serialization. BOM is protected explicitly. */
export function documentEnvelope(raw: string): DocumentEnvelope {
  ensure(raw.length <= STUDIO_LIMITS.input + STUDIO_LIMITS.output + 2, "size");
  const bom = raw.startsWith("\uFEFF") ? 1 : 0, text = raw.slice(bom);
  const opening = /^---\r?\n/u.exec(text);
  if (!opening) {
    // A near-frontmatter prefix is unsupported rather than silently treated as ordinary text.
    ensure(!/^\s*(?:---|\.\.\.)(?:\s|$)/u.test(text), "frontmatter");
    return { prefix: raw.slice(0, bom), body: text, bodyStart: bom, properties: false };
  }
  ensure(!/\r(?!\n)/u.test(text), "frontmatter");
  const lines = /([^\r\n]*)(\r?\n|$)/gu; lines.lastIndex = opening[0].length;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) && match[0]) {
    if (match[1] === "---") {
      const yaml = text.slice(opening[0].length, match.index);
      try {
        const value: unknown = parseYaml(yaml);
        ensure(value == null || typeof value === "object" && !Array.isArray(value), "frontmatter");
      } catch { throw new StudioError("frontmatter"); }
      const bodyStart = bom + match.index + match[0].length;
      return { prefix: raw.slice(0, bodyStart), body: raw.slice(bodyStart), bodyStart, properties: true };
    }
    ensure(!/^(?:---|\.\.\.)\s*$/u.test(match[1]), "frontmatter");
  }
  throw new StudioError("frontmatter");
}

export function preserveDocument(source: string, response: string, action: "replace" | "append"): PreservedDocument {
  const before = documentEnvelope(source), proposed = documentEnvelope(response);
  ensure(!!proposed.body.trim(), "response");
  const separator = before.properties && !before.prefix.endsWith("\n") ? "\n" : "";
  return { policyVersion: DOCUMENT_POLICY, sourcePrefix: before.prefix, proposedPrefix: proposed.prefix,
    properties: before.properties, body: proposed.body,
    separateBody: action === "append" ? `${before.body}\n\n${proposed.body}` : proposed.body,
    after: action === "append" ? `${source}\n\n${proposed.body}` : `${before.prefix}${separator}${proposed.body}` };
}

/** Rechecked immediately before existing-note writes, including callers outside the view. */
export function assertSourceProperties(source: string, after: string, action: "replace" | "append"): void {
  const before = documentEnvelope(source), next = documentEnvelope(after);
  ensure(before.properties === next.properties && after.startsWith(before.prefix), "frontmatter");
  ensure(next.prefix === before.prefix || before.properties && !before.prefix.endsWith("\n") && next.prefix === `${before.prefix}\n`, "frontmatter");
  if (action === "append") ensure(after.startsWith(`${source}\n\n`), "frontmatter");
}
