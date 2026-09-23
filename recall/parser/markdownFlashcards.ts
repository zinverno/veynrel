import { MAX_ANSWER_LENGTH, MAX_NOTE_LENGTH, MAX_QUESTION_LENGTH, MAX_RECALL_CARDS } from "../domain/card";
import type { RecallCardCandidate, RecallExtraction } from "../domain/card";
import { createRecallCandidate, isRecallPath, normalizeCardText } from "../domain/identity";
import { recallCheckpoint, throwIfAborted } from "../cancellation";
import { RecallDiagnostics } from "../diagnostics";

/** Generated ATX Flashcards sections only; this is deliberately not a general Markdown parser. */
export async function parseMarkdownFlashcards(path: string, content: string, signal?: AbortSignal): Promise<RecallExtraction> {
  throwIfAborted(signal);
  const diagnostics = new RecallDiagnostics();
  const cards = new Map<string, RecallCardCandidate>();
  let complete = true;
  const result = (): RecallExtraction => Object.freeze({ cards: Object.freeze([...cards.values()]), complete, ...diagnostics.result() });
  if (!isRecallPath(path) || typeof content !== "string") {
    complete = false; diagnostics.add("invalid-note"); return result();
  }
  if (content.length > MAX_NOTE_LENGTH) {
    complete = false; diagnostics.add("oversized-note", path); return result();
  }
  const lines = content.replace(/\r\n?/gu, "\n").replace(/^\uFEFF/u, "").split("\n");
  let frontmatter = /^---[ \t]*$/u.test(lines[0]);
  let sectionLevel: number | undefined;
  let fence: { character: string; length: number } | undefined;
  let comment = false;
  for (let index = 0; index < lines.length; index++) {
    await recallCheckpoint(signal, index + 1);
    const line = lines[index];
    if (frontmatter) {
      if (index > 0 && /^(?:---|\.\.\.)[ \t]*$/u.test(line)) frontmatter = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    // Ignore comment lines without interpreting hidden headings/card syntax.
    if (comment || line.includes("<!--")) {
      const opening = line.indexOf("<!--");
      comment = line.indexOf("-->", comment ? 0 : opening + 4) === -1;
      continue;
    }
    if (marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
      fence = { character: marker[1][0], length: marker[1].length }; continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim();
      if (sectionLevel !== undefined && level <= sectionLevel) sectionLevel = undefined;
      if (sectionLevel === undefined && title === "Flashcards") sectionLevel = level;
      continue;
    }
    // Setext headings can terminate an ATX section too. Never consume their title as a card.
    const underline = index + 1 < lines.length ? /^ {0,3}(=+|-+)[ \t]*$/u.exec(lines[index + 1]) : null;
    if (line.trim() && underline) {
      const level = underline[1][0] === "=" ? 1 : 2;
      if (sectionLevel !== undefined && level <= sectionLevel) sectionLevel = undefined;
      index++; continue;
    }
    if (sectionLevel === undefined || !line.trim() || line.trim() === "#flashcards" || /^(?: {4}|\t)/u.test(line)) continue;
    const separator = line.indexOf("::");
    if (separator === -1) continue;
    const question = normalizeCardText(line.slice(0, separator));
    const answer = normalizeCardText(line.slice(separator + 2));
    if (question.length > MAX_QUESTION_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
      complete = false; diagnostics.add("oversized-card", path); continue;
    }
    let candidate: RecallCardCandidate;
    try { candidate = createRecallCandidate({ path, question, answer }); }
    catch { complete = false; diagnostics.add("malformed-card", path); continue; }
    if (cards.has(candidate.fingerprint)) { diagnostics.add("duplicate-card", path); continue; }
    if (cards.size === MAX_RECALL_CARDS) { complete = false; diagnostics.add("card-limit", path); break; }
    cards.set(candidate.fingerprint, candidate);
  }
  if (frontmatter) { complete = false; diagnostics.add("unclosed-frontmatter", path); }
  if (fence) { complete = false; diagnostics.add("unclosed-fence", path); }
  if (comment) { complete = false; diagnostics.add("unclosed-comment", path); }
  throwIfAborted(signal);
  return result();
}
