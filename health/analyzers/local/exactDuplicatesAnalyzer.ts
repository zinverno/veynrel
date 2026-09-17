import type { FindingCandidate } from "../../domain/finding";
import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { checkpoint } from "./cancellation";
import { analyzerResult, localCandidate, representedPaths } from "./candidates";
import { diagnostic } from "./diagnostics";
import { duplicateBucketKey, exactContentSignature, meaningfulCharacterCount, NEAR_EMPTY_MEANINGFUL_CHARACTERS, normalizeExactContent, noteBody } from "./content";
import { contentCoverageComplete } from "./localNoteGraph";

const ID = "exact-duplicates";
const VERSION = "1";
export const exactDuplicatesAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ snapshot }, signal) {
    // Inner string-key maps verify equality even when hash buckets collide, without pairwise scans.
    const buckets = new Map<string, Map<string, string[]>>();
    let processed = 0;
    for (const note of snapshot.notes) {
      await checkpoint(signal, processed++);
      if (!note.contentAvailable || note.content === undefined) continue;
      const content = normalizeExactContent(note.content);
      if (meaningfulCharacterCount(noteBody(content)) < NEAR_EMPTY_MEANINGFUL_CHARACTERS) continue;
      const key = duplicateBucketKey(content);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = new Map(); buckets.set(key, bucket); }
      const paths = bucket.get(content);
      if (paths) paths.push(note.path);
      else bucket.set(content, [note.path]);
    }
    const candidates: FindingCandidate[] = [];
    for (const bucket of buckets.values()) {
      for (const [content, members] of bucket) {
        await checkpoint(signal, processed++);
        if (members.length < 2) continue;
        const paths = representedPaths(members);
        candidates.push(localCandidate({ analyzerId: ID, dimension: "connections", type: "exact-duplicate-group", impact: "review",
          title: "Notes with identical content", explanation: "These notes share exact normalized Markdown, including frontmatter. The path list may show representatives of a larger group.",
          notePaths: paths, evidence: [{ kind: "member-count", value: members.length }, { kind: "represented-path-count", value: paths.length }],
          actions: [{ kind: "compare-notes", path: paths[0], relatedPath: paths[1] }],
        }, { paths: [], key: exactContentSignature(content) }));
      }
    }
    const complete = contentCoverageComplete(snapshot);
    return analyzerResult(ID, VERSION, candidates, complete, complete ? [] : [diagnostic("partial-content")]);
  },
};
