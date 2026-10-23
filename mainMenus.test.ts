import { expect, it, vi } from "vitest";
import type { App, Editor, Menu, MenuItem, PluginManifest, TFile } from "obsidian";

vi.mock("./atomization/generativeModal", () => ({ GenerativeAtomizationModal: vi.fn(function () { return { open() {} }; }), AtomizationPicker: class {} }));
vi.mock("obsidian", () => ({
  Plugin: class { constructor(public app: App) {} },
  Notice: class {}, FuzzySuggestModal: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
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
  const plugin = new AIHubPlugin({} as App, {} as PluginManifest);
  const source = { path: "Chosen/Note.md" } as TFile;
  const atomize = vi.spyOn(plugin, "atomizeNote").mockResolvedValue();
  plugin.addContextMenuItems(menu as unknown as Menu, { getSelection: () => "selection" } as Editor, source);
  expect(items).toHaveLength(6);
  (items[5].click as () => void)(); expect(atomize).toHaveBeenCalledWith(source); atomize.mockRestore();
  expect(new Set(items.map(({ title }) => title)).size).toBe(6);
  expect(items.every(({ section, click }) => section === "ai-hub" && typeof click === "function")).toBe(true);
});

it("shares the consent modal, performs no automatic generation, and permits a later launch", async () => {
  const { default: AIHubPlugin } = await vi.importActual<typeof import("./main")>("./main.ts");
  const { GenerativeAtomizationModal } = await import("./atomization/generativeModal");
  const plugin = new AIHubPlugin({} as App, {} as PluginManifest);
  const file = { path: "Projects/Alpha.md" } as TFile;
  const first = plugin.atomizeNote(file);
  expect(plugin.atomizeNote(file)).toBe(first);
  expect(vi.mocked(GenerativeAtomizationModal)).toHaveBeenCalledTimes(1);
  const finish = vi.mocked(GenerativeAtomizationModal).mock.calls[0][3]; finish(); await first;
  const second = plugin.atomizeNote(file);
  expect(vi.mocked(GenerativeAtomizationModal)).toHaveBeenCalledTimes(2);
  vi.mocked(GenerativeAtomizationModal).mock.calls[1][3](); await second;
});
