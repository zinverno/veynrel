import { ensure } from "./recipe";

/** One plugin-scoped gate, including Markdown Apply/Undo and diagram operations. */
export class StudioOperations {
  private owner?: object;
  private depth = 0;
  private closed = false;
  private listeners = new Set<() => void>();
  get busy(): boolean { return !!this.owner; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(): void { for (const fn of this.listeners) { try { fn(); } catch { /* UI cannot own the gate. */ } } }
  async run<T>(owner: object, work: () => Promise<T>): Promise<T> {
    ensure(!this.closed, "cancelled"); ensure(!this.owner || this.owner === owner, "busy");
    this.owner = owner; this.depth++; this.emit();
    try { return await work(); }
    finally { if (--this.depth === 0) this.owner = undefined; this.emit(); }
  }
  dispose(): void { this.closed = true; this.listeners.clear(); }
}
