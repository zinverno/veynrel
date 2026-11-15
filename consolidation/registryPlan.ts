import { isRecord, hasOnlyKeys, isTimestamp } from "../health/domain/validation";
import { requireSafe } from "./operationJournal";
import { localBytes, localPath } from "./localNotePlan";
import type { LocalSource } from "./localNotePlan";
import { ORGANIZATION_DOCUMENT_LIMIT, parseOrganizationDocument, requireOrganizationDefinitions } from "./organizationProfile";
import type { OrganizationDefinitions } from "./organizationProfile";

export class RegistryUnchangedError extends Error { constructor() { super("unchanged"); } }
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => Array.isArray(item) && item.every(x => typeof x === "string") ? [...item].sort() : isRecord(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export type RegistryKind = "tag" | "convention" | "category";
export type RegistryChoice =
  { kind: "tag"; key: string | null; value: OrganizationDefinitions["tags"][number] | null } |
  { kind: "convention"; key: string | null; value: OrganizationDefinitions["conventions"][number] | null } |
  { kind: "category"; key: string | null; value: OrganizationDefinitions["profile"]["categories"][number] | null };
export interface RegistryPlan {
  version: 1; source: LocalSource; choice: RegistryChoice; after: string;
  edit: { start: number; end: number; removed: string; inserted: string };
}
export function registryKey(kind: RegistryKind, entry: NonNullable<RegistryChoice["value"]>): string {
  if (kind === "tag") return (entry as OrganizationDefinitions["tags"][number]).tag;
  if (kind === "category") return (entry as OrganizationDefinitions["profile"]["categories"][number]).id;
  const c = entry as OrganizationDefinitions["conventions"][number]; return JSON.stringify([c.subject, c.value]);
}
/** Strict editing subset: one standalone three-backtick block, outside YAML/other fences. */
export function registryBlock(content: string): { start: number; end: number; newline: string } {
  requireSafe(content.length <= ORGANIZATION_DOCUMENT_LIMIT && !content.startsWith("\uFEFF"), "stale");
  parseOrganizationDocument(content);
  let offset = 0, fence: { char: string; count: number; registry: boolean } | undefined, yaml = false;
  let start = -1, end = -1, newline = "\n";
  for (const line of content.match(/[^\n]*(?:\n|$)/g) ?? []) {
    const text = line.replace(/\r?\n$/, "");
    if (offset === 0 && text === "---") yaml = true;
    else if (yaml && (text === "---" || text === "...")) yaml = false;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (/^[ \t]*[`~]{3,}veynrel-organization\b/.test(text)) {
      requireSafe(!yaml && !fence && start < 0 && /^```veynrel-organization[ \t]*$/.test(text) && line.endsWith("\n"), "stale");
      start = offset + line.length; newline = line.endsWith("\r\n") ? "\r\n" : "\n";
      fence = { char: "`", count: 3, registry: true };
    } else if (marker && !yaml) {
      if (!fence) fence = { char: marker[1][0], count: marker[1].length, registry: false };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.count && !marker[2].trim()) {
        if (fence.registry) { requireSafe(/^```[ \t]*$/.test(text), "stale"); end = offset; }
        fence = undefined;
      }
    }
    offset += line.length;
  }
  requireSafe(start >= 0 && end > start && !yaml && !fence, "stale");
  return { start, end, newline };
}
export function registryDefinitionsAfter(before: OrganizationDefinitions, choice: RegistryChoice): OrganizationDefinitions {
  requireSafe(isRecord(choice) && hasOnlyKeys(choice, ["kind", "key", "value"]) && ["tag", "convention", "category"].includes(choice.kind) &&
    (choice.key === null || typeof choice.key === "string") && (choice.value === null || isRecord(choice.value)), "stale");
  const next = requireOrganizationDefinitions(before);
  const entries: NonNullable<RegistryChoice["value"]>[] = choice.kind === "tag" ? next.tags : choice.kind === "convention" ? next.conventions : next.profile.categories;
  const index = choice.key === null ? -1 : entries.findIndex(entry => registryKey(choice.kind, entry) === choice.key);
  requireSafe(choice.key === null ? choice.value !== null : index >= 0, "stale");
  if (index >= 0 && choice.value !== null && choice.kind !== "convention") requireSafe(registryKey(choice.kind, choice.value) === choice.key, "stale");
  if (choice.value === null) entries.splice(index, 1);
  else if (index >= 0) entries[index] = structuredClone(choice.value);
  else entries.push(structuredClone(choice.value));
  return requireOrganizationDefinitions(next);
}
export function buildRegistryPlan(source: LocalSource, choice: RegistryChoice): RegistryPlan {
  requireSafe(isRecord(source) && hasOnlyKeys(source, ["path", "created", "modified", "bytes", "content"]) && localPath(source.path) &&
    isTimestamp(source.created) && isTimestamp(source.modified) && typeof source.content === "string" && source.bytes === localBytes(source.content), "stale");
  const block = registryBlock(source.content), before = parseOrganizationDocument(source.content), next = registryDefinitionsAfter(before, choice);
  if (canonical(before) === canonical(next)) throw new RegistryUnchangedError();
  const edit = { start: block.start, end: block.end, removed: source.content.slice(block.start, block.end), inserted: JSON.stringify(next, null, 2).replace(/\n/g, block.newline) + block.newline };
  const after = source.content.slice(0, edit.start) + edit.inserted + source.content.slice(edit.end);
  requireSafe(after.length <= ORGANIZATION_DOCUMENT_LIMIT, "stale"); parseOrganizationDocument(after);
  return { version: 1, source, choice, after, edit };
}
export function validateRegistryPlan(value: unknown): asserts value is RegistryPlan {
  requireSafe(isRecord(value) && hasOnlyKeys(value, ["version", "source", "choice", "after", "edit"]) && value.version === 1, "storage");
  const p = value as unknown as RegistryPlan;
  requireSafe(JSON.stringify(buildRegistryPlan(p.source, p.choice)) === JSON.stringify(p), "storage");
}
