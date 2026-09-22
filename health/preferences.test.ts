import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HEALTH_PREFERENCES, HealthPreferencesController, mergeHealthPreferences } from "./preferences";
import type { HealthPreferences } from "./preferences";

describe("bounded Health preference migration", () => {
  it.each([undefined, null, [], "work", 42])("defaults missing or malformed settings (%s)", (stored) => {
    expect(mergeHealthPreferences(stored)).toEqual(DEFAULT_HEALTH_PREFERENCES);
    expect(mergeHealthPreferences(stored)).not.toBe(DEFAULT_HEALTH_PREFERENCES);
  });
  it.each(["learning", "research", "work", "personal", "mixed"] as const)("preserves the chosen %s profile and completion", (profile) => {
    const stored = { profile, profileChosen: true, onboardingCompleted: true, onboardingVersion: 1 };
    expect(mergeHealthPreferences(stored)).toEqual(stored);
  });
  it("bounds keys, profiles, booleans and version without coercing user intent", () => {
    expect(mergeHealthPreferences({ profile: "student", profileChosen: "true", onboardingCompleted: 1, onboardingVersion: -4, extra: "ignored" }))
      .toEqual(DEFAULT_HEALTH_PREFERENCES);
    expect(mergeHealthPreferences({ profile: "student", profileChosen: true, onboardingCompleted: true }))
      .toEqual({ ...DEFAULT_HEALTH_PREFERENCES, profileChosen: true, onboardingCompleted: true });
  });
});

describe("transactional preferences port", () => {
  it("publishes only after persistence, preserves effective preferences on rejection and allows retry", async () => {
    let persisted = mergeHealthPreferences();
    let reject!: (reason: Error) => void;
    const save = vi.fn(async (next: HealthPreferences) => { persisted = { ...next }; });
    save.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const port = new HealthPreferencesController(() => persisted, save);
    const previous = port.get(); const pending = port.update({ profile: "research", profileChosen: true });
    await Promise.resolve(); expect(port.get()).toEqual(previous);
    const rejection = expect(pending).rejects.toThrow("synthetic failure"); reject(new Error("synthetic failure")); await rejection;
    expect(port.get()).toEqual(previous);
    expect(await port.update({ profile: "work" })).toEqual({ ...previous, profile: "work" });
    port.get().profile = "research"; expect(port.get().profile).toBe("work");
  });
  it("serializes concurrent patches, captures inputs and keeps completion after the selected profile", async () => {
    let persisted = mergeHealthPreferences();
    const port = new HealthPreferencesController(() => persisted, async (next) => { persisted = next; });
    const patch: Partial<HealthPreferences> = { profile: "research", profileChosen: true };
    const chosen = port.update(patch); patch.profile = "work";
    const completed = port.update({ onboardingCompleted: true });
    await Promise.all([chosen, completed]);
    expect(port.get()).toEqual({ profile: "research", profileChosen: true, onboardingCompleted: true, onboardingVersion: 1 });
  });
});
