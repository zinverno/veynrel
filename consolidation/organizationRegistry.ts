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
  get path(): string | null { return this.preferences.get().registryPath; }
  get definitions(): OrganizationDefinitions | null {
    const source = this.loaded?.source;
    if (!source || this.path !== source.path || this.app.vault.getFileByPath(source.path) !== source.file ||
      source.file.path !== source.path || source.file.stat.mtime !== source.modified || source.file.stat.size !== source.bytes) return null;
    return structuredClone(this.loaded!.definitions);
  }
  get profile(): TagTaxonomyProfile | null { return this.path ? this.definitions?.profile ?? null : this.legacy(); }
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
  async dismiss(id: string, signal: AbortSignal): Promise<void> {
    const expected = this.preferences.get();
    if (expected.dismissed.includes(id)) return;
    const next = organizationPreferences({ ...expected, dismissed: [...expected.dismissed, id] });
    await this.preferences.save(next, expected, signal); this.emit();
  }
  dispose(): void { this.stop?.(); this.stop = undefined; this.loaded = undefined; this.listeners.clear(); }
}
