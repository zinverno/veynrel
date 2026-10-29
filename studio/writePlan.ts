import { checksum } from "../consolidation/operationJournal";
import { atomIdentity, atomKey } from "../consolidation/atomizationPlan";
import { sameSavedNote } from "../consolidation/savedNote";
import { ensure, freeze, STUDIO_LIMITS } from "./recipe";
import { DOCUMENT_POLICY } from "./documentEnvelope";
import { CHECKS_VERSION } from "./preservationChecks";
import type { ReviewSession, StudioNotePort, StudioSource } from "./ports";
import type { MarkdownTargetPort } from "./markdownTarget";

export type MarkdownDestination = "new-note" | "source";
export interface StudioWriteRow {
  source: { path: string; identity: number; hash: string; created: number; modified: number; bytes: number };
  target: string; output: string; outputHash: string; action: "replace" | "append";
}
export interface StudioWritePlan {
  schemaVersion: 1; id: string; reviewId: string; destination: MarkdownDestination;
  policyVersion: typeof DOCUMENT_POLICY; checksVersion: typeof CHECKS_VERSION;
  requiresAcknowledgement: boolean; rows: readonly StudioWriteRow[];
}
export async function freshSource(notes: StudioNotePort, expected: StudioSource, destination: MarkdownDestination): Promise<StudioSource> {
  const current = await notes.read(expected.path);
  ensure(current && sameSavedNote(current, expected) && current.created === expected.created, "conflict");
  if (destination === "source") notes.writeGuard(current); else notes.readGuard(current);
  return current;
}
export async function prepareWritePlan(review: ReviewSession, sources: readonly StudioSource[], destination: MarkdownDestination,
  selected: readonly { path: string; target: string }[], notes: StudioNotePort, targets?: MarkdownTargetPort): Promise<StudioWritePlan> {
  ensure(destination === "source" || destination === "new-note", "scope");
  ensure(selected.length > 0 && selected.length <= STUDIO_LIMITS.files && new Set(selected.map(x => x.path)).size === selected.length &&
    new Set(selected.map(x => atomKey(x.target))).size === selected.length, "scope");
  const rows: StudioWriteRow[] = []; let requiresAcknowledgement = false;
  for (const choice of selected) {
    const row = review.rows.find(r => r.path === choice.path), source = sources.find(s => s.path === choice.path);
    ensure(row?.status === "generated" && row.after !== null && row.document && row.checks && source && source.content === row.before, "stale");
    await freshSource(notes, source, destination);
    let output = row.after;
    if (destination === "source") ensure(choice.target === choice.path, "target");
    else {
      ensure(targets, "target"); await targets.check(source.path, choice.target);
      output = `${targets.sourceLink(source, choice.target)}\n\n${row.document.separateBody}`;
    }
    ensure(output.length <= 80_000, "size");
    requiresAcknowledgement ||= row.checks.findings.length > 0 || row.checks.coverage === "partial" || !!row.document.proposedPrefix;
    rows.push({ source: { path: source.path, identity: atomIdentity(source.file), hash: await checksum(source.content),
      created: source.created, modified: source.modified, bytes: source.bytes }, target: choice.target, output, outputHash: await checksum(output), action: row.action });
  }
  return freeze({ schemaVersion: 1, id: crypto.randomUUID(), reviewId: review.id, destination, policyVersion: DOCUMENT_POLICY,
    checksVersion: CHECKS_VERSION, requiresAcknowledgement: destination === "source" && requiresAcknowledgement, rows });
}
