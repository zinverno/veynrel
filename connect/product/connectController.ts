import { CompanionClientError } from "../../companionSync/errors";
import { DEFAULT_COMPANION_SETTINGS, isLocalCompanionEndpoint, validateCompanionSettings } from "../../companionSync/settings";
import type { CompanionSettings } from "../../companionSync/types";
import type { ConnectDraft, ConnectError, ConnectOperation, ConnectPort, ConnectResult, ConnectSnapshot, ConnectSyncConfirmation } from "../../health/connectPort";
import type { CompanionSettingsPort } from "./companionSettingsPort";
import { companionConfigurationSignature as signature } from "./companionSettingsPort";
import type { ConnectEnginePort } from "./connectEnginePort";

function safeError(code?: string): ConnectError {
  if (code === "CONFIGURATION_ERROR") return "invalid";
  if (code === "AUTH_REQUIRED") return "authentication";
  if (code === "PROTOCOL_VERSION_MISMATCH") return "protocol";
  if (code === "TIMEOUT" || code === "UNREACHABLE" || code === "ABORTED") return "unreachable";
  return "server";
}

function valid(settings: CompanionSettings): boolean {
  try { validateCompanionSettings(settings); return true; } catch { return false; }
}

/** One plugin-lifetime owner; construction, drafts, confirmation and snapshots are passive. */
export class ConnectController implements ConnectPort {
  private operation?: ConnectOperation;
  private outcome?: { signature: string; error?: ConnectError; lastSuccessAt?: number };
  private readonly listeners = new Set<() => void>();
  private readonly drafts = new WeakMap<ConnectDraft, CompanionSettings>();
  private readonly confirmations = new WeakMap<ConnectSyncConfirmation, { signature: string; revision: number }>();
  private readonly unsubscribe: Array<() => void>;
  private configuration: string;
  private revision = 0;
  private intentRevision = 0;
  private disposed = false;
  private disabling = false;
  private engineStatus: string;

  constructor(private readonly settings: CompanionSettingsPort, private readonly engine: ConnectEnginePort) {
    this.configuration = signature(settings.get());
    this.engineStatus = JSON.stringify(engine.getStatus());
    this.unsubscribe = [settings.subscribe(() => {
      const next = signature(settings.get());
      if (next !== this.configuration) { this.configuration = next; this.revision++; this.outcome = undefined; }
      this.emit();
    }), engine.subscribeStatus(() => {
      const next = JSON.stringify(engine.getStatus());
      if (next !== this.engineStatus) { this.engineStatus = next; this.outcome = undefined; }
      this.emit();
    })];
  }

  getSnapshot(): ConnectSnapshot {
    const current = this.settings.get();
    const configured = valid(current);
    const status = this.engine.getStatus();
    const outcome = this.outcome?.signature === signature(current) ? this.outcome : undefined;
    const semantic = this.engine.getSemanticMirrorState();
    const operation = this.disabling ? "disable" : this.operation ?? (status.kind === "syncing" ? status.operation ?? "sync" : undefined);
    const error = outcome?.error ?? (status.kind === "error" && !outcome ? safeError(status.code) : undefined);
    // Origin only: URL paths, userinfo, query strings and fragments are never a status label.
    let endpointLabel = configured ? new URL(current.endpoint).origin : "";
    if (current.token) endpointLabel = endpointLabel.split(current.token).join("…");
    return {
      state: !current.enabled ? "disabled" : !configured ? "unconfigured" : operation === "sync" ? "syncing"
        : error ? "error" : outcome || status.kind === "ready" ? "ready" : "configured",
      enabled: current.enabled, busy: Boolean(operation), operation,
      local: isLocalCompanionEndpoint(current.endpoint), endpointLabel: endpointLabel.slice(0, 200),
      semanticEnabled: semantic.enabled, semanticReady: semantic.cachedReady,
      mirrorKnownReady: current.enabled && Boolean(status.mirrorKnownReady),
      lastSuccessAt: outcome?.lastSuccessAt ?? status.lastSuccessAt, error,
    };
  }

  createDraft(mode: ConnectDraft["mode"]): ConnectDraft {
    const current = this.settings.get();
    const same = isLocalCompanionEndpoint(current.endpoint) === (mode === "local");
    const draft = { mode, endpoint: same ? current.endpoint : mode === "local" ? DEFAULT_COMPANION_SETTINGS.endpoint : "",
      token: same ? current.token : "" };
    this.drafts.set(draft, current);
    return draft;
  }

