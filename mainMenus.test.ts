import { expect, it, vi } from "vitest";
import type { App, Editor, Menu, MenuItem, PluginManifest, TFile } from "obsidian";

vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App) {} },
  Notice: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
  TFile: class {}, TFolder: class {},
  getLanguage: () => "en",
}));
it("keeps all six context actions using only public menu methods", async () => {
  const { default: AIHubPlugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const items: Array<{ title: string; section: string; click?: unknown }> = [];
  const menu = {
    addSeparator: vi.fn(),
    addItem: (configure: (item: MenuItem) => void) => {
      const record = { title: "", section: "", click: undefined as unknown };
      const item: MenuItem = {
        setTitle: (title: string) => { record.title = title; return item; },
        setSection: (section: string) => { record.section = section; return item; },
        setIcon: () => item,
        setChecked: () => item,
        setDisabled: () => item,
        setWarning: () => item,
        setIsLabel: () => item,
        onClick: (click: unknown) => { record.click = click; return item; },
      };
      configure(item);
      items.push(record);
    },
  };
  const plugin = AIHubPlugin.prototype;
  plugin.addContextMenuItems(menu as unknown as Menu, { getSelection: () => "selection" } as Editor);
  expect(items).toHaveLength(6);
  expect(new Set(items.map(({ title }) => title)).size).toBe(6);
  expect(items.every(({ section, click }) => section === "ai-hub" && typeof click === "function")).toBe(true);
});

it("shares concurrent atomization work and permits a later attempt", async () => {
  const { default: AIHubPlugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { DEFAULT_SETTINGS } = await import("./settings");
  let finishRead!: (content: string) => void;
  const pendingRead = new Promise<string>((resolve) => { finishRead = resolve; });
  const read = vi.fn(() => pendingRead);
  const plugin = new AIHubPlugin({ vault: { read } } as unknown as App, {} as PluginManifest);
  plugin.settings = { ...DEFAULT_SETTINGS, model: "fixture", apiKey: "placeholder" };
  const file = { path: "Projects/Alpha.md" } as TFile;
  const first = plugin.atomizeNote(file);
  const second = plugin.atomizeNote(file);
  finishRead("## Atomic notes\n\n- [[Existing atom]]");
  await Promise.all([first, second]);
  expect(read).toHaveBeenCalledTimes(1);
  await plugin.atomizeNote(file);
  expect(read).toHaveBeenCalledTimes(2);
});
