import { t } from "../../i18n";
import type { Finding } from "../domain/finding";

export interface FindingPresentation { title: string; explanation: string }

const localTypes = new Set([
  "broken-link", "orphan-note", "no-incoming-links", "no-outgoing-links", "empty-note", "near-empty-note",
  "exact-duplicate-group", "duplicate-title-group", "isolated-graph-component",
]);

/** Localize presentation only. Persisted text and every identity/action field stay untouched. */
export function findingPresentation(finding: Finding): FindingPresentation {
  return finding.source === "local" && localTypes.has(finding.type)
    ? { title: t(`@health.finding.${finding.type}.title`), explanation: t(`@health.finding.${finding.type}.explanation`) }
    : { title: finding.title, explanation: finding.explanation };
}
