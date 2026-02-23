/**
 * Extension Validation Script
 * Validates all extension manifests and checks for required files.
 *
 * Usage: bun run scripts/validate.ts
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");

interface ValidationError {
  extension: string;
  message: string;
}

const errors: ValidationError[] = [];
const warnings: ValidationError[] = [];

function error(extension: string, message: string) {
  errors.push({ extension, message });
}

function warn(extension: string, message: string) {
  warnings.push({ extension, message });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function validateExtension(folder: string): Promise<void> {
  const extensionDir = join(EXTENSIONS_DIR, folder);
  const manifestPath = join(extensionDir, "extension.json");

  if (!(await fileExists(manifestPath))) {
    warn(folder, "Missing extension.json manifest (parser-only extension)");
    return;
  }

  let manifest: Record<string, unknown>;
  try {
    const content = await readFile(manifestPath, "utf8");
    manifest = JSON.parse(content);
  } catch (e) {
    error(folder, `Invalid JSON in extension.json: ${e}`);
    return;
  }

  // Required fields
  if (!manifest.id || typeof manifest.id !== "string") {
    error(folder, "Missing or invalid 'id' field");
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    error(folder, "Missing or invalid 'name' field");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    error(folder, "Missing or invalid 'version' field");
  }

  // Languages array
  const languages = manifest.languages as Array<Record<string, unknown>> | undefined;
  if (!languages || !Array.isArray(languages) || languages.length === 0) {
    error(folder, "Missing or empty 'languages' array");
  } else {
    for (const lang of languages) {
      if (!lang.id) error(folder, "Language entry missing 'id'");
      if (!lang.extensions || !Array.isArray(lang.extensions)) {
        error(folder, `Language '${lang.id}' missing 'extensions' array`);
      }
    }
  }

  // Grammar capabilities
  const capabilities = manifest.capabilities as Record<string, unknown> | undefined;
  if (capabilities?.grammar) {
    const grammar = capabilities.grammar as Record<string, string>;
    if (grammar.wasmPath) {
      const wasmPath = join(extensionDir, grammar.wasmPath);
      if (!(await fileExists(wasmPath))) {
        warn(folder, `Grammar wasmPath not in repo (expected on CDN): ${grammar.wasmPath}`);
      }
    }
    if (grammar.highlightQuery) {
      const queryPath = join(extensionDir, grammar.highlightQuery);
      if (!(await fileExists(queryPath))) {
        warn(folder, `Highlight query file not found: ${grammar.highlightQuery}`);
      }
    }
  }
}

async function validateRegistry(): Promise<void> {
  const registryPath = join(ROOT, "registry.json");
  if (!(await fileExists(registryPath))) {
    error("registry.json", "Missing registry.json");
    return;
  }

  try {
    const content = await readFile(registryPath, "utf8");
    const registry = JSON.parse(content);
    if (!registry.extensions || !Array.isArray(registry.extensions)) {
      error("registry.json", "Missing or invalid 'extensions' array");
    }
  } catch (e) {
    error("registry.json", `Invalid JSON: ${e}`);
  }
}

async function validateIndex(): Promise<void> {
  const indexPath = join(ROOT, "index.json");
  if (!(await fileExists(indexPath))) {
    error("index.json", "Missing index.json");
    return;
  }

  try {
    const content = await readFile(indexPath, "utf8");
    const index = JSON.parse(content);
    if (!Array.isArray(index)) {
      error("index.json", "index.json should be an array");
    }
  } catch (e) {
    error("index.json", `Invalid JSON: ${e}`);
  }
}

async function validateManifests(): Promise<void> {
  const manifestsPath = join(ROOT, "manifests.json");
  if (!(await fileExists(manifestsPath))) {
    error("manifests.json", "Missing manifests.json");
    return;
  }

  try {
    const content = await readFile(manifestsPath, "utf8");
    const manifests = JSON.parse(content);
    if (typeof manifests !== "object" || Array.isArray(manifests)) {
      error("manifests.json", "manifests.json should be an object keyed by folder name");
    }
  } catch (e) {
    error("manifests.json", `Invalid JSON: ${e}`);
  }
}

// Run validation
console.log("Validating extensions...\n");

const entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
const extensionFolders = entries
  .filter((e) => e.isDirectory() && e.name !== "packages")
  .map((e) => e.name)
  .sort();

console.log(`Found ${extensionFolders.length} extensions\n`);

await Promise.all(extensionFolders.map(validateExtension));
await validateRegistry();
await validateIndex();
await validateManifests();

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) {
    console.log(`  [${w.extension}] ${w.message}`);
  }
}

if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) {
    console.error(`  [${e.extension}] ${e.message}`);
  }
  process.exit(1);
} else {
  console.log("\nAll extensions valid!");
}
