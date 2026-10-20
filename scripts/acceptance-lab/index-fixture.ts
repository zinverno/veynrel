/** Two synthetic vectors for the Discover route; never evidence of embedding quality. */
import { LocalVectorStore } from "../../vectorStore/localVectorStore";
import { buildEmbeddingSpaceId } from "../../indexing/embeddingSpace";
import type { VectorStorePersistence } from "../../vectorStore/types";
export async function labIndex(paths: string[], texts: string[]) {
  const files = new Map<string, string | ArrayBuffer>();
  const persistence: VectorStorePersistence = {
    exists: async p => files.has(p), readText: async p => files.get(p) as string, readBinary: async p => files.get(p) as ArrayBuffer,
    writeText: async (p, v) => { files.set(p, v); }, writeBinary: async (p, v) => { files.set(p, v); }, createDirectory: async () => {},
    remove: async p => { files.delete(p); }, rename: async (a, b) => { files.set(b, files.get(a)!); files.delete(a); },
  };
  const dimensions = 3;
  const store = new LocalVectorStore({ dimensions, basePath: "semantic-index", persistence,
    embeddingSpaceId: buildEmbeddingSpaceId({ providerId: "ollama", model: "global-map-synthetic", baseUrl: "http://127.0.0.1:11434", dimensions }) });
  await store.initialize();
  await store.applyChanges({ deleteIds: [], upserts: paths.map((path, i) => ({ id: `lab-${i}`, path, ordinal: 0, headingPath: ["Локальная учебная фикстура"],
    contentHash: `lab-${i}`, preview: texts[i], source: { startOffset: 0, endOffset: texts[i].length, startLine: 0, endLine: texts[i].split("\n").length - 1 },
    vector: new Float32Array([1, 0, 0]) })) });
  return files;
}
