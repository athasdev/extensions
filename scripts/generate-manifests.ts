/**
 * Generate manifests.json
 * Combines all individual extension.json files into a single manifests.json.
 *
 * Usage: bun run scripts/generate-manifests.ts
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");

const entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
const folders = entries
  .filter((e) => e.isDirectory() && e.name !== "packages")
  .map((e) => e.name)
  .sort();

const manifests: Record<string, unknown> = {};

for (const folder of folders) {
  const manifestPath = join(EXTENSIONS_DIR, folder, "extension.json");
  try {
    const content = await readFile(manifestPath, "utf8");
    manifests[folder] = JSON.parse(content);
  } catch {
    // Skip folders without extension.json
  }
}

await writeFile(join(ROOT, "manifests.json"), JSON.stringify(manifests, null, 2) + "\n");

console.log(`Generated manifests.json with ${Object.keys(manifests).length} extensions`);
