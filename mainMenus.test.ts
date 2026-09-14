import { expect, it, vi } from "vitest";
import type { Editor, Menu, MenuItem } from "obsidian";

vi.mock("obsidian", () => ({
  Plugin: class {}, Modal: class {}, PluginSettingTab: class {}, Component: class {},
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