  async connect(draft: ConnectDraft): Promise<ConnectResult> {
    if (this.disposed || this.getSnapshot().busy) return { ok: false, reason: "busy" };
    const previous = this.settings.get();
    const origin = this.drafts.get(draft);
    if (origin && signature(origin) !== signature(previous)) return { ok: false, reason: "changed" };
    const candidate = { ...previous, enabled: true, endpoint: draft.endpoint.trim(), token: draft.token.trim() };
    if (!valid(candidate) || isLocalCompanionEndpoint(candidate.endpoint) !== (draft.mode === "local")) return { ok: false, reason: "invalid" };
    const revision = this.revision;
    const intent = this.intentRevision;
    this.operation = "connect"; this.emit();
    try {
      try { await this.engine.test(candidate); }
      catch (error) { return { ok: false, reason: safeError(error instanceof CompanionClientError ? error.code : undefined) }; }
      if (this.disposed || revision !== this.revision || intent !== this.intentRevision) return { ok: false, reason: "changed" };
      try {
        const saved = await this.settings.update(candidate, previous);
        if (this.disposed || intent !== this.intentRevision || signature(saved) !== signature(candidate)) return { ok: false, reason: "changed" };
        this.outcome = { signature: signature(candidate), lastSuccessAt: Date.now() };
        return { ok: true };
      } catch { return { ok: false, reason: "save" }; }
    } finally { this.operation = undefined; this.emit(); }
  }

  async check(): Promise<ConnectResult> {
    const current = this.settings.get();
    if (!current.enabled || !valid(current)) return { ok: false, reason: "invalid" };
    return this.run("check", async () => { await this.engine.test(current); return { ok: true }; });
  }

  createSyncConfirmation(): ConnectSyncConfirmation | undefined {
    const snapshot = this.getSnapshot();
    if (this.disposed || !snapshot.enabled || snapshot.state === "unconfigured" || snapshot.busy) return undefined;
    const confirmation = { local: snapshot.local, endpointLabel: snapshot.endpointLabel };
    this.confirmations.set(confirmation, { signature: signature(this.settings.get()), revision: this.revision });
    return confirmation;
  }

  async sync(confirmation: ConnectSyncConfirmation): Promise<ConnectResult> {
    const origin = this.confirmations.get(confirmation);
    this.confirmations.delete(confirmation);
    if (!origin || origin.signature !== signature(this.settings.get()) || origin.revision !== this.revision) return { ok: false, reason: "changed" };
    return this.run("sync", async () => {
      const result = await this.engine.syncCurrent();
      return result === "synced" ? { ok: true } : { ok: false, reason: result === "semantic-required" ? "semantic-required" : "changed" };
    });
  }

  async disable(): Promise<ConnectResult> {
    // Disabling must remain possible during a queued/background sync.
    if (this.disabling || this.disposed) return { ok: false, reason: "busy" };
    this.intentRevision++; this.disabling = true; this.emit();
    // Apply only enabled inside the shared queue, including after an already-issued candidate save.
    try { await this.settings.update({ enabled: false }); return { ok: true }; }
    catch { return { ok: false, reason: "save" }; }
    finally { this.disabling = false; this.emit(); }
  }

  openProposalReview(): void {
    const current = this.settings.get();
    if (!this.disposed && current.enabled && valid(current)) this.engine.openProposalReview();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  dispose(): void { this.disposed = true; this.unsubscribe.forEach((remove) => remove()); this.listeners.clear(); }

  private async run(operation: "check" | "sync", work: () => Promise<ConnectResult>): Promise<ConnectResult> {
    if (this.disposed || this.getSnapshot().busy) return { ok: false, reason: "busy" };
    const identity = signature(this.settings.get()); const revision = this.revision;
    this.operation = operation; this.emit();
    try {
      let result: ConnectResult;
      try { result = await work(); }
      catch (error) { result = { ok: false, reason: safeError(error instanceof CompanionClientError ? error.code : undefined) }; }
      if (this.disposed || revision !== this.revision || identity !== signature(this.settings.get())) return { ok: false, reason: "changed" };
      // An absent index is a mirror prerequisite, not evidence of a connection failure.
      if (result.ok || result.reason !== "semantic-required") {
        this.outcome = { signature: identity, ...(result.ok ? { lastSuccessAt: Date.now() } : { error: result.reason }) };
      }
      return result;
    } finally { this.operation = undefined; this.emit(); }
  }
  private emit(): void {
    for (const listener of this.listeners) { try { listener(); } catch { /* View failures cannot fail work. */ } }
  }
}
