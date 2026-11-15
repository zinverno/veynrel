import { authorityKey, organizationAuthority, validOrganizationAuthority } from "./organizationIdentity";
import type { OrganizationAuthority, OrganizationDecision } from "./organizationIdentity";
import type { App } from "obsidian";
import { isCanonicalMarkdownPath } from "../chunking/reconstructChunks";
import { readSavedNote, sameSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import { ORGANIZATION_DOCUMENT_LIMIT, OrganizationError, organizationPreferences, parseOrganizationDocument } from "./organizationProfile";
import type { OrganizationDefinitions, OrganizationPreferences } from "./organizationProfile";

export interface OrganizationPreferencesPort {
  get(): OrganizationPreferences;
  save(next: OrganizationPreferences, expected: OrganizationPreferences, signal: AbortSignal, expectedProfile?: string): Promise<void>;
}
export interface RegistryReview {
  kind: "connect" | "create" | "disconnect"; path: string; content: string;
  expected: OrganizationPreferences; profileStamp: string; source?: SavedNote;
}
export class OrganizationRegistry {
  state: "unloaded" | "ready" | "created" | OrganizationError["reason"] = "unloaded";
  private loaded?: { source: SavedNote; definitions: OrganizationDefinitions };
  private readonly listeners = new Set<() => void>();
  private stop?: () => void;
  private saving = false;
  constructor(private readonly app: App, readonly preferences: OrganizationPreferencesPort,
    private readonly legacy: () => TagTaxonomyProfile | null, private readonly profileChanged: () => void) {}
  private emit(): void { this.profileChanged(); for (const listener of this.listeners) listener(); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get invalidPreferences(): boolean { try { this.preferences.get(); return false; } catch { return true; } }
  get path(): string | null { try { return this.preferences.get().registryPath; } catch { this.state = "invalid"; return null; } }
  get definitions(): OrganizationDefinitions | null {
    const source = this.loaded?.source;
    if (this.invalidPreferences || !source || this.path !== source.path || this.app.vault.getFileByPath(source.path) !== source.file ||
      source.file.path !== source.path || source.file.stat.mtime !== source.modified || source.file.stat.size !== source.bytes) return null;
    return structuredClone(this.loaded!.definitions);
  }
  get profile(): TagTaxonomyProfile | null { return this.invalidPreferences ? null : this.path ? this.definitions?.profile ?? null : this.legacy(); }
  private watch(): void {
    if (this.stop) return;
    const changed = (file: { path: string }, old?: string): void => {
      if (file.path !== this.path && old !== this.path) return;
      this.loaded = undefined; this.state = "changed"; this.emit();
    };
    const refs = [this.app.vault.on("modify", changed), this.app.vault.on("delete", changed), this.app.vault.on("rename", changed), this.app.vault.on("create", changed)];
    this.stop = () => refs.forEach(ref => this.app.vault.offref(ref));
  }
  private safePath(path: string): void {
    if (!isCanonicalMarkdownPath(path) || path.split("/").some(part => part.startsWith(".") || part.toLowerCase() === "node_modules") ||
      path === this.app.vault.configDir || path.startsWith(this.app.vault.configDir + "/")) throw new OrganizationError("invalid");
  }
  private async read(path: string): Promise<SavedNote> {
    this.safePath(path);
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new OrganizationError("missing");
    if (file.stat.size > ORGANIZATION_DOCUMENT_LIMIT * 4) throw new OrganizationError("limit");
    const source = await readSavedNote(this.app, path);
    if (source.state !== "ready") throw new OrganizationError(source.state === "missing" ? "missing" : source.state === "changed" ? "changed" : "invalid");
    parseOrganizationDocument(source.content); return source;
  }
  async prepare(kind: RegistryReview["kind"], path: string, content = ""): Promise<RegistryReview> {
    const expected = this.preferences.get(), profileStamp = JSON.stringify(this.legacy());
    try {
      let source: SavedNote | undefined;
      if (kind !== "disconnect") this.safePath(path);
      if (kind === "connect") { this.watch(); source = await this.read(path); content = source.content; }
      if (kind === "create") {
        if (!/^---\r?\nveynrel-service: organization-registry\r?\n---\r?\n/.test(content)) throw new OrganizationError("invalid");
        if (this.app.vault.getAbstractFileByPath(path)) throw new OrganizationError("conflict");
        parseOrganizationDocument(content);
      }
      return { kind, path, content, source, expected, profileStamp };
    } catch (error) { this.state = error instanceof OrganizationError ? error.reason : "invalid"; throw error; }
  }
  async confirm(review: RegistryReview, signal: AbortSignal): Promise<void> {
    if (this.saving) throw new OrganizationError("conflict");
    this.saving = true;
    try {
      if (signal.aborted) throw new OrganizationError("cancelled");
      if (JSON.stringify(this.preferences.get()) !== JSON.stringify(review.expected) || JSON.stringify(this.legacy()) !== review.profileStamp) throw new OrganizationError("conflict");
      if (review.kind === "create") {
        this.safePath(review.path); parseOrganizationDocument(review.content);
        if (!/^---\r?\nveynrel-service: organization-registry\r?\n---\r?\n/.test(review.content)) throw new OrganizationError("invalid");
        if (this.app.vault.getAbstractFileByPath(review.path)) throw new OrganizationError("conflict");
        await this.app.vault.create(review.path, review.content);
        const created = await this.read(review.path);
        if (created.content !== review.content) throw new OrganizationError("changed");
        this.state = "created"; // Creation does not silently replace the active definition source.
      } else {
        let source: SavedNote | undefined;
        if (review.kind === "connect") {
          source = await this.read(review.path);
          if (!review.source || !sameSavedNote(review.source, source)) throw new OrganizationError("changed");
        }
        if (signal.aborted) throw new OrganizationError("cancelled");
        await this.preferences.save({ ...review.expected, registryPath: source?.path ?? null }, review.expected, signal, review.profileStamp);
        this.loaded = undefined;
        if (source) {
          const after = await this.read(source.path);
          if (!sameSavedNote(source, after)) throw new OrganizationError("changed");
          this.loaded = { source: after, definitions: parseOrganizationDocument(after.content) }; this.state = "ready";
        } else this.state = "unloaded";
      }
      this.emit();
    } catch (error) {
      this.state = error instanceof OrganizationError ? error.reason : "save"; this.emit();
      throw error instanceof OrganizationError ? error : new OrganizationError("save");
    } finally { this.saving = false; }
  }
  /** Only after the executor's verified readback; never a passive read or settings write. */
  async refreshAfterWrite(saved: SavedNote): Promise<void> {
    this.loaded = undefined; this.state = "changed"; this.emit(); this.watch();
    try {
      if (this.path !== saved.path) throw new OrganizationError("changed");
      const source = await this.read(saved.path);
      if (this.path !== source.path || !sameSavedNote(source, saved)) throw new OrganizationError("changed");
      this.loaded = { source, definitions: parseOrganizationDocument(source.content) }; this.state = "ready"; this.emit();
    } catch (error) {
      this.loaded = undefined; this.state = error instanceof OrganizationError ? error.reason : "save"; this.emit(); throw error;
    }
  }
  decisionFor(suggestion: { authority: OrganizationAuthority; legacyId: string }): "active" | "dismissed" | "deferred" {
    const p = this.preferences.get();
    const decision = p.version === 2 ? p.decisions.find(d => authorityKey(d.authority) === authorityKey(suggestion.authority)) : undefined;
    return decision?.state ?? (p.dismissed.includes(suggestion.legacyId) ? "dismissed" : "active");
  }
  async decide(authority: OrganizationAuthority, state: OrganizationDecision["state"], signal: AbortSignal): Promise<void> {
    if (!validOrganizationAuthority(authority) || !["dismissed", "deferred"].includes(state)) throw new OrganizationError("invalid");
    if (this.path && !this.definitions) throw new OrganizationError("changed");
    const current = organizationAuthority(authority.kind, authority.value, authority.scope, authority.exclusions, this.profile, this.definitions);
    if (authorityKey(current) !== authorityKey(authority)) throw new OrganizationError("changed");
    await this.updateDecisions(expected => {
      const decisions = expected.version === 2 ? expected.decisions : [];
      return { ...expected, version: 2, decisions: [...decisions.filter(d => authorityKey(d.authority) !== authorityKey(authority)), { authority, state }] };
    }, signal);
  }
  async restoreDecision(authority: OrganizationAuthority, signal: AbortSignal, legacyId?: string): Promise<void> {
    if (!validOrganizationAuthority(authority)) throw new OrganizationError("invalid");
    await this.updateDecisions(expected => ({ ...expected,
      dismissed: legacyId ? expected.dismissed.filter(id => id !== legacyId) : expected.dismissed,
      ...(expected.version === 2 ? { decisions: expected.decisions.filter(d => authorityKey(d.authority) !== authorityKey(authority)) } : {}),
    }), signal);
  }
  /** The user explicitly selects this opaque old ID; never infer its missing authority. */
  async restoreLegacy(id: string, signal: AbortSignal): Promise<void> {
    await this.updateDecisions(expected => ({ ...expected, dismissed: expected.dismissed.filter(value => value !== id) }), signal);
  }
  private async updateDecisions(change: (expected: OrganizationPreferences) => OrganizationPreferences, signal: AbortSignal): Promise<void> {
    if (this.saving) throw new OrganizationError("conflict");
    this.saving = true;
    try {
      if (signal.aborted) throw new OrganizationError("cancelled");
      const expected = this.preferences.get(), next = organizationPreferences(change(structuredClone(expected)));
      if (JSON.stringify(next) === JSON.stringify(expected)) return;
      await this.preferences.save(next, expected, signal); this.emit();
    } finally { this.saving = false; }
  }
  async dismiss(id: string, signal: AbortSignal): Promise<void> {
    await this.updateDecisions(expected => expected.dismissed.includes(id) ? expected : { ...expected, dismissed: [...expected.dismissed, id] }, signal);
  }
  dispose(): void { this.stop?.(); this.stop = undefined; this.loaded = undefined; this.listeners.clear(); }
}
