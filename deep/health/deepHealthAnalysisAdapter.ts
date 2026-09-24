import type { App, TFile } from "obsidian";
import { DeepAuditEngine } from "../../deepAudit";
import { DEFAULT_SETTINGS } from "../../settings";
import type { AIHubSettings } from "../../settings";
import { collectDeepAuditFiles } from "../deepScope";
import { languageModelSettingsSnapshot } from "../product/languageModelSettingsPort";
import type { LanguageModelSettingsSnapshot } from "../product/languageModelSettingsPort";
import { validateLanguageModelSettings } from "../product/validateLanguageModelSettings";
import { KNOWLEDGE_QUALITY_ANALYZER, DeepHealthAnalysisError } from "../../health/deepHealthAnalysisPort";
import type { DeepHealthAnalysisPort, DeepKnowledgeAnalysis, DeepKnowledgeRevision, DeepKnowledgeConsent } from "../../health/deepHealthAnalysisPort";
import { createFindingFingerprint } from "../../health/domain/identity";
import type { FindingCandidate } from "../../health/domain/finding";
import { isVaultPath, compareStrings } from "../../health/domain/validation";
import { throwIfAborted, withAbort } from "../../health/analyzers/local/cancellation";

export type DeepKnowledgeSettings = LanguageModelSettingsSnapshot & Pick<AIHubSettings, "deepAudit" | "language">;
export interface DeepKnowledgeConfiguration { settings: DeepKnowledgeSettings; revision: number; current: boolean }

export function deepKnowledgeSettingsSnapshot(settings: DeepKnowledgeSettings): DeepKnowledgeSettings {
  return { ...languageModelSettingsSnapshot(settings), language: settings.language, deepAudit: { ...settings.deepAudit } };
}

function vaultRevision(files: TFile[]): string {
  const entries = files.map(({ path, stat }) => {
    if (!isVaultPath(path) || !/\.md$/iu.test(path) || !Number.isFinite(stat.mtime) || !Number.isSafeInteger(stat.size) || stat.size < 0) {
      throw new DeepHealthAnalysisError("deep-vault-changed");
    }
    return [path, stat.mtime, stat.size] as const;
  }).sort((a, b) => compareStrings(a[0], b[0]));
  if (new Set(entries.map(([path]) => path)).size !== entries.length) throw new DeepHealthAnalysisError("deep-vault-changed");
  return JSON.stringify(entries);
}

function draftCandidate(path: string): FindingCandidate {
  const identity = { source: "deep-ai", analyzerId: KNOWLEDGE_QUALITY_ANALYZER.id, dimension: "knowledge", type: "knowledge-draft" } as const;
  return { ...identity, fingerprint: createFindingFingerprint({ ...identity, paths: [path] }),
    impact: "review", confidence: "medium", notePaths: [path],
    title: "Knowledge note may need development",
    explanation: "Deep analysis suggests this note may be incomplete or underdeveloped.",
    evidence: [{ kind: "deep-quality", value: "draft", path }], actions: [{ kind: "open-note", path }] };
}

/** No storage capability: reuse the existing engine without attaching NoteIndexManager. */
export class DeepHealthAnalysisAdapter implements DeepHealthAnalysisPort {
  private readonly revisions = new WeakMap<DeepKnowledgeRevision, { vault: string; configuration: number }>();

  constructor(private readonly app: App, private readonly getConfiguration: () => DeepKnowledgeConfiguration) {}

  getConsent(): DeepKnowledgeConsent | undefined {
    try {
      const { settings, revision, current } = this.getConfiguration();
      if (!current || validateLanguageModelSettings(settings)) return undefined;
      return { configurationRevision: revision, providerKind: settings.provider === "ollama" ? "local" : settings.provider === "custom" ? "custom" : "cloud" };
    } catch { return undefined; }
  }

  async analyzeKnowledge(signal: AbortSignal, consent: DeepKnowledgeConsent): Promise<DeepKnowledgeAnalysis> {
    throwIfAborted(signal);
    let totalFiles: number | undefined;
    try {
      const current = this.getConfiguration();
      const available = this.getConsent();
      if (!available || !consent || available.configurationRevision !== consent.configurationRevision || available.providerKind !== consent.providerKind) {
        throw new DeepHealthAnalysisError("deep-config-changed");
      }
      const settings = deepKnowledgeSettingsSnapshot(current.settings);
      if (validateLanguageModelSettings(settings)) throw new DeepHealthAnalysisError("deep-unavailable");
      const files = collectDeepAuditFiles(this.app);
      totalFiles = files.length;
      const revision = Object.freeze({ token: crypto.randomUUID() });
      this.revisions.set(revision, { vault: vaultRevision(files), configuration: current.revision });
      const engine = new DeepAuditEngine(this.app, { ...DEFAULT_SETTINGS, ...settings }, {
        batchSize: settings.deepAudit.batchSize, maxConcurrent: settings.deepAudit.maxConcurrent,
        delayBetweenBatchesMs: settings.deepAudit.delayMs,
      });
      const abort = (): void => engine.abort();
      signal.addEventListener("abort", abort, { once: true });
      try {
        throwIfAborted(signal);
        const result = await withAbort(engine.runMapOnly(files), signal);
        await this.verifyCurrent(revision, signal);
        return { revision, candidates: result.summaries.filter((summary) => summary.quality === "draft").map((summary) => draftCandidate(summary.path)),
          totalFiles: result.totalFiles, analyzedFiles: result.analyzedFiles, complete: result.complete };
      } finally { signal.removeEventListener("abort", abort); }
    } catch (error) {
      if (signal.aborted) throw new DeepHealthAnalysisError("deep-cancelled", totalFiles);
      if (error instanceof DeepHealthAnalysisError) throw new DeepHealthAnalysisError(error.code, totalFiles);
      throw new DeepHealthAnalysisError("deep-analysis-failed", totalFiles);
    }
  }

  verifyCurrent(revision: DeepKnowledgeRevision, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const expected = this.revisions.get(revision);
    const current = this.getConfiguration();
    if (!expected || !current.current || current.revision !== expected.configuration) throw new DeepHealthAnalysisError("deep-config-changed");
    try {
      if (vaultRevision(collectDeepAuditFiles(this.app)) !== expected.vault) throw new DeepHealthAnalysisError("deep-vault-changed");
    } catch { throw new DeepHealthAnalysisError("deep-vault-changed"); }
    throwIfAborted(signal);
    return Promise.resolve();
  }
}
