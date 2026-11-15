import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {} }));
import { organizationSuggestionCatalog } from "./organizationAudit";
import { organizationAuthority, authorityKey } from "./organizationIdentity";
import { OrganizationRegistry } from "./organizationRegistry";
import { organizationPreferences } from "./organizationProfile";
import type { OrganizationPreferences } from "./organizationProfile";
import type { TaxonomyInventory } from "./taxonomyScan";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
const profile: TagTaxonomyProfile = { version: 1, categories: [{ id: "topic", name: "My topics", purpose: "topic", multiplicity: "multiple", interpretation: "global", prefixes: ["topic", "unrelated"], tags: ["Rare"] }] };
const inventory = () => ({ processed: 6, unavailable: 0, organization: { state: "complete", scope: { kind: "all" }, exclusions: ["Templates", "Rules.md"], prefixes: [{ value: "topic", notes: 4, examples: ["A.md", "B.md"] }], types: [{ value: "journal", notes: 3, examples: ["C.md"] }] } }) as TaxonomyInventory;
const catalog = (i = inventory(), p = profile) => organizationSuggestionCatalog(i, p, null);
const signal = () => new AbortController().signal;
function fixture(initial: OrganizationPreferences = organizationPreferences()) {
  let data = structuredClone(initial);
  const save = vi.fn(async (next: OrganizationPreferences, expected: OrganizationPreferences, abort: AbortSignal) => {
    if (abort.aborted || JSON.stringify(expected) !== JSON.stringify(data)) throw Error("conflict"); data = structuredClone(next);
  });
  const registry = new OrganizationRegistry({} as never, { get: () => organizationPreferences(data), save }, () => profile, vi.fn());
  return { registry, save, data: () => data, set: (p: OrganizationPreferences) => { data = p; } };
}
describe("stable relevant authority, distinct user decisions and legacy compatibility", () => {
  it("unrelated notes, counts, examples, times, order and reruns cannot change authority", () => {
    const i = inventory(), first = catalog(i)[0];
    i.processed = 1001; i.organization!.prefixes[0].notes = 30; i.organization!.prefixes[0].examples = ["Z.md"]; i.organization!.finishedAt = 999;
    i.organization!.types.reverse(); i.organization!.exclusions.reverse(); i.organization!.exclusions.push("Rules.md");
    const changed = catalog(i)[0]; expect(changed.id).toBe(first.id); expect(changed.authority).toEqual(first.authority); expect(changed.legacyId).not.toBe(first.legacyId);
    expect(catalog()[0].id).toBe(first.id);
  });
  it("unrelated categories, sibling prefixes and assigned flat tags do not re-open this prefix advice", () => {
    const p = structuredClone(profile); p.categories[0].prefixes.reverse(); p.categories[0].tags.push("other");
    p.categories.push({ ...p.categories[0], id: "other", name: "Unrelated", prefixes: ["other"], tags: [] });
    expect(catalog(inventory(), p)[0].authority).toEqual(catalog()[0].authority);
    p.categories[0].name = "Changed meaning"; expect(catalog(inventory(), p)[0].authority).not.toEqual(catalog()[0].authority);
  });
  it.each(["scope", "exclusions", "case", "unicode", "kind"])("different %s cannot share authority", change => {
    const first = catalog()[0].authority, i = inventory();
    if (change === "scope") i.organization!.scope = { kind: "folder", path: "Notes" };
    if (change === "exclusions") i.organization!.exclusions.push("Archive");
    if (change === "case") i.organization!.prefixes[0].value = "Topic";
    if (change === "unicode") i.organization!.prefixes[0].value = "tópíc";
    const next = change === "kind" ? organizationAuthority("type", "topic", first.scope, first.exclusions, profile, null) : catalog(i)[0].authority;
    expect(authorityKey(next)).not.toBe(authorityKey(first));
  });
  it("preserves Unicode composition and changes only the relevant type convention identity", () => {
    const a = organizationAuthority("type", "Ё", { kind: "all" }, [], null, null), b = organizationAuthority("type", "Ё", { kind: "all" }, [], null, null);
    expect(authorityKey(a)).not.toBe(authorityKey(b));
    const defs = { version: 1 as const, profile, tags: [], conventions: [{ subject: "type" as const, value: "journal", description: "Daily" }] };
    const first = organizationSuggestionCatalog(inventory(), profile, defs).find(s => s.kind === "type")!;
    defs.conventions[0].description = "Research journal";
    expect(organizationSuggestionCatalog(inventory(), profile, defs).find(s => s.kind === "type")!.authority).not.toEqual(first.authority);
  });
  it("leave-as-is survives irrelevant rescan; later is distinct; restore is explicit and persisted", async () => {
    const f = fixture(), suggestion = catalog()[0];
    await f.registry.decide(suggestion.authority, "dismissed", signal()); expect(f.registry.decisionFor(suggestion)).toBe("dismissed");
    const i = inventory(); i.processed++; i.organization!.prefixes[0].examples = ["Different.md"];
    expect(f.registry.decisionFor(catalog(i)[0])).toBe("dismissed");
    await f.registry.decide(suggestion.authority, "deferred", signal()); expect(f.registry.decisionFor(suggestion)).toBe("deferred");
    await f.registry.restoreDecision(suggestion.authority, signal()); expect(f.registry.decisionFor(suggestion)).toBe("active"); expect(f.data().version).toBe(2);
  });
  it("preserves opaque legacy IDs, recognizes exact old basis, never infers a migrated authority", async () => {
    const suggestion = catalog()[0], legacy = [suggestion.legacyId, "org:opaque"];
    const f = fixture({ version: 1, registryPath: null, dismissed: legacy });
    expect(f.registry.decisionFor(suggestion)).toBe("dismissed"); expect(f.data()).toEqual({ version: 1, registryPath: null, dismissed: legacy }); expect(f.save).not.toHaveBeenCalled();
    const other = inventory(); other.processed++; expect(f.registry.decisionFor(catalog(other)[0])).toBe("active");
    await f.registry.decide(suggestion.authority, "dismissed", signal()); // Explicit UI promotion, never a passive scan.
    expect(f.data().dismissed).toEqual(legacy); expect(f.registry.decisionFor(catalog(other)[0])).toBe("dismissed");
    await f.registry.restoreDecision(suggestion.authority, signal(), suggestion.legacyId); expect(f.data().dismissed).toEqual(["org:opaque"]);
    await f.registry.restoreLegacy("org:opaque", signal()); expect(f.data().dismissed).toEqual([]);
  });
  it("capacity 200 never evicts, restore frees only the selected record and retry is explicit", async () => {
    const legacy = Array.from({ length: 200 }, (_, i) => "org:" + i), f = fixture({ version: 1, registryPath: null, dismissed: legacy });
    await expect(f.registry.decide(catalog()[0].authority, "dismissed", signal())).rejects.toMatchObject({ reason: "limit" }); expect(f.data().dismissed).toEqual(legacy);
    await f.registry.restoreLegacy("org:17", signal()); await f.registry.decide(catalog()[0].authority, "deferred", signal());
    expect(f.data().dismissed).toHaveLength(199); expect(f.registry.decisionFor(catalog()[0])).toBe("deferred");
  });
  it("save failure and concurrent decisions cannot report success or lose a decision", async () => {
    const f = fixture(), suggestions = catalog(); let release!: () => void; const save = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (...args) => { await new Promise<void>(r => { release = r; }); return save(...args); });
    const first = f.registry.decide(suggestions[0].authority, "dismissed", signal());
    expect(f.registry.decisionFor(suggestions[0])).toBe("active");
    await expect(f.registry.decide(suggestions[1].authority, "deferred", signal())).rejects.toMatchObject({ reason: "conflict" });
    release(); await first; expect(f.registry.decisionFor(suggestions[0])).toBe("dismissed");
    f.save.mockRejectedValueOnce(Error("disk")); await expect(f.registry.restoreDecision(suggestions[0].authority, signal())).rejects.toThrow();
    expect(f.registry.decisionFor(suggestions[0])).toBe("dismissed");
  });
  it("partial, cancelled and stale scans do not delete durable decisions or establish resolution", async () => {
    const f = fixture(); await f.registry.decide(catalog()[0].authority, "dismissed", signal()); const before = structuredClone(f.data());
    for (const state of ["partial", "stale", "cancelled", "failed"] as const) { const i = inventory(); i.organization!.state = state; expect(catalog(i)).toEqual([]); }
    expect(f.data()).toEqual(before);
  });
  it("strict v2 parser rejects corrupt/future states, duplicate authorities and unbounded capacity", () => {
    const d = { authority: catalog()[0].authority, state: "deferred" }, base = { version: 2, registryPath: null, dismissed: ["org:old"], decisions: [d] };
    expect(organizationPreferences(base)).toEqual(base);
    for (const value of [{ ...base, version: 3 }, { ...base, decisions: [d,d] }, { ...base, decisions: [{ ...d, state: "accepted" }] }, { ...base, decisions: [{ ...d, authority: { ...d.authority, count: 3 } }] }, { ...base, dismissed: Array.from({length:200},(_,i)=>'org:'+i) }]) expect(() => organizationPreferences(value)).toThrow();
  });
});
