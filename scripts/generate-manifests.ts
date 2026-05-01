/**
 * Generate manifests.json
 * Combines all individual extension.json files into a single manifests.json.
 *
 * Usage: bun run scripts/generate-manifests.ts
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");

const folders: string[] = [];

async function walk(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === "extension.json")) {
    folders.push(relative(EXTENSIONS_DIR, directory));
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "packages")
      .map((entry) => walk(join(directory, entry.name))),
  );
}

await walk(EXTENSIONS_DIR);
folders.sort((a, b) => a.localeCompare(b));

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
