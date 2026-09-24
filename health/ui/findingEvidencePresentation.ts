import { t } from "../../i18n";
import type { Finding } from "../domain/finding";

export interface FindingEvidencePresentation {
  facts: string[];
  affectedCount: number;
  representativeSummary?: string;
}

/** Explicit presentation allowlist. Evidence never becomes markup, navigation or actions. */
export function findingEvidencePresentation(finding: Finding): FindingEvidencePresentation {
  const facts: string[] = [];
  const value = (kind: string): string | number | boolean | undefined => finding.evidence.find((item) => item.kind === kind)?.value;
  const count = (kind: string): number | undefined => {
    const n = value(kind);
    return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  };
  const numberFact = (kind: string): void => {
    const n = count(kind);
    if (n !== undefined) facts.push(t(`@findings.evidence.${kind}`, { n }));
  };
  const textFact = (kind: "target" | "basename"): void => {
    const text = value(kind);
    if (typeof text !== "string") return;
    const length = count(`${kind}-length`);
    const truncated = value(`${kind}-truncated`) === true || (length !== undefined && length > text.length);
    facts.push(t(`@findings.evidence.${kind}`, { value: text + (truncated ? "…" : "") }));
  };
  let affectedCount = finding.notePaths.length;
  if (finding.source === "deep-ai" && finding.type === "knowledge-draft" && value("deep-quality") === "draft") {
    facts.push(t("@findings.evidence.deep-draft"));
  }
  if (finding.source === "semantic" && finding.type === "semantic-duplicate") {
    const score = value("similarity-score");
    if (typeof score === "number" && Number.isFinite(score) && score >= -1 && score <= 1) {
      facts.push(t("@findings.evidence.similarity-score", { n: Math.round(score * 100) }));
    }
  }
  if (finding.source === "local") {
    switch (finding.type) {
      case "broken-link":
        // source-path is already presented as an affected-note navigation control.
        textFact("target"); numberFact("occurrence-count"); break;
      case "orphan-note":
      case "no-incoming-links":
      case "no-outgoing-links":
        numberFact("incoming-count");
        if (value("incoming-count-complete") === false) facts.push(t("@findings.evidence.incoming-incomplete"));
        numberFact("outgoing-count"); break;
      case "empty-note":
      case "near-empty-note":
        numberFact("meaningful-character-count"); break;
      case "exact-duplicate-group":
      case "duplicate-title-group": {
        const members = count("member-count");
        if (members !== undefined) {
          affectedCount = Math.max(affectedCount, members);
          facts.push(t(`@findings.evidence.${finding.type}`, { n: members }));
        }
        if (finding.type === "duplicate-title-group") textFact("basename");
        break;
      }
      case "isolated-graph-component": {
        const members = count("component-size");
        if (members !== undefined) affectedCount = Math.max(affectedCount, members);
        numberFact("component-size"); numberFact("primary-component-size"); break;
      }
    }
  }
  return { facts, affectedCount,
    // Use the paths actually available, never promise more navigable paths than stored.
    representativeSummary: affectedCount > finding.notePaths.length
      ? t("@findings.representatives", { n: finding.notePaths.length }) : undefined };
}
