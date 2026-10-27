import { ensure, validateRecipe } from "../recipe";
import type { Recipe } from "../recipe";
import { bytes, COMMUNITY_LIMITS, recipeUrl, sha256, validateEntry, verifyRecipe } from "./schema";
import type { CatalogEntry } from "./schema";

/** Only this explicit author form and a Recipe enter the package; no vault or run port. */
export async function publicationPackage(recipe: Recipe, metadata: Omit<CatalogEntry, "name" | "description" | "version" | "compatibility" | "operations" | "recipeUrl" | "sha256">): Promise<string> {
  const publicRecipe = validateRecipe({ ...recipe, id: `user.${metadata.id}`, source: "user", parameters: { language: recipe.parameters.language, instructions: "" } });
  const raw = `${JSON.stringify(publicRecipe, null, 2)}\n`;
  const entry = validateEntry({ ...metadata, name: publicRecipe.name, description: publicRecipe.description, version: publicRecipe.version,
    compatibility: { recipeSchema: 1, studioApi: 1 }, operations: [publicRecipe.output.action], recipeUrl: recipeUrl(metadata.id, publicRecipe.version), sha256: await sha256(raw) });
  await verifyRecipe(entry, raw);
  const packed = JSON.stringify({ schemaVersion: 1, entry, recipe: raw }, null, 2);
  ensure(bytes(packed) <= COMMUNITY_LIMITS.publication, "size"); return packed;
}
