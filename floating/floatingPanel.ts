import { View, MarkdownView, setIcon, setTooltip, type App, type Modal, type WorkspaceLeaf } from "obsidian";
import { t, currentLanguage } from "../i18n";
import { captureEditorSource, type EditorSource } from "./editorSource";

export interface FloatingPreferences { enabled: boolean; x: number; y: number }
export function floatingPreferences(value?: Partial<FloatingPreferences>): FloatingPreferences {
  const coordinate = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  return { enabled: value?.enabled === true, x: coordinate(value?.x), y: coordinate(value?.y) };
}
export type FloatingAction = "style" | "recall" | "tag" | "atomize" | "search";
interface Host {
  preferences(): FloatingPreferences;
  save(value: FloatingPreferences): Promise<void>;
  launch(action: FloatingAction, source: EditorSource, origin: HTMLElement): Modal | undefined;
}
const actions: readonly [FloatingAction, string, string][] = [
  ["style", "sparkles", "Улучшить стиль"], ["recall", "layers", "@floating.cards"],
  ["tag", "tag", "@floating.tag"], ["atomize", "split", "@floating.atomize"], ["search", "search", "@floating.search"],
];

/** One transient toolbar per owning document; no polling or vault IO. */
class DocumentPanel {
  readonly element: HTMLElement;
  private readonly grip: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly context: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly controls: HTMLButtonElement[] = [];
  private source?: EditorSource;
  private leaf?: WorkspaceLeaf;
  private modal?: Modal;
  private alive = true;
  private expanded = false;
  private position: FloatingPreferences;
  private drag?: { id: number; x: number; y: number; left: number; top: number };
  private readonly cleanup: (() => void)[] = [];
  constructor(private readonly app: App, readonly document: Document, private readonly host: Host) {
    this.position = { ...host.preferences() };
    this.element = document.body.createDiv({ cls: "veynrel-floating", attr: { role: "region", "aria-label": t("@floating.title") } });
    this.grip = this.button(this.element, "grip-vertical", "@floating.move", "grip", () => {});
    this.toggle = this.button(this.element, "sparkles", "@floating.expand", "toggle", () => this.expand(!this.expanded));
    this.body = this.element.createDiv({ cls: "veynrel-floating-body" });
    const toolbar = this.body.createDiv({ cls: "veynrel-floating-actions", attr: { role: "toolbar", "aria-label": t("@floating.title") } });
    for (const [id, icon, label] of actions) {
      const button = this.button(toolbar, icon, label, id, () => this.launch(id, button)); this.controls.push(button);
    }
    this.button(toolbar, "ellipsis", "@floating.more", "more", () => { this.menu.hidden = !this.menu.hidden; if (!this.menu.hidden) this.menu.querySelector<HTMLElement>("button")?.focus(); this.clamp(); });
    this.button(toolbar, "chevron-left", "@floating.collapse", "collapse", () => this.expand(false));
    this.context = this.body.createDiv({ cls: "veynrel-floating-context", attr: { role: "status" } });
    this.menu = this.body.createDiv({ cls: "veynrel-floating-menu" }); this.menu.hidden = true;
    this.button(this.menu, "rotate-ccw", "@floating.reset", "reset", () => this.reset());
    this.button(this.menu, "eye-off", "@floating.hide", "hide", () => { void host.save({ ...host.preferences(), enabled: false }); });
    const on = <K extends keyof DocumentEventMap>(target: Document, type: K, callback: (e: DocumentEventMap[K]) => void) => {
      target.addEventListener(type, callback, true); this.cleanup.push(() => target.removeEventListener(type, callback, true));
    };
    on(document, "pointerdown", event => {
      if (this.element.contains(event.target as Node)) { this.capture(); event.preventDefault(); }
      else if (!(event.target as Element)?.closest?.(".modal-container")) {
        const container = (event.target as Element)?.closest?.(".workspace-leaf");
        if (container) app.workspace.iterateAllLeaves(leaf => { if (leaf.view.containerEl.closest(".workspace-leaf") === container) this.leaf = leaf; });
        this.capture();
      }
    });
    on(document, "selectionchange", () => { if (!this.drag && !this.element.contains(document.activeElement) && !document.querySelector(".modal-container")) this.capture(); });
    on(document, "focusin", () => { if (!this.element.contains(document.activeElement) && !document.querySelector(".modal-container")) this.capture(); });
    this.grip.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault(); const rect = this.element.getBoundingClientRect();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      this.grip.setPointerCapture(event.pointerId); this.element.addClass("is-dragging");
    });
    this.grip.addEventListener("pointermove", event => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.place(this.drag.left + event.clientX - this.drag.x, this.drag.top + event.clientY - this.drag.y);
    });
    const end = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.drag = undefined; this.element.removeClass("is-dragging");
      if (this.grip.hasPointerCapture(event.pointerId)) this.grip.releasePointerCapture(event.pointerId);
      this.persist();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) this.grip.addEventListener(type, end);
    this.element.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); if (!this.menu.hidden) { this.menu.hidden = true; this.element.querySelector<HTMLElement>("[data-floating=more]")?.focus(); } else this.expand(false); }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (event.target === this.grip && (arrows[event.key] || event.key === "Home")) {
        event.preventDefault(); if (event.key === "Home") this.reset();
        else { const rect = this.element.getBoundingClientRect(), step = event.shiftKey ? 40 : 10, [x, y] = arrows[event.key]; this.place(rect.left + x * step, rect.top + y * step); this.persist(); }
      } else if (arrows[event.key] && toolbar.contains(event.target as Node)) {
        event.preventDefault(); const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const next = (buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length; buttons[next]?.focus();
      }
    });
    const win = document.defaultView!;
    win.addEventListener("resize", this.clamp); win.visualViewport?.addEventListener("resize", this.clamp);
    this.cleanup.push(() => { win.removeEventListener("resize", this.clamp); win.visualViewport?.removeEventListener("resize", this.clamp); });
    const observer = new win.MutationObserver(() => {
      const blocked = !!document.querySelector(".modal-container");
      if (this.element.inert !== blocked) { this.element.inert = blocked; this.element.toggleClass("is-modal-blocked", blocked); }
    });
    observer.observe(document.body, { childList: true, subtree: true }); this.cleanup.push(() => observer.disconnect());
    const resize = new win.ResizeObserver(() => this.clamp()); resize.observe(this.element); this.cleanup.push(() => resize.disconnect());
    this.expand(false); this.updateLeaf(app.workspace.getActiveViewOfType(View)?.leaf);
  }
  private button(parent: HTMLElement, icon: string, label: string, id: string, run: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": t(label), "data-floating": id } });
    setTooltip(button, t(label));
    setIcon(button.createSpan({ attr: { "aria-hidden": "true" } }), icon);
    button.createSpan({ text: t(label), cls: "veynrel-floating-label" }); button.addEventListener("click", () => { if (this.alive) run(); }); return button;
  }
  updateLeaf(leaf?: WorkspaceLeaf): void {
    if (leaf?.view.containerEl.ownerDocument === this.document) this.leaf = leaf;
    this.capture();
  }
  private capture(): void {
    if (!this.alive || this.document.querySelector(".modal-container")) return;
    this.source = captureEditorSource(this.app, this.leaf, this.document, () => this.alive && this.host.preferences().enabled);
    const source = this.source;
    this.context.setText(source ? `${source.path} · ${t(source.selection ? "@floating.selection" : "@floating.whole")}${source.ranges.length !== 1 ? " · " + t("@floating.one-range") : source.mode !== "source" ? " · " + t("@floating.read-mode") : ""}` : t("@floating.no-source"));
    for (const button of this.controls) button.disabled = !source || source.ranges.length !== 1 || (button.dataset.floating === "style" || button.dataset.floating === "recall") && source.mode !== "source";
  }
  private launch(action: FloatingAction, origin: HTMLElement): void {
    const source = this.source;
    if (!source || !source.current() || source.ranges.length !== 1 || this.document.querySelector(".modal-container")) { this.capture(); return; }
    this.modal = this.host.launch(action, source, origin);
  }
  private expand(open: boolean): void {
    this.expanded = open; this.body.hidden = !open; this.toggle.hidden = open; this.menu.hidden = true;
    this.element.toggleClass("is-expanded", open); this.toggle.setAttribute("aria-expanded", String(open)); this.clamp();
    if (!open && this.element.contains(this.document.activeElement)) this.toggle.focus();
  }
  private bounds(): { left: number; top: number; width: number; height: number } {
    const win = this.document.defaultView!, viewport = win.visualViewport;
    const root = this.document.querySelector(".workspace-split.mod-root") ?? this.document.querySelector(".workspace");
    const workspace = root?.getBoundingClientRect();
    const tabs = root?.querySelector(".workspace-tab-header-container")?.getBoundingClientRect();
    const status = this.document.querySelector(".status-bar")?.getBoundingClientRect();
    const left = Math.max(viewport?.offsetLeft ?? 0, workspace?.left ?? 0) + 8, top = Math.max(viewport?.offsetTop ?? 0, tabs?.bottom ?? workspace?.top ?? 0) + 8;
    const right = Math.min((viewport?.offsetLeft ?? 0) + (viewport?.width ?? win.innerWidth), workspace?.right ?? win.innerWidth) - 8;
    const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight), workspace?.bottom ?? win.innerHeight, status?.height ? status.top : win.innerHeight) - 8;
    this.element.style.maxWidth = `${Math.max(0, right - left)}px`;
    this.element.style.maxHeight = `${Math.max(0, bottom - top)}px`;
    return { left, top, width: Math.max(0, right - left - this.element.offsetWidth), height: Math.max(0, bottom - top - this.element.offsetHeight) };
  }
  private place(left: number, top: number): void {
    const b = this.bounds(); left = Math.max(b.left, Math.min(b.left + b.width, left)); top = Math.max(b.top, Math.min(b.top + b.height, top));
    this.element.style.left = `${left}px`; this.element.style.top = `${top}px`;
    this.position = { ...this.position, x: b.width ? (left - b.left) / b.width : 0, y: b.height ? (top - b.top) / b.height : 0 };
  }
  private clamp = (): void => { if (!this.alive) return; const b = this.bounds(); this.place(b.left + b.width * this.position.x, b.top + b.height * this.position.y); };
  private persist(): void { void this.host.save({ ...this.host.preferences(), x: this.position.x, y: this.position.y }); }
  reset(): void { this.position = { ...this.position, x: 1, y: 1 }; this.clamp(); this.persist(); }
  dispose(): void { this.alive = false; this.modal?.close(); this.cleanup.forEach(f => f()); this.element.remove(); this.source = undefined; }
}

