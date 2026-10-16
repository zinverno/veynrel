import { requireTaxonomyProfile, TaxonomyError } from "./taxonomyProfile";
import type { TagTaxonomyProfile, TaxonomyProfilePort } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";

export class TaxonomySession {
  base: TagTaxonomyProfile | null;
  draft: TagTaxonomyProfile;
  inventory?: TaxonomyInventory;
  stage: "editing" | "scanning" | "review" | "saving" | "saved" | "error" = "editing";
  error?: TaxonomyError["reason"];
  progress = { processed: 0, total: 0 };
  onChange: () => void = () => {};
  private generation = 0;
  private closed = false;
  private operation?: AbortController;
  private reviewed?: TagTaxonomyProfile;
  constructor(private readonly port: Pick<TaxonomyProfilePort, "get" | "save">,
    private readonly scan: (excluded: string[], signal: AbortSignal, progress: (processed: number, total: number) => void) => Promise<TaxonomyInventory>) {
    this.base = port.get(); this.draft = structuredClone(this.base ?? { version: 1, categories: [] });
  }
  get busy(): boolean { return this.stage === "scanning" || this.stage === "saving"; }
  changed(): void { this.reviewed = undefined; this.stage = "editing"; this.error = undefined; }
  validate(): TaxonomyError["reason"] | undefined {
    try { requireTaxonomyProfile(this.draft); return undefined; } catch (error) { return error instanceof TaxonomyError ? error.reason : "invalid"; }
  }
  async analyze(excluded: string[]): Promise<void> {
    if (this.closed || this.busy) return;
    const generation = ++this.generation, operation = new AbortController(); this.operation = operation;
    this.stage = "scanning"; this.inventory = undefined; this.error = undefined; this.reviewed = undefined;
    this.progress = { processed: 0, total: 0 }; this.onChange();
    try {
      const inventory = await this.scan(excluded, operation.signal, (processed, total) => {
        if (this.closed || generation !== this.generation) return;
        this.progress = { processed, total }; this.onChange();
      });
      if (this.closed || generation !== this.generation) return;
      this.inventory = inventory; this.stage = "editing";
    } catch { if (!this.closed && generation === this.generation) { this.stage = "error"; this.error = "scan"; } }
    finally { if (!this.closed && generation === this.generation) { this.operation = undefined; this.onChange(); } }
  }
  cancelScan(): void { if (this.stage === "scanning") this.operation?.abort(); }
  review(): void {
    if (this.closed || this.busy) return;
    try { this.reviewed = requireTaxonomyProfile(this.draft); this.stage = "review"; this.error = undefined; }
    catch (error) { this.stage = "error"; this.error = error instanceof TaxonomyError ? error.reason : "invalid"; }
    this.onChange();
  }
  edit(): void { if (this.closed || this.busy) return; this.changed(); this.onChange(); }
  reload(): void {
    if (this.closed || this.busy) return;
    this.base = this.port.get(); this.draft = structuredClone(this.base ?? { version: 1, categories: [] }); this.edit();
  }
  async save(): Promise<void> {
    if (this.closed || this.stage !== "review" || !this.reviewed) return;
    if (JSON.stringify(this.reviewed) !== JSON.stringify(this.draft)) { this.edit(); return; }
    const reviewed = this.reviewed, generation = ++this.generation, operation = new AbortController(); this.operation = operation;
    this.stage = "saving"; this.onChange();
    try {
      await this.port.save(reviewed, this.base, operation.signal);
      if (this.closed || generation !== this.generation) return;
      this.base = structuredClone(reviewed); this.draft = structuredClone(reviewed); this.stage = "saved"; this.reviewed = undefined;
    } catch (error) {
      if (!this.closed && generation === this.generation) { this.stage = "error"; this.error = error instanceof TaxonomyError ? error.reason : "save"; }
    } finally { if (!this.closed && generation === this.generation) { this.operation = undefined; this.onChange(); } }
  }
  close(): void { this.closed = true; this.generation++; this.operation?.abort(); this.onChange = () => {}; this.inventory = undefined; this.reviewed = undefined; }
}
