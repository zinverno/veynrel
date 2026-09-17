import type { AnalyzerDiagnostic } from "../types";
import { compareStrings } from "../../domain/validation";

export const MAX_LOCAL_DIAGNOSTICS = 100;
const MESSAGES = {
  "invalid-note": "A Markdown note could not be represented by the Health path contract.",
  "content-unavailable": "Note content could not be read.",
  "links-unavailable": "Note link metadata is unavailable or invalid.",
  "note-changed": "The note changed during capture; its content and links were excluded.",
  "partial-note-list": "The note list is incomplete.",
  "partial-content": "Content coverage is incomplete.",
  "partial-links": "Link coverage is incomplete.",
  "analyzer-failed": "The analyzer failed; its results cannot establish absence.",
} as const;

export function diagnostic(code: keyof typeof MESSAGES, path?: string): AnalyzerDiagnostic {
  return path === undefined ? { code, message: MESSAGES[code] } : { code, path, message: MESSAGES[code] };
}

export function boundedDiagnostics(items: readonly AnalyzerDiagnostic[]): { diagnostics: AnalyzerDiagnostic[]; diagnosticsTruncated: number } {
  const sorted = [...items].sort((a, b) => compareStrings(a.path ?? "", b.path ?? "") || compareStrings(a.code, b.code) || compareStrings(a.message, b.message));
  return { diagnostics: sorted.slice(0, MAX_LOCAL_DIAGNOSTICS), diagnosticsTruncated: Math.max(0, sorted.length - MAX_LOCAL_DIAGNOSTICS) };
}
