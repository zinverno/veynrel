import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { buildChangePlan, ChangePlanError } from "./changePlan";
import type { ChangePlan, PlanFailure, PlanPair, PlanRange, PlanReference } from "./changePlan";
import type { RelationshipAnalysis } from "./relationshipSession";

export interface MultiFileChoice {
  operation: "add_reciprocal_links";
  selections: readonly [PlanRange | null, PlanRange | null];
  confirmed: readonly [boolean, boolean];
}
/** Serializable evidence, not authority to write. `before` below is the complete source snapshot. */
export interface PlannedFileModification {
  kind: "modify";
  path: string;
  identity: { created: number; modified: number; bytes: number; contentHash: string };
  before: string;
  after: string;
  edits: readonly [NonNullable<ChangePlan["edit"]>];
  userSelection: { range: PlanRange; confirmed: true };
  links: { added: string; targetPath: string; preserved: PlanReference[] };
}
/** v1 admits only two modifications; future operation kinds need their own schema and validation. */
export interface MultiFilePlan {
  version: 1;
  operation: "add_reciprocal_links";
  participants: readonly [string, string];
  files: readonly [PlannedFileModification, PlannedFileModification];
  dependencies: readonly [{ from: string; to: string; linktext: string }, { from: string; to: string; linktext: string }];
  provenance: Omit<ChangePlan["provenance"], "userOperation"> & { userOperation: "add_reciprocal_links" };
  modelLimitations: string[];
  limitations: readonly ["saved_sources_only", "metadata_may_lag", "semantic_preservation_unverified", "dependencies_not_scanned", "multi_file_apply_and_undo_unavailable"];
}
export class MultiFilePlanError extends ChangePlanError {
  constructor(reason: PlanFailure, readonly side?: 0 | 1) { super(reason); }
}

/** Both directed links use the existing paragraph/link validator; a failure returns no partial plan. */
export function buildMultiFilePlan(analysis: RelationshipAnalysis, pair: PlanPair, choice: MultiFileChoice,
  linktexts: readonly [string, string]): MultiFilePlan {
  if (choice.operation !== "add_reciprocal_links") throw new MultiFilePlanError("recommendation");
  if (pair.length !== 2 || pair[0].path === pair[1].path || pair[0].file === pair[1].file) throw new MultiFilePlanError("source");
  const plans = ([0, 1] as const).map(side => {
    const note = pair[side];
    if (!isCanonicalMarkdownPath(note.path) || note.path.split("/").some(part => part.startsWith(".")) ||
      ![note.created, note.modified, note.bytes].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
      note.file.path !== note.path || note.file.stat.ctime !== note.created || note.file.stat.mtime !== note.modified || note.file.stat.size !== note.bytes) {
      throw new MultiFilePlanError("source", side);
    }
    try {
      return buildChangePlan(analysis, pair, { operation: "add_link", source: side,
        selection: choice.selections[side], confirmed: choice.confirmed[side] === true }, linktexts[side === 0 ? 1 : 0]);
    } catch (error) {
      if (error instanceof ChangePlanError) throw new MultiFilePlanError(error.reason, side);
      throw error;
    }
  });
  const file = (side: 0 | 1): PlannedFileModification => {
    const plan = plans[side];
    return { kind: "modify", path: plan.sourcePath,
      identity: { created: pair[side].created!, modified: plan.source.modified, bytes: plan.source.bytes, contentHash: plan.sourceHash },
      before: plan.before, after: plan.after, edits: [{ ...plan.edit! }], userSelection: { range: { ...plan.selection! }, confirmed: true },
      links: { added: plan.affectedLinks.added!, targetPath: plan.targetPath, preserved: plan.affectedLinks.preserved.map(ref => ({ ...ref })) } };
  };
  return { version: 1, operation: "add_reciprocal_links", participants: [pair[0].path, pair[1].path], files: [file(0), file(1)],
    dependencies: [{ from: pair[0].path, to: pair[1].path, linktext: linktexts[1] }, { from: pair[1].path, to: pair[0].path, linktext: linktexts[0] }],
    provenance: { ...plans[0].provenance, userOperation: choice.operation,
      recommendation: { ...plans[0].provenance.recommendation, evidence: [...plans[0].provenance.recommendation.evidence] } },
    modelLimitations: [...plans[0].modelLimitations],
    limitations: ["saved_sources_only", "metadata_may_lag", "semantic_preservation_unverified", "dependencies_not_scanned", "multi_file_apply_and_undo_unavailable"] };
}
