export const CHECKS_VERSION = 1 as const;
export interface TextSpan { start: number; end: number; line: number; text: string }
export type FindingKind = "code" | "link" | "number" | "qualifier" | "time" | "attribution" | "link-context";
export interface PreservationFinding { kind: FindingKind; before: TextSpan; after: TextSpan | null }
export interface PreservationChecks { version: typeof CHECKS_VERSION; coverage: "supported-patterns" | "partial"; findings: readonly PreservationFinding[] }
interface Feature { kind: FindingKind; span: TextSpan }
const MAX_FINDINGS = 60, MAX_FEATURES = 600, MAX_LINE = 2000;
const patterns: readonly [FindingKind, RegExp][] = [
  ["link", /!?\[\[[^\]\n]+\]\]|!?\[[^\]\n]*\]\((?:<[^>\n]*>|[^\s()\n]+)(?:\s+"[^"\n]*")?\)|^ {0,3}\[[^\]\n]+\]:[^\n]+/gu],
  ["number", /[-+]?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:%|kg|mg|g|ml|km|cm|mm|ms|kcal|seconds?|minutes?|hours?|reps?|sets?|руб(?:лей|ля)?|кг|мг|г|мл|км|см|мм|мс|ккал|секунд[аыу]?|минут[аыу]?|час(?:а|ов)?|повтор(?:а|ов)?|подход(?:а|ов)?)(?![\p{L}\p{N}_]))?/giu],
  ["qualifier", /(?:около|примерно|приблизительно|не менее|не более|почти|немного|about|approximately|roughly|nearly|at least|at most)(?!\p{L})|[~≈]/giu],
  ["time", /(?:(?:(?:к|до|by|until|next|следующ[а-я]+)\s+)?(?:понедельник[а-я]*|вторник[а-я]*|сред[аыуе]|четверг[а-я]*|пятниц[а-я]*|суббот[а-я]*|воскресень[а-я]*|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|сегодня|вчера|завтра|послезавтра|today|yesterday|tomorrow|next week|на следующей неделе)(?!\p{L})/giu],
  ["attribution", /(?:цитат[а-я]*|по словам|из чужого|из письма|не согласован[а-я]*|не утвержд[её]н[а-я]*|неизвестн[а-я]*|quoted?|according to|unapproved|not agreed|unknown)(?!\p{L})|^\s*>/giu],
];

/** Bounded lexical observations only. Equal tokens in different contexts can hide a semantic loss. */
function features(text: string): { items: Feature[]; partial: boolean } {
  const items: Feature[] = []; let partial = text.length > 72_002, offset = 0, lineNumber = 1;
  const lines = text.slice(0, 72_002).match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  let fence: { marker: string; start: number; line: number } | undefined;
  const add = (kind: FindingKind, start: number, end: number, line: number) => {
    if (items.length >= MAX_FEATURES) { partial = true; return; }
    items.push({ kind, span: { start, end, line, text: text.slice(start, end) } });
  };
  for (const raw of lines) {
    const line = raw.replace(/\r?\n$/u, ""), marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && !line.slice(marker[0].length).trim()) {
        add("code", fence.start, offset + raw.length, fence.line); fence = undefined;
      }
    } else if (marker) fence = { marker: marker[1], start: offset, line: lineNumber };
    else if (line.length > MAX_LINE) partial = true;
    else {
      const masked = line.replace(/`+[^`]*`+/gu, m => " ".repeat(m.length));
      if (/<(?:a|img|iframe)\b|\[[^\]]+\]\[[^\]]*\]|\]\([^\n]*\(/iu.test(masked)) partial = true;
      for (const [kind, re] of patterns) for (const match of masked.matchAll(re)) {
        if (kind !== "link" && match.index && /[\p{L}\p{N}_]/u.test(masked[match.index - 1])) continue;
        add(kind, offset + match.index!, offset + match.index! + match[0].length, lineNumber);
      }
    }
    offset += raw.length; lineNumber++;
  }
  if (fence) { partial = true; add("code", fence.start, offset, fence.line); }
  return { items, partial };
}

export function preservationChecks(before: string, after: string): PreservationChecks {
  const source = features(before), result = features(after), remaining = [...result.items], findings: PreservationFinding[] = [];
  let partial = source.partial || result.partial;
  for (const item of source.items) {
    const index = remaining.findIndex(x => x.kind === item.kind && x.span.text === item.span.text);
    if (index >= 0) { remaining.splice(index, 1); continue; }
    if (findings.length === MAX_FINDINGS) { partial = true; break; }
    const peer = result.items.filter(x => x.kind === item.kind).find(x => x.span.line === item.span.line);
    findings.push({ kind: item.kind, before: item.span, after: peer?.span ?? null });
  }
  return { version: CHECKS_VERSION, coverage: partial ? "partial" : "supported-patterns", findings };
}

export function linkContextFindings(body: string, sourcePath = ""): readonly PreservationFinding[] {
  const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\.md$/u, "");
  const source = key(sourcePath), basename = source.slice(source.lastIndexOf("/") + 1);
  return features(body).items.filter(x => {
    if (x.kind !== "link") return false;
    const text = x.span.text, wiki = /\[\[([^\]|]+)/u.exec(text), inline = /\]\((?:<)?([^\s)>]+)/u.exec(text), reference = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)/u.exec(text);
    const target = wiki?.[1] ?? inline?.[1] ?? reference?.[1] ?? "", path = key(target.split("#")[0]);
    return /#|\^|\.\.?\//u.test(target) || !!source && (path === source || path === basename) ||
      !wiki && !!target && !/^[a-z][a-z\d+.-]*:|^\//iu.test(target);
  })
    .slice(0, MAX_FINDINGS).map(x => ({ kind: "link-context", before: x.span, after: x.span }));
}
