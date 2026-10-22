export type ReviewPaths = readonly [string, string];
export interface ReviewOperation { id: string; paths: readonly string[]; created: number; state: string; operation: string }
export interface ReviewFact {
  state: "checking" | "ready" | "unknown" | "missing";
  links?: readonly [boolean, boolean]; changed?: boolean; kept?: boolean; operation?: ReviewOperation; historyUnknown?: boolean;
}
export interface ReviewFactsPort {
  get(paths: ReviewPaths): ReviewFact | undefined;
  track(pairs: readonly ReviewPaths[]): void;
  refresh(): void;
  reopen(paths: ReviewPaths): void;
  dispose(): void;
}
interface Observation { signatures: readonly string[]; links?: readonly [boolean, boolean]; missing?: boolean; kept?: boolean }
export interface ReviewFactsDependencies {
  read(paths: ReviewPaths): Promise<Observation>;
  history(): Promise<readonly ReviewOperation[]>;
  reopen?(paths: ReviewPaths): void;
  subscribe(changed: (paths?: readonly string[]) => void): () => void;
}
const key = (paths: ReviewPaths) => JSON.stringify(paths);
/** Bounded visible pairs; no semantic computation and no write authority. */
export class ReviewFacts implements ReviewFactsPort {
  private entries = new Map<string, { paths: ReviewPaths; fact: ReviewFact; baseline?: readonly string[]; epoch: number }>();
  private dirty = new Set<string>();
  private running = false;
  private disposed = false;
  private readonly remove: () => void;
  constructor(private readonly deps: ReviewFactsDependencies, private readonly changed: () => void) {
    this.remove = deps.subscribe(paths => this.invalidate(paths));
  }
  get(paths: ReviewPaths): ReviewFact | undefined { return this.entries.get(key(paths))?.fact; }
  track(pairs: readonly ReviewPaths[]): void {
    const wanted = new Set(pairs.map(key));
    for (const id of this.entries.keys()) if (!wanted.has(id)) { this.entries.delete(id); this.dirty.delete(id); }
    for (const paths of pairs) if (!this.entries.has(key(paths))) {
      this.entries.set(key(paths), { paths, fact: { state: "checking" }, epoch: 0 }); this.dirty.add(key(paths));
    }
    void this.drain();
  }
  reopen(paths: ReviewPaths): void { this.deps.reopen?.(paths); }
  refresh(): void { this.invalidate(); }
  private invalidate(paths?: readonly string[]): void {
    if (this.disposed) return;
    for (const [id, entry] of this.entries) if (!paths || entry.paths.some(p => paths.some(q => p === q || p.startsWith(q + "/")))) {
      entry.epoch++; entry.fact = { ...entry.fact, state: "checking", links: undefined }; this.dirty.add(id);
    }
    this.changed(); void this.drain();
  }
  private async drain(): Promise<void> {
    if (this.running || this.disposed || !this.dirty.size) return;
    this.running = true;
    try {
      while (this.dirty.size && !this.disposed) {
        const batch = [...this.dirty]; this.dirty.clear();
        let history: readonly ReviewOperation[] | undefined;
        try { history = await this.deps.history(); } catch { /* Preserve facts independently of history availability. */ }
        for (const id of batch) {
          const entry = this.entries.get(id); if (!entry || this.disposed) continue;
          const epoch = entry.epoch;
          let observation: Observation | undefined;
          try { observation = await this.deps.read(entry.paths); } catch { /* Unknown is not an absent link. */ }
          if (this.disposed || this.entries.get(id) !== entry || entry.epoch !== epoch) continue;
          const operation = history?.filter(o => entry.paths.every(p => o.paths.includes(p))).sort((a, b) => b.created - a.created)[0];
          entry.fact = { state: observation?.missing ? "missing" : observation?.links ? "ready" : "unknown",
            links: observation?.links, kept: observation?.kept, changed: entry.fact.changed || !!(entry.baseline && observation && entry.baseline.some((s, i) => s !== observation!.signatures[i])),
            operation: history ? operation : entry.fact.operation, historyUnknown: !history };
          if (observation && !entry.baseline) entry.baseline = observation.signatures;
        }
        if (!this.disposed) this.changed();
      }
    } finally { this.running = false; }
  }
  dispose(): void { this.disposed = true; this.remove(); this.entries.clear(); this.dirty.clear(); }
}
