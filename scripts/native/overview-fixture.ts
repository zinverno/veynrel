import { LocalVectorStore } from "../../vectorStore/localVectorStore";
import { buildEmbeddingSpaceId } from "../../indexing/embeddingSpace";
import type { VectorStorePersistence } from "../../vectorStore/types";

/** Synthetic integration fixture: not evidence of embedding or ranking quality. */
export async function overviewIndex(notes: Record<string, string>, baseUrl: string, families = false) {
  const files = new Map<string, string | ArrayBuffer>();
  const persistence: VectorStorePersistence = {
    exists: async p => files.has(p), readText: async p => files.get(p) as string,
    readBinary: async p => files.get(p) as ArrayBuffer,
    writeText: async (p, v) => { files.set(p, v); }, writeBinary: async (p, v) => { files.set(p, v); },
    createDirectory: async () => {}, remove: async p => { files.delete(p); },
    rename: async (a, b) => { files.set(b, files.get(a)!); files.delete(a); },
  };
  const store = new LocalVectorStore({ dimensions: 32, basePath: "semantic-index", persistence,
    embeddingSpaceId: buildEmbeddingSpaceId({ providerId: "ollama", model: "overview-synthetic", baseUrl, dimensions: 32 }) });
  await store.initialize();
  await store.applyChanges({ deleteIds: [], upserts: Object.entries(notes).map(([path, text], i) => {
    const vector = new Float32Array(32); vector[families ? i < 4 ? 0 : i < 7 ? 1 : 2 + i % 30 : i % 4] = 1;
    return { id: `${path}:0`, path, ordinal: 0, headingPath: [], contentHash: `synthetic-${i}`, preview: text,
      source: { startOffset: 0, endOffset: text.length, startLine: 0, endLine: text.split("\n").length - 1 }, vector };
  }) });
  return files;
}