export class FloatingActions {
  private language = currentLanguage();
  private readonly panels = new Map<Document, DocumentPanel>();
  private readonly documents = new Set<Document>();
  private readonly cleanup: (() => void)[] = [];
  constructor(private readonly app: App, private readonly host: Host) {
    this.documents.add(document);
    app.workspace.iterateAllLeaves(leaf => { this.documents.add(leaf.view.containerEl.ownerDocument); });
    const refs = [app.workspace.on("window-open", (_workspace, win) => { this.documents.add(win.document); this.refresh(); }),
      app.workspace.on("window-close", (_workspace, win) => { this.panels.get(win.document)?.dispose(); this.panels.delete(win.document); this.documents.delete(win.document); }),
      app.workspace.on("active-leaf-change", leaf => { for (const panel of this.panels.values()) panel.updateLeaf(leaf ?? undefined); }),
      app.workspace.on("file-open", () => { for (const panel of this.panels.values()) panel.updateLeaf(app.workspace.getActiveViewOfType(View)?.leaf); }),
      app.workspace.on("layout-change", () => { for (const panel of this.panels.values()) panel.updateLeaf(app.workspace.getActiveViewOfType(View)?.leaf); }),
      app.workspace.on("editor-change", (_editor, info) => { for (const panel of this.panels.values()) if (info instanceof MarkdownView && info.containerEl.ownerDocument === panel.document) panel.updateLeaf(app.workspace.getActiveViewOfType(View)?.leaf); })];
    this.cleanup.push(() => refs.forEach(ref => app.workspace.offref(ref))); this.refresh();
  }
  refresh(): void {
    if (this.language !== currentLanguage()) { for (const panel of this.panels.values()) panel.dispose(); this.panels.clear(); this.language = currentLanguage(); }
    for (const doc of this.documents) {
      if (!this.host.preferences().enabled || doc.defaultView?.closed) { this.panels.get(doc)?.dispose(); this.panels.delete(doc); }
      else if (!this.panels.has(doc)) this.panels.set(doc, new DocumentPanel(this.app, doc, this.host));
    }
  }
  reset(): void { for (const panel of this.panels.values()) panel.reset(); }
  dispose(): void { this.cleanup.forEach(f => f()); for (const panel of this.panels.values()) panel.dispose(); this.panels.clear(); this.documents.clear(); }
}
