import type { RecallDiagnostic, RecallDiagnosticCode } from "./domain/card";

export const MAX_RECALL_DIAGNOSTICS = 100;

/** Bound while collecting, not after allocating one entry per malformed line. */
export class RecallDiagnostics {
  private items: RecallDiagnostic[] = [];
  private truncated = 0;

  add(code: RecallDiagnosticCode, path?: string, line?: number): void {
    if (this.items.length < MAX_RECALL_DIAGNOSTICS) this.items.push(Object.freeze(path === undefined ? { code } : { code, path, ...(line === undefined ? {} : { line }) }));
    else this.truncated++;
  }

  merge(result: { diagnostics: readonly RecallDiagnostic[]; diagnosticsTruncated: number }): void {
    for (const item of result.diagnostics) this.add(item.code, item.path, item.line);
    this.truncated += result.diagnosticsTruncated;
  }

  result(): { diagnostics: readonly RecallDiagnostic[]; diagnosticsTruncated: number } {
    return { diagnostics: Object.freeze([...this.items]), diagnosticsTruncated: this.truncated };
  }
}
