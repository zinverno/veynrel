import { isRecord, isVaultPath } from "../health/domain/validation";
import type { FileSummary } from "../deepAudit";

export type DeepQualitySummary = Pick<FileSummary, "path" | "quality">;

/** Model JSON is untrusted. Duplicates invalidate that path, including a valid first entry. */
export function validateDeepMapSummaries(items: unknown[], paths: readonly string[]): { summaries: DeepQualitySummary[]; complete: boolean } {
  const expected = new Set(paths);
  const seen = new Set<string>();
  const valid = new Map<string, DeepQualitySummary>();
  let complete = true;
  for (const item of items) {
    if (!isRecord(item) || !isVaultPath(item.path) || !/\.md$/iu.test(item.path) || !expected.has(item.path)) {
      complete = false; continue;
    }
    if (seen.has(item.path)) { valid.delete(item.path); complete = false; continue; }
    seen.add(item.path);
    if (item.quality !== "draft" && item.quality !== "developed" && item.quality !== "polished") { complete = false; continue; }
    valid.set(item.path, { path: item.path, quality: item.quality });
  }
  return { summaries: [...valid.values()], complete: complete && valid.size === expected.size };
}
