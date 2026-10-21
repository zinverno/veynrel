import { RELATIONSHIP_WIRE_SCHEMA, RelationshipError, validateRelationshipResponse } from "./relationshipContract";
import type { RelationshipResult } from "./relationshipContract";
import type { EvidenceDiagnostic } from "./relationshipDiagnostics";
import { sameSavedNote } from "./savedNote";
import type { RelationshipPair } from "./relationshipSession";

export const EVIDENCE_LIMITS = { fragmentsPerSide: 128, candidatesPerSide: 256, fragmentCharacters: 1200, seedCharacters: 600 } as const;
export interface EvidenceFragment { readonly id: string; readonly side: "A" | "B"; readonly start: number; readonly end: number; readonly text: string }
export interface EvidenceCatalog {
  readonly pair: RelationshipPair;
  readonly fragments: readonly EvidenceFragment[];
  readonly uncoveredCharacters: readonly number[];
}

// All offsets are native JS UTF-16. Never split a surrogate pair or CRLF.
function boundary(source: string, at: number): number {
  return at > 0 && ((source.charCodeAt(at) >= 0xdc00 && source.charCodeAt(at) <= 0xdfff && source.charCodeAt(at - 1) >= 0xd800 && source.charCodeAt(at - 1) <= 0xdbff)
    || (source[at] === "\n" && source[at - 1] === "\r")) ? at - 1 : at;
}
function unique(source: string, start: number, end: number): boolean {
  const text = source.slice(start, end), at = source.indexOf(text);
  return text.trim().length > 0 && at === start && source.indexOf(text, at + 1) === -1;
}

/** Catalogue is fixed BEFORE consent; omitted evidence never removes the complete input text. */
export function prepareEvidenceCatalog(input: RelationshipPair): EvidenceCatalog {
  const pair = Object.freeze(input.map(note => Object.freeze({ ...note }))) as unknown as RelationshipPair;
  const nonce = crypto.randomUUID(), fragments: EvidenceFragment[] = [], uncoveredCharacters: number[] = [];
  pair.forEach((note, index) => {
    const source = note.content, side = index === 0 ? "A" : "B", covered = new Uint8Array(source.length);
    const seeds = new Set<string>();
    let offered = 0, candidates = 0;
    // Lines also preserve formatted Markdown; this is evidence slicing, not an execution parser.
    lines: for (const line of source.matchAll(/[^\r\n]+/g)) {
      for (let start = line.index!; start < line.index! + line[0].length && offered < EVIDENCE_LIMITS.fragmentsPerSide;) {
        const end = boundary(source, Math.min(start + EVIDENCE_LIMITS.seedCharacters, line.index! + line[0].length));
        const seed = source.slice(start, end);
        // Repeated seeds are considered once; the coverage counter discloses unoffered occurrences.
        if (seeds.has(seed) || !seed.trim()) { start = end; continue; }
        seeds.add(seed);
        if (candidates++ === EVIDENCE_LIMITS.candidatesPerSide) break lines;
        let from = start, to = end;
        while (!unique(source, from, to) && to - from < EVIDENCE_LIMITS.fragmentCharacters) {
          const room = EVIDENCE_LIMITS.fragmentCharacters - (to - from);
          const nextFrom = boundary(source, Math.max(0, from - Math.min(80, Math.floor(room / 2))));
          const nextTo = boundary(source, Math.min(source.length, to + Math.min(80, room - (from - nextFrom))));
          if (nextFrom === from && nextTo === to) break;
          from = nextFrom; to = nextTo;
        }
        if (to - from <= EVIDENCE_LIMITS.fragmentCharacters && unique(source, from, to)) {
          if (!fragments.some(f => f.side === side && f.start === from && f.end === to)) {
            fragments.push(Object.freeze({ id: `${nonce}:${side}:${offered++}`, side, start: from, end: to, text: source.slice(from, to) }));
            covered.fill(1, from, to);
          }
        }
        start = end;
      }
      if (offered >= EVIDENCE_LIMITS.fragmentsPerSide) break;
    }
    uncoveredCharacters.push(covered.reduce((sum, value, i) => sum + (!value && /\S/u.test(source[i]) ? 1 : 0), 0));
  });
  return Object.freeze({ pair, fragments: Object.freeze(fragments), uncoveredCharacters: Object.freeze(uncoveredCharacters) });
}

export function evidenceRequest(catalog: EvidenceCatalog): string {
  return JSON.stringify({ schema: RELATIONSHIP_WIRE_SCHEMA, A: catalog.pair[0].content, B: catalog.pair[1].content,
    evidence: catalog.fragments.map(({ id, side, text }) => ({ id, side, text })), uncoveredCharacters: catalog.uncoveredCharacters });
}

function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(k => Object.prototype.hasOwnProperty.call(value, k)))
    throw new RelationshipError("invalidResponse", [{ field: "response", code: "wire_schema_invalid" }]);
  return value as Record<string, unknown>;
}

/** One explicit wire schema only. Bind references, then cross the unchanged strict validation barrier. */
export function validateEvidenceResponse(raw: string, catalog: EvidenceCatalog, current: RelationshipPair): RelationshipResult {
  if (!catalog.pair.every((note, i) => sameSavedNote(note, current[i]))) throw new RelationshipError("source", [{ field: "catalog", code: "catalog_stale" }]);
  if (typeof raw !== "string" || raw.length > 64000) throw new RelationshipError("invalidResponse");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new RelationshipError("invalidResponse"); }
  const root = shape(parsed, ["schema", "relation", "explanation", "claims", "recommendation", "alternatives", "limitations"]);
  if (root.schema !== RELATIONSHIP_WIRE_SCHEMA || !Array.isArray(root.claims) || root.claims.length > 8)
    throw new RelationshipError("invalidResponse", [{ field: "response", code: "wire_schema_invalid" }]);
  const diagnostics: EvidenceDiagnostic[] = [];
  const claims = root.claims.map((value, i) => {
    const c = shape(value, ["id", "kind", "text", "evidenceA", "evidenceB"]);
    const resolve = (side: "A" | "B"): string | null => {
      const id = c[`evidence${side}`];
      if (id === null) return null;
      const entry = typeof id === "string" ? catalog.fragments.find(f => f.id === id) : undefined;
      const field = `claims[${i}].evidence${side}`;
      if (!entry) { diagnostics.push({ field, side, code: "reference_unknown" }); return null; }
      if (entry.side !== side) { diagnostics.push({ field, side, code: "reference_side_mismatch" }); return null; }
      return entry.text;
    };
    return { id: c.id, kind: c.kind, text: c.text, quoteA: resolve("A"), quoteB: resolve("B") };
  });
  if (diagnostics.length) throw new RelationshipError("unverifiedEvidence", diagnostics);
  return validateRelationshipResponse(JSON.stringify({ relation: root.relation, explanation: root.explanation, claims,
    recommendation: root.recommendation, alternatives: root.alternatives, limitations: root.limitations }), catalog.pair[0].content, catalog.pair[1].content);
}
