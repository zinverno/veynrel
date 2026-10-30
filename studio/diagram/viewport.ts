import type { View } from "obsidian";
import type { DiagramEA, NativeElement } from "./adapter";
import { sameScene } from "./adapter";

type State = Record<string, unknown> & { scrollX: number; scrollY: number; zoom: { value: number }; width: number; height: number };
interface CanvasAPI {
  getSceneElements(): NativeElement[];
  getAppState(): State;
  setViewport(options: { target: NativeElement[]; fit: "contain"; offsets: { ui: true }; animation: false }): void;
  onChange(callback: (elements: NativeElement[], state: State) => void): () => void;
}
interface CameraEA extends DiagramEA {
  setView(view: View): unknown;
  getExcalidrawAPI(): CanvasAPI | null;
  registerThisAsViewEA(): boolean;
  clearViewDirty(): void;
  onSceneChangeHook: { trackElements: true; appStateKeys: string[]; callback: (elements: NativeElement[], state: State) => void } | null;
}
interface CameraView extends View {
  contentEl: HTMLElement;
  isDirty(): boolean;
  getHookServer(): object;
  setHookServer(server: object): void;
}
const camera = (s: State) => [s.scrollX, s.scrollY, s.zoom.value].join(",");
const documentState = (s: State) => JSON.stringify([s.viewBackgroundColor, s.theme, s.gridSize, s.gridStep, s.gridModeEnabled,
  s.colorPalette, s.colorTopPicks, s.frameRendering, s.objectsSnapModeEnabled, s.bindingPreference, s.isMidpointSnappingEnabled, s.boxSelectionMode]);

/** 2.29.0 EA scene-ready hook + canvas 0.18.143 UI-aware viewport API. No polling or document mutation. */
export function fitNewDrawing(view: View, factory: DiagramEA, expected: readonly NativeElement[], active: () => boolean): void {
  const v = view as CameraView;
  if (typeof v.getHookServer !== "function" || typeof v.isDirty !== "function") return;
  const previous = v.getHookServer();
  // Leave another integration's hooks in charge; the native Fit command remains available.
  if (Object.entries(previous).some(([key, value]) => /^on.*Hook$/u.test(key) && value)) return;
  const ea = factory.getAPI() as CameraEA;
  if (!["setView", "getExcalidrawAPI", "registerThisAsViewEA", "clearViewDirty"].every(k => typeof (ea as unknown as Record<string, unknown>)[k] === "function")) { ea.destroy(); return; }
  let done = false, issued = false, unsubscribe: (() => void) | undefined;
  const stop = () => {
    if (done) return; done = true; unsubscribe?.();
    for (const name of ["pointerdown", "keydown", "wheel"]) v.contentEl.removeEventListener(name, stop, true);
    if (v.getHookServer() === ea) v.setHookServer(previous);
    ea.destroy();
  };
  v.register(stop);
  for (const name of ["pointerdown", "keydown", "wheel"]) v.contentEl.addEventListener(name, stop, true);
  ea.setView(v);
  ea.onSceneChangeHook = { trackElements: true, appStateKeys: ["width", "height", "gridColor"], callback: (elements, state) => {
    if (done || issued || !elements.length) return;
    if (!active() || v.isDirty() || !sameScene(expected, elements)) { stop(); return; }
    const api = ea.getExcalidrawAPI();
    if (!api || typeof api.setViewport !== "function" || typeof api.onChange !== "function" || state.width <= 0 || state.height <= 0) { stop(); return; }
    issued = true;
    let before = camera(state), signature = JSON.stringify(elements), settled = false, corrected = false;
    const content = documentState(state);
    v.setHookServer(previous);
    unsubscribe = api.onChange((current, next) => {
      if (!active() || content !== documentState(next)) { stop(); return; }
      if (signature !== JSON.stringify(current)) {
        // 2.29.0 asynchronously normalizes bound text and repeats its own opening fit once.
        if (!settled || corrected || v.isDirty() || !sameScene(expected, current)) { stop(); return; }
        corrected = true; settled = false; before = camera(next); signature = JSON.stringify(current);
        try { api.setViewport({ target: current, fit: "contain", offsets: { ui: true }, animation: false }); }
        catch { stop(); }
        return;
      }
      if (settled || camera(next) === before) return;
      // This callback runs after the host's dirty tracking. Only our camera changed; never clear user edits.
      ea.clearViewDirty(); settled = true;
      if (corrected) stop();
    });
    try { api.setViewport({ target: elements, fit: "contain", offsets: { ui: true }, animation: false }); }
    catch { stop(); }
  } };
  if (!ea.registerThisAsViewEA()) { stop(); return; }
  // The scene can finish loading before revealLeaf resolves; do not wait for a change that already happened.
  const api = ea.getExcalidrawAPI();
  if (api) ea.onSceneChangeHook.callback(api.getSceneElements(), api.getAppState());
}
