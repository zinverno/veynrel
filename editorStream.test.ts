import { expect, it, vi } from "vitest";
import type { App, Editor, PluginManifest, TFile } from "obsidian";
import { streamOpenRouter, type CallOptions } from "./api";

vi.mock("./api", () => ({ streamOpenRouter: vi.fn() }));
vi.mock("obsidian", () => {
  class Component {
    cleanups: (() => void)[] = [];
    register(fn: () => void) { this.cleanups.push(fn); }
    registerEvent(off: () => void) { this.register(off); }
    addChild(child: Component) { return child; }
    removeChild(child: Component) { child.cleanups.forEach(fn => fn()); }
  }
  return {
    Component, Plugin: class extends Component { constructor(public app: App) { super(); } },
    Modal: class {}, FuzzySuggestModal: class {}, PluginSettingTab: class {}, getLanguage: () => "en",
  };
});

it.each(["file-open", "before-workspace-event"])("stops late tokens in a reused editor (%s)", async timing => {
  const { default: AIHubPlugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const a = { path: "A.md" } as TFile, b = { path: "B.md" } as TFile;
  const write = vi.fn(), editor = { getCursor: () => ({ line: 0, ch: 0 }), replaceRange: write, setCursor: vi.fn() } as unknown as Editor;
  const activeEditor = { editor, file: a };
  const listeners = new Map<string, (file: TFile) => void>();
  const workspace = { activeEditor, on(name: string, fn: (file: TFile) => void) { listeners.set(name, fn); return () => listeners.delete(name); } };
  const plugin = new AIHubPlugin({ workspace, vault: { getFileByPath: () => a } } as unknown as App, {} as PluginManifest);
  vi.mocked(streamOpenRouter).mockImplementationOnce(async (_settings, _system, _user, token, options) => {
    const signal = (options as CallOptions).signal;
    token("first");
    activeEditor.file = b;
    if (timing === "file-open") {
      listeners.get("file-open")?.(b);
      expect(signal?.aborted).toBe(true);
      activeEditor.file = a;
    }
    token("late");
  });
  await expect(plugin["streamIntoEditor"](editor, "cursor", "", "", a)).rejects.toMatchObject({ name: "AbortError" });
  expect(write.mock.calls).toEqual([["first", { line: 0, ch: 0 }]]);
  expect(listeners.size).toBe(0);
});
