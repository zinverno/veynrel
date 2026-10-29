import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {} }));
import type { View } from "obsidian";
import type { DiagramEA, NativeElement } from "./adapter";
import { fitNewDrawing } from "./viewport";

function fixture() {
  const elements = [{ id: "node", type: "rectangle", x: 24, y: 80, width: 160, height: 64, strokeColor: "black", backgroundColor: "white" }] as NativeElement[];
  const state = { width: 720, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewBackgroundColor: "white", theme: "light" };
  const previous = {}, events = new EventTarget(), cleanups: (() => void)[] = [];
  let server: object = previous, dirty = false, active = true;
  let observer: ((e: NativeElement[], s: typeof state) => void) | undefined;
  const api = { getSceneElements: vi.fn(() => [] as NativeElement[]), getAppState: () => state,
    setViewport: vi.fn(), onChange: vi.fn((fn: typeof observer) => { observer = fn; return () => { observer = undefined; }; }) };
  const view = { contentEl: events, getHookServer: () => server, setHookServer: (s: object) => { server = s; }, isDirty: () => dirty, register: (fn: () => void) => cleanups.push(fn) };
  const ea = { getAPI: vi.fn<() => DiagramEA>(), destroy: vi.fn(), setView: vi.fn(), getExcalidrawAPI: () => api,
    registerThisAsViewEA: () => { server = ea; return true; }, clearViewDirty: vi.fn(),
    onSceneChangeHook: null as null | { callback: (e: NativeElement[], s: typeof state) => void } };
  ea.getAPI.mockReturnValue(ea as unknown as DiagramEA);
  return { elements, state, api, ea, previous, view, events, cleanups,
    start: () => fitNewDrawing(view as unknown as View, ea as unknown as DiagramEA, elements, () => active),
    ready: () => ea.onSceneChangeHook?.callback(elements, state),
    settle: (e = elements, s = { ...state, scrollY: 20, zoom: { value: 0.8 } }) => observer?.(e, s),
    dirty: () => { dirty = true; }, inactive: () => { active = false; } };
}

describe("one-shot native first-open viewport", () => {
  it("waits for scene events, fits with measured native UI offsets once and leaves no dirty camera write", () => {
    const f = fixture(); f.start(); expect(f.api.setViewport).not.toHaveBeenCalled();
    f.ready(); expect(f.api.setViewport).toHaveBeenCalledExactlyOnceWith({ target: f.elements, fit: "contain", offsets: { ui: true }, animation: false });
    expect(f.view.getHookServer()).toBe(f.previous);
    f.settle(f.elements, f.state); expect(f.ea.clearViewDirty).not.toHaveBeenCalled();
    f.settle(); expect(f.ea.clearViewDirty).toHaveBeenCalledOnce(); expect(f.ea.destroy).toHaveBeenCalledOnce();
    f.ready(); f.settle(); expect(f.api.setViewport).toHaveBeenCalledOnce(); expect(f.ea.clearViewDirty).toHaveBeenCalledOnce();
  });
  it("also fits when scene readiness preceded hook registration", () => {
    const f = fixture(); f.api.getSceneElements.mockReturnValue(f.elements); f.start();
    expect(f.api.setViewport).toHaveBeenCalledOnce(); f.ready(); expect(f.api.setViewport).toHaveBeenCalledOnce();
  });
  it.each(["pointerdown", "keydown", "wheel"])("%s cancels delayed fit without discarding interaction", name => {
    const f = fixture(); f.start(); f.events.dispatchEvent(new Event(name)); f.ready();
    expect(f.api.setViewport).not.toHaveBeenCalled(); expect(f.ea.clearViewDirty).not.toHaveBeenCalled(); expect(f.view.getHookServer()).toBe(f.previous);
  });
  it.each(["dirty", "inactive"] as const)("leaves a %s view untouched", condition => {
    const f = fixture(); f.start(); f[condition](); f.ready(); expect(f.api.setViewport).not.toHaveBeenCalled(); expect(f.ea.clearViewDirty).not.toHaveBeenCalled();
  });
  it.each(["element", "background", "input", "inactive"])("never clears concurrent %s changes", condition => {
    const f = fixture(); f.start(); f.ready();
    if (condition === "input") f.events.dispatchEvent(new Event("pointerdown"));
    if (condition === "inactive") f.inactive();
    f.settle(condition === "element" ? [{ ...f.elements[0], x: 40 }] : f.elements,
      { ...f.state, scrollY: 20, viewBackgroundColor: condition === "background" ? "red" : "white" });
    expect(f.ea.clearViewDirty).not.toHaveBeenCalled(); expect(f.ea.destroy).toHaveBeenCalledOnce();
  });
  it("does not replace another integration's hook server", () => {
    const f = fixture(); Object.assign(f.previous, { onSceneChangeHook: {} }); f.start();
    expect(f.ea.getAPI).not.toHaveBeenCalled(); expect(f.view.getHookServer()).toBe(f.previous);
  });
  it.each(["theme", "gridSize", "gridStep", "gridModeEnabled", "colorPalette", "colorTopPicks", "frameRendering", "objectsSnapModeEnabled", "bindingPreference", "isMidpointSnappingEnabled", "boxSelectionMode"])("does not clear a concurrent %s document setting", key => {
    const f = fixture(); f.start(); f.ready();
    f.settle(f.elements, { ...f.state, scrollY: 20, [key]: "changed" });
    expect(f.ea.clearViewDirty).not.toHaveBeenCalled(); expect(f.ea.destroy).toHaveBeenCalledOnce();
  });
  it("compares every element field before clearing camera-only dirtiness", () => {
    const f = fixture(); f.start(); f.ready(); f.settle([{ ...f.elements[0], version: 2 }]);
    expect(f.ea.clearViewDirty).not.toHaveBeenCalled();
  });
  it("releases the observer when the native viewport API fails", () => {
    const f = fixture(); f.api.setViewport.mockImplementation(() => { throw Error("closed"); });
    f.start(); expect(() => f.ready()).not.toThrow(); f.settle();
    expect(f.view.getHookServer()).toBe(f.previous); expect(f.ea.destroy).toHaveBeenCalledOnce(); expect(f.ea.clearViewDirty).not.toHaveBeenCalled();
  });
  it("cleans up a view that closes before its scene loads", () => {
    const f = fixture(); f.start(); f.cleanups.forEach(fn => fn()); f.ready();
    expect(f.api.setViewport).not.toHaveBeenCalled(); expect(f.view.getHookServer()).toBe(f.previous); expect(f.ea.destroy).toHaveBeenCalledOnce();
  });
});
