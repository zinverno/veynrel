import { readFileSync, writeFileSync } from "fs";

// Development version bumps must not advertise an unpublished Community release.
if (!process.argv.includes("--release")) {
  console.log("Development version only; public metadata unchanged. See docs/community-version-policy.md.");
  process.exit(0);
}

const targetVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
if (typeof targetVersion !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(targetVersion)) {
  throw new Error("Obsidian release versions must use x.y.z (no prefix or prerelease suffix).");
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
versions[targetVersion] = minAppVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
