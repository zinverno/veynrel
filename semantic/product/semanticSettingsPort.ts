import type { EmbeddingSettings } from "../../embeddings/types";

/** Host-owned transaction: copy, serialize with all settings saves, persist, publish, invalidate once. */
export interface SemanticSettingsPort {
  get(): EmbeddingSettings;
  update(next: EmbeddingSettings, expected?: EmbeddingSettings): Promise<EmbeddingSettings>;
}
