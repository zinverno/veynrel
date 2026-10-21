/** Offline vectors for integration/geometry only, never a search-quality claim. */
import { semanticGlobalMapFixture } from "./global-semantic-map-fixture";
export async function workbenchFixture(paths: readonly string[]) {
  const fixture = await semanticGlobalMapFixture(paths.length, 32);
  const snapshot = fixture.store.readSnapshot();
  const upserts = snapshot.metadata.map((metadata, i) => {
    const document = Math.floor(i / 3), path = paths[document];
    const vector = snapshot.vectors.slice(i * 32, (i + 1) * 32);
    if (document < 2) { vector.fill(0); vector[0] = 1; }
    return { ...metadata, id: `${path}:${metadata.ordinal}`, path, vector };
  });
  await fixture.store.applyChanges({ upserts, deleteIds: snapshot.metadata.map(item => item.id) });
  return fixture.files;
}
