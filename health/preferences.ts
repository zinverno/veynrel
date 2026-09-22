import type { VaultProfile } from "./domain/profile";
import { DEFAULT_VAULT_PROFILE } from "./domain/profile";

/** User intent in plugin data.json, independent of Health observations/history. */
export interface HealthPreferences {
  profile: VaultProfile;
  profileChosen: boolean;
  onboardingCompleted: boolean;
  onboardingVersion: number;
}

export const DEFAULT_HEALTH_PREFERENCES: Readonly<HealthPreferences> = {
  profile: DEFAULT_VAULT_PROFILE, profileChosen: false, onboardingCompleted: false, onboardingVersion: 1,
};

export function mergeHealthPreferences(stored?: unknown): HealthPreferences {
  const value = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const profile = value.profile;
  return {
    profile: profile === "learning" || profile === "research" || profile === "work" || profile === "personal" || profile === "mixed"
      ? profile : DEFAULT_HEALTH_PREFERENCES.profile,
    profileChosen: typeof value.profileChosen === "boolean" ? value.profileChosen : false,
    onboardingCompleted: typeof value.onboardingCompleted === "boolean" ? value.onboardingCompleted : false,
    onboardingVersion: 1,
  };
}

export interface HealthPreferencesPort {
  get(): HealthPreferences;
  update(update: Partial<HealthPreferences>): Promise<HealthPreferences>;
}

/** The host persists first, then publishes. Serialized patches use the last committed value. */
export class HealthPreferencesController implements HealthPreferencesPort {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly read: () => HealthPreferences, private readonly persist: (next: HealthPreferences) => Promise<void>) {}
  get(): HealthPreferences { return { ...this.read() }; }
  update(update: Partial<HealthPreferences>): Promise<HealthPreferences> {
    const patch = { ...update };
    const next = this.pending.then(async () => {
      await this.persist(mergeHealthPreferences({ ...this.get(), ...patch }));
      return this.get();
    });
    this.pending = next.catch(() => undefined);
    return next;
  }
}
