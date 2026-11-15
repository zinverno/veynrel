import { vi } from "vitest";
import { TFile } from "obsidian";
import { localNoteFixture } from "./localNoteFixture";
import { OrganizationRegistry } from "../consolidation/organizationRegistry";
import { ObsidianRegistry } from "../consolidation/obsidianRegistry";
import type { OrganizationPreferences } from "../consolidation/organizationProfile";
import { organizationPreferences, organizationDocument } from "../consolidation/organizationProfile";
import { createSafeApplyService } from "../consolidation/obsidianSafeApply";
import { localBytes } from "../consolidation/localNotePlan";
export function registryFixture() {
  const f = localNoteFixture(), path = "Rules.md", original = "# My explanation\r\n\r\n" + organizationDocument(null).replace(/\n/g, "\r\n") + "\r\n<!-- End: Ё -->\r\n";
  f.contents.set(path, original); f.files.set(path, Object.assign(new TFile(), { path, basename: "Rules", extension: "md", stat: { ctime: 1, mtime: 2, size: localBytes(original) } }));
  const events = new Set<(file: TFile) => void>();
  Object.assign(f.vault, { on: (_name: string, fn: (file: TFile) => void) => { events.add(fn); return fn; }, offref: (fn: (file: TFile) => void) => events.delete(fn) });
  let preferences: OrganizationPreferences = { ...organizationPreferences(), registryPath: path };
  f.setRules({ profile: null, registryPath: path });
  const notify = vi.fn(), registry = new OrganizationRegistry(f.app, { get: () => structuredClone(preferences), save: vi.fn(async (next: OrganizationPreferences) => { preferences = next; }) }, () => null, notify);
  const native = new ObsidianRegistry(f.app, f.port, () => registry);
  const restart = () => createSafeApplyService(f.app, "ai-knowledge-hub", () => preferences.registryPath ? [preferences.registryPath] : [], () => ({ profile: null, registryPath: preferences.registryPath }), () => registry);
  const service = restart();
  const plan = async () => native.plan(await native.read(), { kind: "tag", key: null, value: { tag: "Rare", state: "allowed", description: "Future use" } });
  return { ...f, registry, native, service, restart, notify, path, original, plan, nativePlanForNote: f.plan,
    connect: (path: string | null) => { preferences.registryPath = path; },
    openEditor: () => { f.app.workspace.iterateAllLeaves = fn => { fn({ view: { file: f.files.get(path) }, getViewState: () => ({ state: { file: path } }) } as never); }; },
  };
}
