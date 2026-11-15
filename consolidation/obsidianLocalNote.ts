import type { App, CachedMetadata } from "obsidian";
import { readSavedNote, sameSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import { buildLocalNotePlan, LocalNoteError, localBytes, localPath, repairRanges, validateLocalNotePlan } from "./localNotePlan";
import type { LocalChoice, LocalNotePlan, LocalSource } from "./localNotePlan";
import { requireSafe } from "./operationJournal";
import { parseOrganizationDocument } from "./organizationProfile";
import type { OrganizationDefinitions } from "./organizationProfile";
import { parseTaxonomyProfile } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import { taxonomyFileEligible } from "./taxonomyScan";
import type { SafeApplyPort } from "./safeApply";
import type { LocalNoteRecord } from "./localNoteJournal";

export interface LocalRules { profile: unknown; registryPath: string | null }
export interface LocalNoteCheck { notes: SavedNote[]; guard(): void }
export interface LocalNotePort {
  check(plan: LocalNotePlan, pinned?: readonly SavedNote[]): Promise<LocalNoteCheck>;
  undo(record: LocalNoteRecord, pinned?: readonly SavedNote[]): Promise<LocalNoteCheck>;
}
export interface LocalPreparation {
  source: LocalSource; metadata: CachedMetadata; note: SavedNote; authority: string;
  registryPath: string | null; definitions: OrganizationDefinitions | null; profile: TagTaxonomyProfile | null;
  guard(): void;
}
export function localSource(n: SavedNote): LocalSource {
  return { path: n.path, created: n.file.stat.ctime, modified: n.modified, bytes: n.bytes, content: n.content };
}
/** No scanner or writes: selected saved files and the one explicitly connected rules source only. */
export class ObsidianLocalNote implements LocalNotePort {
  constructor(private readonly app: App, private readonly port: SafeApplyPort, private readonly rules: () => LocalRules) {}
  private async read(path: string): Promise<SavedNote> {
    const file = this.app.vault.getFileByPath(path), created = file?.stat.ctime;
    requireSafe(localPath(path) && file && file.stat.size <= 800000, "stale");
    const n = await readSavedNote(this.app, path);
    requireSafe(n.state === "ready" && n.file === file && file.stat.ctime === created && n.content.length <= 200000 && n.bytes === localBytes(n.content), "stale");
    return n;
  }
  async prepare(path: string): Promise<LocalPreparation> {
    const settings = JSON.stringify(this.rules()), rules = this.rules();
    let registry: SavedNote | undefined, definitions: OrganizationDefinitions | null = null;
    if (rules.registryPath) { registry = await this.read(rules.registryPath); definitions = parseOrganizationDocument(registry.content); }
    const profile = definitions?.profile ?? parseTaxonomyProfile(rules.profile);
    requireSafe(rules.registryPath ? !!definitions : rules.profile == null || !!profile, "stale");
    const n = await this.read(path), source = localSource(n);
    requireSafe(path !== rules.registryPath && taxonomyFileEligible(this.app, n.file, []), "stale");
    const cache = this.app.metadataCache.getFileCache(n.file);
    requireSafe(cache?.sections && !cache.frontmatter?.["veynrel-service"], "stale");
    const metadata = JSON.parse(JSON.stringify(cache)) as CachedMetadata;
    const registrySource = registry ? localSource(registry) : null;
    const authority = JSON.stringify({ settings, registry: registrySource });
    const guard = () => {
      requireSafe(JSON.stringify(this.rules()) === settings, "stale");
      this.port.guard(n);
      requireSafe(n.file.stat.ctime === source.created && JSON.stringify(this.app.metadataCache.getFileCache(n.file)) === JSON.stringify(metadata), "stale");
      if (registry && registrySource) {
        this.port.guard(registry); requireSafe(registry.file.stat.ctime === registrySource.created, "stale");
      }
    };
    guard(); return { source, metadata, note: n, authority, registryPath: rules.registryPath, definitions, profile, guard };
  }
  async plan(prepared: LocalPreparation, choice: LocalChoice): Promise<LocalNotePlan> {
    prepared.guard();
    const plan = buildLocalNotePlan(prepared.source, prepared.metadata, prepared.authority, choice);
    await this.check(plan, [prepared.note]); return plan;
  }
  async target(path: string): Promise<LocalSource> { return localSource(await this.read(path)); }
  unresolved(prepared: LocalPreparation): ReturnType<typeof repairRanges> {
    prepared.guard();
    return repairRanges(prepared.source, prepared.metadata).filter(r => !this.app.metadataCache.getFirstLinkpathDest(r.text.slice(2, -2), prepared.source.path));
  }
  async check(plan: LocalNotePlan, pinned?: readonly SavedNote[]): Promise<LocalNoteCheck> {
    validateLocalNotePlan(plan);
    const p = await this.prepare(plan.source.path), notes = [p.note];
    requireSafe(JSON.stringify(plan.source) === JSON.stringify(p.source) && plan.authority === p.authority &&
      JSON.stringify(plan.metadata) === JSON.stringify(p.metadata) && (!pinned || sameSavedNote(pinned[0], p.note)), "stale");
    let target: SavedNote | undefined;
    if (plan.choice.kind === "add_inline_tag") {
      const tag = plan.choice.tag.toLowerCase();
      if (p.definitions?.tags.some(t => t.tag.toLowerCase() === tag && t.state !== "allowed")) throw new LocalNoteError("tag_rule");
    } else {
      target = await this.read(plan.choice.target.path); notes.push(target);
      requireSafe(target.path !== this.rules().registryPath && taxonomyFileEligible(this.app, target.file, []) &&
        !this.app.metadataCache.getFileCache(target.file)?.frontmatter?.["veynrel-service"], "stale");
      requireSafe(JSON.stringify(localSource(target)) === JSON.stringify(plan.choice.target) &&
        (!pinned?.[1] || sameSavedNote(pinned[1], target)), "stale");
    }
    const guard = () => {
      p.guard();
      if (plan.choice.kind === "repair_wikilink" && target) {
        this.port.guard(target); requireSafe(target.file.stat.ctime === plan.choice.target.created &&
          !this.app.metadataCache.getFirstLinkpathDest(plan.choice.range.text.slice(2, -2), plan.source.path) &&
          this.app.metadataCache.getFirstLinkpathDest(target.path.slice(0, -3), plan.source.path) === target.file, "stale");
      }
    };
    guard(); return { notes, guard };
  }
  async undo(record: LocalNoteRecord, pinned?: readonly SavedNote[]): Promise<LocalNoteCheck> {
    // Undo restores the exact original source; it does not apply current tagging rules or alter the target.
    const n = await this.read(record.plan.source.path);
    requireSafe(n.content === record.plan.after && n.file.stat.ctime === record.plan.source.created &&
      (!pinned || sameSavedNote(pinned[0], n)), "conflict");
    const guard = () => { this.port.guard(n); requireSafe(n.file.stat.ctime === record.plan.source.created, "conflict"); };
    guard(); return { notes: [n], guard };
  }
}
