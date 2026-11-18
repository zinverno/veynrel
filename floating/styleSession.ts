import { callOpenRouter } from "../api";
import { BATCH_PRESETS, MAX_TOKENS_BATCH, STREAM_CONTEXT_MAX_CHARS } from "../constants";
import { t } from "../i18n";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { validateLanguageModelSettings } from "../deep/product/validateLanguageModelSettings";
import { assertSourceProperties } from "../studio/documentEnvelope";
import { preservationChecks, type PreservationChecks } from "../studio/preservationChecks";
import { replaceInEditor } from "../recallEditor";
import type { EditorSource } from "./editorSource";

export type StyleState = "consent" | "generating" | "preview" | "applied" | "conflict" | "error" | "cancelled";
export class StyleSession {
  state: StyleState = "consent";
  draft?: string;
  checks?: PreservationChecks;
  reason?: "source" | "settings" | "limit" | "unsupported" | "format" | "protected" | "request";
  readonly settings: LanguageModelSettingsSnapshot;
  private readonly abort = new AbortController();
  private readonly disconnect: () => void;
  constructor(readonly source: EditorSource, private readonly port: LanguageModelSettingsPort,
    private readonly request = callOpenRouter, changed: () => void = () => {}) {
    this.settings = { ...port.get() };
    this.disconnect = port.subscribe(() => {
      if (this.state === "applied" || this.state === "cancelled") return;
      this.reason = "settings"; this.state = "conflict"; this.abort.abort(); changed();
    });
  }
  private valid(): boolean {
    if (!this.source.current()) { this.reason = "source"; return false; }
    if (JSON.stringify(this.settings) !== JSON.stringify(this.port.get()) || validateLanguageModelSettings(this.settings)) { this.reason = "settings"; return false; }
    if (this.source.mode !== "source" || this.source.ranges.length !== 1) { this.reason = "unsupported"; return false; }
    return !this.abort.signal.aborted;
  }
  async generate(): Promise<void> {
    if (this.state !== "consent") return;
    if (!this.valid()) { this.state = "conflict"; return; }
    const material = this.source.selection || this.source.original;
    if (!material.trim() || material.length > STREAM_CONTEXT_MAX_CHARS) { this.reason = "limit"; this.state = "error"; return; }
    this.state = "generating";
    try {
      if (!await this.source.supportsNativeEdit()) { this.reason = "format"; this.state = "error"; return; }
      if (!this.valid()) { if (!this.abort.signal.aborted) this.state = "conflict"; return; }
      const draft = await this.request(this.settings,
        t("@floating.style-system"), `${t(BATCH_PRESETS[0].prompt)}\n\n${material}`,
        { signal: this.abort.signal, maxTokens: MAX_TOKENS_BATCH, requireFinishReason: true });
      if (this.abort.signal.aborted) return;
      if (!this.valid()) { this.state = "conflict"; return; }
      if (!draft.trim() || draft.length > STREAM_CONTEXT_MAX_CHARS) throw Error("Bounded output required");
      this.draft = draft;
      const next = this.source.original.slice(0, this.source.from) + draft + this.source.original.slice(this.source.to);
      this.checks = preservationChecks(material, draft);
      const reverse = preservationChecks(draft, material);
      const inline = (s: string) => s.match(/`+[^`]*`+/gu) ?? [];
      try {
        assertSourceProperties(this.source.original, next, "replace");
        if (this.checks.coverage === "partial" || reverse.coverage === "partial" ||
          [...this.checks.findings, ...reverse.findings].some(f => f.kind === "code" || f.kind === "link") ||
          JSON.stringify(inline(material)) !== JSON.stringify(inline(draft))) throw Error("Protected Markdown changed");
      } catch { this.reason = "protected"; this.state = "error"; return; }
      this.state = "preview";
    } catch { if (!this.abort.signal.aborted) { this.reason = "request"; this.state = "error"; } }
  }
  apply(): void {
    if (this.state !== "preview" || this.draft === undefined) return;
    if (!this.valid()) { this.state = "conflict"; return; }
    // Fence before dispatch so synchronous editor events cannot apply the response twice.
    this.state = "applied";
    try { replaceInEditor(this.source.editor, this.source.original, this.source.from, this.source.to, this.draft); }
    catch { this.state = "conflict"; this.reason = "source"; }
  }
  cancel(): void { this.disconnect(); this.abort.abort(); if (this.state !== "applied") this.state = "cancelled"; }
}
