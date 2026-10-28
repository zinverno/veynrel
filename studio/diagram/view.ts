import type { StudioWorkspace } from "../registerStudio";
import { l, status } from "../messages";
import { button, field, literal, select, disclosure, toolbar, notePicker, connectionSummary } from "../ui";
import { capabilityMessage, diagramError, diagramStatus } from "./messages";
import { diagramPreview } from "./preview";
import { illustration } from "../illustrations";
import type { DiagramKind } from "./spec";
import type { DiagramOptions } from "./layout";
import type { DiagramProposal } from "./workflow";

let nextPanelId = 0;
type Confirm = (title: string, description: string, action: string, work: () => Promise<unknown>, closed?: () => void) => void;
export class DiagramPanel {
  private readonly radioGroup = `studio-diagram-${++nextPanelId}`;
  private setup = false;
  private kind: DiagramKind = "structure";
  private source = "";
  private target = "";
  private picker = { chosen: new Set<string>(), query: "" };
  private reviewDraft?: { proposal: DiagramProposal; options: DiagramOptions; target: string };
  private preview?: { plan: DiagramProposal["plan"]; element: HTMLElement };
  private context = "32768";
  private options: DiagramOptions = { direction: "down", theme: "neutral" };
  private alive = true;
  constructor(private readonly owner: StudioWorkspace, private readonly renderAgain: () => void, private readonly run: (work: () => Promise<unknown>) => void, private readonly confirm: Confirm) {}
  dispose(): void { this.alive = false; }
  private mode(kind: DiagramKind): string { return kind === "structure" ? l("Concepts & connections", "Связи и понятия") : l("Process steps", "Шаги процесса"); }
  private parameters(root: HTMLElement, options: DiagramOptions): { direction: HTMLSelectElement; theme: HTMLSelectElement } {
    return {
      direction: select(root, l("Direction", "Направление"), [["down", l("Top to bottom", "Сверху вниз")], ["right", l("Left to right", "Слева направо")]], options.direction),
      theme: select(root, l("Appearance", "Оформление"), [["neutral", l("Neutral", "Нейтральное")], ["amethyst", "Graphite & Amethyst"]], options.theme),
    };
  }
  render(root: HTMLElement): void {
    const workflow = this.owner.diagrams, capability = workflow.adapter.capability();
    if (!workflow.proposal || this.setup) root.createEl("h2", { text: l("Create diagram", "Создать схему") });
    if (!workflow.proposal && !workflow.result) root.createEl("p", { text: l("Turn one saved note into an editable drawing. Up to 30 nodes / 60 connections.", "Превратите сохранённую заметку в редактируемый рисунок. До 30 узлов / 60 связей.") });
    if (capability.state !== "ready") root.createEl("p", { text: capabilityMessage(capability), attr: { role: "status" } });
    if (workflow.error) root.createEl("p", { text: diagramError(workflow.error), attr: { role: "alert" } });
    if (workflow.running) {
      root.createEl("p", { text: status(workflow.state) });
      button(root, l("Stop subsequent actions", "Остановить последующие действия"), "diagram-cancel", () => workflow.cancel());
      root.createEl("p", { text: l("An issued provider request cannot be recalled and may still be charged. Closing this tab keeps the shared operation available in Studio.", "Отправленный запрос нельзя отозвать у провайдера; он всё ещё может быть оплачен. Закрытие вкладки сохраняет общую операцию в Studio.") }); return;
    }
    if (!this.setup && workflow.prepared && workflow.state === "prepared") {
      const p = workflow.prepared;
      root.createEl("h3", { text: l("Consent to send data", "Согласие на передачу данных") });
      root.createEl("p", { text: `${p.provider} · ${p.model} · ${p.endpoint}` });
      root.createEl("p", { text: `${this.mode(p.kind)} · ${p.path} → ${p.target}` });
      root.createEl("p", { text: l("The full saved note and the exact instructions below go to this endpoint. A cloud provider receives the text and may charge. No linked notes are read. No truncation or automatic JSON repair.", "Полный сохранённый текст и точные инструкции ниже будут переданы на этот адрес. Облачный провайдер получит текст и может взимать плату. Связанные заметки не читаются. Обрезки и автоматического исправления JSON нет.") });
      root.createEl("p", { text: `${l("Conservative token allowance / context budget", "Консервативный резерв токенов / бюджет контекста")}: ${p.conservativeTokens} / ${p.contextTokens}` });
      literal(root, l("Exact outgoing JSON body", "Точное отправляемое тело JSON"), p.body);
      button(root, l("I agree — generate diagram", "Согласен — сгенерировать схему"), "diagram-generate", () => this.run(() => workflow.generate(p))).disabled = this.owner.operations.busy || ["unavailable", "incompatible"].includes(capability.state);
      button(root, l("Cancel without sending", "Отменить без отправки"), "diagram-cancel", () => workflow.cancel()); return;
    }
    if (!this.setup && workflow.result) {
      const r = workflow.result;
      root.createEl("p", { text: `${diagramStatus(r.state)} · ${r.target}`, attr: { role: "status" } });
      if (r.reason) root.createEl("p", { text: diagramError(r.reason) });
      if (r.state === "created") button(root, l("Open in Excalidraw", "Открыть в Excalidraw"), "diagram-open", () => this.run(() => workflow.open(r.id)));
      this.independent(root);
    } else if (!this.setup && workflow.proposal) this.review(root, workflow.proposal);
    if (!this.setup && (workflow.proposal || workflow.result)) {
      button(root, l("Prepare a new diagram", "Подготовить новую схему"), "diagram-new", () => { this.setup = true; this.renderAgain(); }); return;
    }
    const refresh = button(root, l("Refresh availability", "Обновить доступность"), "diagram-refresh", this.renderAgain);
    const blocked = ["unavailable", "incompatible", "busy"].includes(capability.state);
    const form = blocked ? disclosure(root, l("Saved draft · resolve availability first", "Черновик · сначала проверьте доступность")) : root;
    notePicker(form, this.owner.inventory().filter(p => !p.endsWith(".excalidraw.md")), this.picker, 1, () => { this.source = [...this.picker.chosen][0] ?? ""; }, true);
    const modes = form.createEl("fieldset", { cls: "veynrel-studio-modes" }); modes.createEl("legend", { text: l("Result structure · illustration", "Структура результата · пример") });
    for (const value of ["structure", "flowchart"] as const) {
      const label = modes.createEl("label", { cls: "veynrel-studio-mode" });
      const input = label.createEl("input", { type: "radio", attr: { name: this.radioGroup, value, "data-studio-key": `diagram-kind-${value}` } }); input.checked = this.kind === value;
      label.createSpan({ text: this.mode(value) }); illustration(label, value);
      input.addEventListener("change", () => { if (input.checked) this.kind = value; });
    }
    const destination = toolbar(form);
    const folder = select(destination, l("Existing destination folder", "Существующая папка назначения"), [["", l("Vault root", "Корень хранилища")], ...this.owner.folders().filter(p => p !== "/" && p !== "").map(p => [p, p] as [string, string])], this.target.includes("/") ? this.target.slice(0, this.target.lastIndexOf("/")) : "");
    const name = field(destination, l("Drawing name", "Имя рисунка"), this.target.split("/").pop()?.replace(/\.excalidraw\.md$/u, "") ?? ""); name.setAttribute("data-diagram-field", "name");
    const target = form.createEl("p", { cls: "veynrel-studio-destination", attr: { "data-diagram-field": "target", "aria-live": "polite" } });
    const updateTarget = () => { this.target = `${folder.value ? `${folder.value}/` : ""}${name.value}.excalidraw.md`; target.setText(this.target); };
    folder.addEventListener("change", updateTarget); name.addEventListener("input", updateTarget); updateTarget();
    const advanced = disclosure(form, l("Advanced · direction, appearance, context", "Дополнительно · направление, оформление, контекст"));
    if (!blocked) advanced.append(refresh);
    const { direction, theme } = this.parameters(advanced, this.options);
    direction.addEventListener("change", () => { this.options.direction = direction.value as DiagramOptions["direction"]; });
    theme.addEventListener("change", () => { this.options.theme = theme.value as DiagramOptions["theme"]; });
    const context = field(advanced, l("Context budget verified for your model (tokens)", "Проверенный бюджет контекста модели (токены)"), this.context);
    context.setAttribute("type", "number"); context.addEventListener("input", () => { this.context = context.value; });
    advanced.createEl("p", { text: l("Keep the verified model limit. No silent truncation.", "Укажите проверенный лимит модели. Скрытой обрезки нет.") });
    advanced.createEl("p", { text: l("Keep the source editor open if it is saved. Unsaved or unverifiable buffers block sending. The destination folder must already exist.", "Сохранённый исходник можно оставить открытым. Несохранённый или непроверяемый буфер блокирует отправку. Папка назначения должна уже существовать.") });
    connectionSummary(form, this.owner.connection());
    button(form, l("Read note & review request", "Прочитать заметку и проверить запрос"), "diagram-prepare", () => {
      this.setup = false; this.run(() => workflow.prepare(this.kind, this.source, this.target, this.options, Number(this.context)));
    }).disabled = this.owner.operations.busy || ["unavailable", "incompatible"].includes(capability.state);
  }
  private independent(root: HTMLElement): void {
    root.createEl("p", { text: l("This is an independent drawing. The source note was not changed and needs no rollback. Drawings have no automatic deletion or Undo.", "Это самостоятельный рисунок. Исходник не изменён, откат ему не нужен. Автоматического удаления и Undo рисунков нет.") });
  }
  private review(root: HTMLElement, proposal: DiagramProposal): void {
    const workflow = this.owner.diagrams, p = proposal;
    if (this.reviewDraft?.proposal !== p) this.reviewDraft = { proposal: p, options: { ...p.plan.layout.options }, target: p.target };
    const draft = this.reviewDraft;
    root.createEl("h2", { text: l("Review before creating", "Проверка перед созданием") });
    root.createEl("p", { text: `${this.mode(p.spec.kind)} · ${p.source} → ${p.target}` });
    root.createEl("p", { text: `${p.spec.nodes.length} ${l("nodes", "узлов")} · ${p.spec.edges.length} ${l("connections", "связей")}. ${l("Check labels and connections against the source; structure validation does not prove truth.", "Сверьте подписи и связи с исходником: проверка структуры не доказывает истинность.")}` });
    const actions = toolbar(root);
    const stage = root.createDiv({ cls: "veynrel-studio-diagram-stage" });
    if (!this.preview || this.preview.plan !== p.plan) {
      const element = root.createDiv({ cls: "veynrel-studio-canvas" });
      diagramPreview(element, p.plan.layout); this.preview = { plan: p.plan, element };
    }
    stage.append(this.preview.element);
    const inspector = disclosure(stage, l("Inspect graph & technical details", "Структура и технические данные"));
    const list = disclosure(inspector, l("Nodes and connections", "Узлы и связи"));
    const nodes = list.createEl("ul"); for (const n of p.spec.nodes) nodes.createEl("li", { text: `${n.id}: ${n.label} (${n.shape})` });
    const edges = list.createEl("ul"); for (const e of p.spec.edges) edges.createEl("li", { text: `${e.from} → ${e.to}${e.label ? `: ${e.label}` : ""}` });
    inspector.createEl("p", { text: l("Edge crossings are possible. Model markup stays inert. Third-party Excalidraw hooks may run when you open the drawing.", "Возможны пересечения рёбер. Модельная разметка инертна. При открытии могут работать сторонние hooks Excalidraw.") });
    literal(inspector, "DiagramSpec v1", JSON.stringify(p.spec, null, 2));
    const controls = toolbar(disclosure(inspector, l("Direction & appearance", "Направление и оформление")));
    const { direction, theme } = this.parameters(controls, draft.options);
    const target = field(inspector, l("Exact target path", "Точный целевой путь"), draft.target);
    const update = button(controls, l("Update preview locally", "Обновить предпросмотр локально"), "diagram-revise", () => this.run(() => workflow.revise(p, { direction: direction.value as DiagramOptions["direction"], theme: theme.value as DiagramOptions["theme"] }, target.value)));
    update.disabled = !workflow.canCreate;
    const create = button(actions, l("Create this drawing…", "Создать этот рисунок…"), "diagram-create-review", () => this.confirm(l("Confirm new drawing", "Подтвердите новый рисунок"),
      `${p.target}\n${l("One new editable Excalidraw drawing. No overwrite, automatic renaming or Undo. The source stays unchanged.", "Один новый редактируемый рисунок Excalidraw. Без перезаписи, автопереименования и Undo. Исходник остаётся неизменным.")}`,
      "diagram-confirm-create", () => workflow.create(p)));
    create.disabled = !workflow.canCreate;
    const dirty = controls.createSpan({ attr: { role: "status" } });
    const invalidate = () => { draft.options = { direction: direction.value as DiagramOptions["direction"], theme: theme.value as DiagramOptions["theme"] }; draft.target = target.value; create.disabled = true; dirty.setText(l("Changed · update preview before creating", "Параметры изменены · обновите предпросмотр")); };
    if (draft.target !== p.target || draft.options.direction !== p.plan.layout.options.direction || draft.options.theme !== p.plan.layout.options.theme) invalidate();
    direction.addEventListener("change", invalidate); theme.addEventListener("change", invalidate); target.addEventListener("input", invalidate);
    button(actions, l("Cancel creation", "Отменить создание"), "diagram-cancel", () => workflow.cancel()); this.independent(root);
  }
  async history(root: HTMLElement, current: () => boolean): Promise<number> {
    const rows = await this.owner.diagrams.history(); if (!this.alive || !current() || !rows.length) return 0;
    root.createEl("h3", { text: l("Diagram history", "История схем") });
    for (const row of rows) {
      const card = root.createEl("article", { cls: "veynrel-studio-card" });
      card.createEl("h4", { text: row.entry.intent?.target ?? row.entry.id }); card.createEl("p", { text: diagramStatus(row.state) });
      if (row.entry.intent) card.createEl("p", { text: `${new Date(row.entry.intent.createdAt).toLocaleString()} · ${row.entry.intent.source.path}` });
      literal(card, l("Creation evidence", "Данные создания"), JSON.stringify({ id: row.entry.id, source: row.entry.intent?.source.path, sourceHash: row.entry.intent?.source.hash,
        receipt: row.entry.receipt, damaged: row.entry.damaged, storage: this.owner.diagrams.journal.root }, null, 2));
      if (row.state === "created") button(card, l("Open drawing", "Открыть рисунок"), "diagram-history-open", () => this.run(() => this.owner.diagrams.open(row.entry.id)));
      if (row.recovery) button(card, l("Review observed outcome", "Проверить наблюдаемый исход"), "diagram-recovery", () => this.run(async () => {
        const ticket = await this.owner.diagrams.reviewRecovery(row.entry.id);
        if (!this.alive) { this.owner.diagrams.discardRecovery(ticket); return; }
        this.confirm(l("Record verified outcome", "Зафиксировать проверенный исход"), `${ticket.target}: ${diagramStatus(ticket.state)}\n${l("Records evidence only. No creation, deletion or model request.", "Только фиксация данных. Без создания, удаления и запроса к модели.")}`,
          "diagram-confirm-recovery", () => this.owner.diagrams.recover(ticket), () => this.owner.diagrams.discardRecovery(ticket));
      }));
    }
    return rows.length;
  }
}
