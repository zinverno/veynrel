import { commentContinues } from "./parser/markdownSyntax";
import { createRecallCandidate } from "./domain/identity";
import { isStudyTag } from "./domain/topics";
import { parseMarkdownFlashcards } from "./parser/markdownFlashcards";

export const MAX_FLASHCARD_INPUT_LENGTH = 32_000;
export interface RecallGenerationOptions {
  count: number;
  tag: string;
  goal: "" | "remember" | "explain" | "apply";
  instructions: string;
  selection?: string;
}
export const DEFAULT_GENERATION_OPTIONS: RecallGenerationOptions = { count: 5, tag: "", goal: "", instructions: "" };
export class RecallGenerationError extends Error {
  constructor(readonly reason: "source-too-long" | "insufficient-material" | "invalid-output" | "invalid-options") { super(reason); }
}

/** Offsets retain every source character, including BOM, CRLF and trailing spaces. */
export function flashcardSections(content: string) {
  const lines = [...content.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)].filter(match => match[0].length);
  const sections: { start: number; end: number; level: number }[] = [];
  let frontmatter = /^\uFEFF?---[ \t]*(?:\r\n|\r|\n)/u.test(content), comment = false;
  let fence: { char: string; length: number } | undefined, section: typeof sections[number] | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i][0].replace(/[\r\n]+$/u, ""), offset = lines[i].index!;
    if (frontmatter) { if (i > 0 && /^(?:---|\.\.\.)[ \t]*$/u.test(line)) frontmatter = false; continue; }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) { if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined; continue; }
    if (comment || line.includes("<!--")) { comment = commentContinues(line, comment); continue; }
    if (marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    const underline = i + 1 < lines.length && line.trim() ? /^ {0,3}(=+|-+)[ \t]*[\r\n]*$/u.exec(lines[i + 1][0]) : null;
    const level = heading?.[1].length ?? (underline ? underline[1][0] === "=" ? 1 : 2 : undefined);
    if (level === undefined) continue;
    if (section && level <= section.level) { section.end = offset; section = undefined; }
    if (!section && heading && (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim() === "Flashcards") {
      section = { start: offset, end: content.length, level }; sections.push(section);
    }
    if (underline) i++;
  }
  if (frontmatter || fence || comment) throw new RecallGenerationError("invalid-output");
  return sections;
}

export function prepareRecallSource(content: string, selection?: string): string {
  const sections = flashcardSections(content);
  let source = content;
  for (const section of [...sections].reverse()) { source = source.slice(0, section.start) + source.slice(section.end); }
  source = source.replace(/^\uFEFF?---[^\r\n]*[\r\n]+[\s\S]*?[\r\n]+(?:---|\.\.\.)[^\r\n]*(?:[\r\n]+|$)/u, "");
  if (selection !== undefined) {
    if (!selection.trim() || !source.includes(selection)) throw new RecallGenerationError("insufficient-material");
    source = selection;
  }
  if (!source.trim()) throw new RecallGenerationError("insufficient-material");
  if (source.length > MAX_FLASHCARD_INPUT_LENGTH) throw new RecallGenerationError("source-too-long");
  return source;
}

export async function parseRecallOutput(raw: string, count: number): Promise<string[]> {
  if (typeof raw !== "string" || raw.length > 160_000) throw new RecallGenerationError("invalid-output");
  const lines = raw.trim().split(/\r?\n/u).filter(line => line.trim());
  if (!raw.trim()) throw new RecallGenerationError("insufficient-material");
  if (lines.length > count) throw new RecallGenerationError("invalid-output");
  const cards: string[] = [];
  for (const line of lines) {
    const sides = line.split("::");
    if (sides.length !== 2 || /^(?:#|[-*+•] |\d+[.)] |```|~~~|<)/u.test(line.trim()) || Array.from(line).some(char => (char.charCodeAt(0) < 32 && char !== "\t") || char.charCodeAt(0) === 127)) throw new RecallGenerationError("invalid-output");
    let candidate: ReturnType<typeof createRecallCandidate>;
    try { candidate = createRecallCandidate({ path: "Generated.md", question: sides[0], answer: sides[1] }); }
    catch { throw new RecallGenerationError("invalid-output"); }
    const serialized = `${candidate.question}::${candidate.answer}`;
    const extracted = await parseMarkdownFlashcards("Generated.md", `## Flashcards\n${serialized}\n`);
    if (!extracted.complete || extracted.cards.length !== 1 || extracted.cards[0].id !== candidate.id) throw new RecallGenerationError("invalid-output");
    if (!cards.includes(serialized)) cards.push(serialized);
  }
  return cards;
}

export function serializeRecallInsertion(content: string, cards: readonly string[], tag: string) {
  if (tag && !isStudyTag(tag)) throw new RecallGenerationError("invalid-options");
  const sections = flashcardSections(content), eol = content.includes("\r\n") ? "\r\n" : "\n";
  // The first top-level ATX Flashcards section wins; other sections remain untouched.
  const at = sections[0]?.end ?? content.length;
  const prefix = at && !/[\r\n]$/u.test(content.slice(0, at)) ? eol : "";
  const text = prefix + eol + (sections.length ? "" : `## Flashcards${eol}#flashcards${eol}${eol}`) +
    cards.map(line => `${tag ? `#${tag} ` : ""}${line}`).join(eol) + eol + (at < content.length ? eol : "");
  return { at, text, newContent: content.slice(0, at) + text + content.slice(at) };
}

export async function generateRecall(content: string, prompt: string, options: RecallGenerationOptions,
  call: (system: string, source: string) => Promise<string>) {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 15 || (options.tag && !isStudyTag(options.tag)) ||
      !["", "remember", "explain", "apply"].includes(options.goal) || options.instructions.length > 4000 || !prompt.trim() || prompt.length > 16000) {
    throw new RecallGenerationError("invalid-options");
  }
  const source = prepareRecallSource(content, options.selection);
  const raw = await call(`${prompt}\n\nRequested maximum: ${options.count}. Return fewer if unsupported. Output language: source language.\nGoal: ${options.goal || "remember"}.\nAdditional instructions: ${options.instructions}`, source);
  const cards = await parseRecallOutput(raw, options.count);
  return { ...serializeRecallInsertion(content, cards, options.tag), cardCount: cards.length };
}
