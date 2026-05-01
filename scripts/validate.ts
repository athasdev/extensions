/**
 * Extension Validation Script
 * Validates all extension manifests and checks for required files.
 *
 * Usage: bun run scripts/validate.ts
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";

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

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function validateInstallPackage(
  folder: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const installation = manifest.installation as
    | { downloadUrl?: unknown; size?: unknown; checksum?: unknown }
    | undefined;
  const requiresPackage =
    (Array.isArray(manifest.themes) && manifest.themes.length > 0) ||
    (Array.isArray(manifest.iconThemes) && manifest.iconThemes.length > 0);

  if (!requiresPackage) {
    return;
  }

  if (!installation) {
    error(folder, "Installable extension missing 'installation' metadata");
    return;
  }

  if (typeof installation.downloadUrl !== "string" || installation.downloadUrl.length === 0) {
    error(folder, "Installation metadata missing 'downloadUrl'");
    return;
  }

  if (typeof installation.size !== "number" || installation.size <= 0) {
    error(folder, "Installation metadata missing positive 'size'");
  }

  if (typeof installation.checksum !== "string" || installation.checksum.length === 0) {
    error(folder, "Installation metadata missing 'checksum'");
  }

  const packagePathMatch = installation.downloadUrl.match(/\/extensions\/(.+)$/);
  if (!packagePathMatch) {
    error(folder, `Installation downloadUrl must point under /extensions/: ${installation.downloadUrl}`);
    return;
  }

  const packagePath = join(ROOT, packagePathMatch[1]);
  if (!(await fileExists(packagePath))) {
    error(folder, `Installation package not found: ${packagePathMatch[1]}`);
    return;
  }

  const packageStats = await stat(packagePath);
  if (typeof installation.size === "number" && packageStats.size !== installation.size) {
    error(
      folder,
      `Installation package size mismatch: expected ${installation.size}, got ${packageStats.size}`,
    );
  }

  if (typeof installation.checksum === "string" && installation.checksum.length > 0) {
    const actualChecksum = await sha256(packagePath);
    if (actualChecksum !== installation.checksum) {
      error(
        folder,
        `Installation package checksum mismatch: expected ${installation.checksum}, got ${actualChecksum}`,
      );
    }
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

  const contributionCount =
    (Array.isArray(manifest.languages) ? manifest.languages.length : 0) +
    (Array.isArray(manifest.databaseProviders) ? manifest.databaseProviders.length : 0) +
    (Array.isArray(manifest.themes) ? manifest.themes.length : 0) +
    (Array.isArray(manifest.iconThemes) ? manifest.iconThemes.length : 0);

  if (contributionCount === 0) {
    error(folder, "Extension must declare at least one contribution");
  }

  // Languages array
  const languages = manifest.languages as Array<Record<string, unknown>> | undefined;
  if (languages && Array.isArray(languages)) {
    for (const lang of languages) {
      if (!lang.id) error(folder, "Language entry missing 'id'");
      if (!lang.extensions || !Array.isArray(lang.extensions)) {
        error(folder, `Language '${lang.id}' missing 'extensions' array`);
      }
    }
  }

  const databaseProviders =
    manifest.databaseProviders as Array<Record<string, unknown>> | undefined;
  if (databaseProviders && Array.isArray(databaseProviders)) {
    for (const provider of databaseProviders) {
      if (!provider.id) error(folder, "Database provider missing 'id'");
      if (!provider.sidecar || typeof provider.sidecar !== "object") {
        error(folder, `Database provider '${provider.id}' missing 'sidecar' map`);
      }
    }
  }

  const themes = manifest.themes as Array<Record<string, unknown>> | undefined;
  if (themes && Array.isArray(themes)) {
    for (const theme of themes) {
      if (!theme.id) error(folder, "Theme contribution missing 'id'");
      if (!theme.name) error(folder, `Theme '${theme.id}' missing 'name'`);
      if (theme.appearance !== "dark" && theme.appearance !== "light") {
        error(folder, `Theme '${theme.id}' has invalid 'appearance'`);
      }
      if (!theme.colors || typeof theme.colors !== "object") {
        error(folder, `Theme '${theme.id}' missing 'colors' map`);
      }
    }
  }

  const iconThemes = manifest.iconThemes as Array<Record<string, unknown>> | undefined;
  if (iconThemes && Array.isArray(iconThemes)) {
    for (const iconTheme of iconThemes) {
      if (!iconTheme.id) error(folder, "Icon theme contribution missing 'id'");
      if (!iconTheme.name) error(folder, `Icon theme '${iconTheme.id}' missing 'name'`);
      if (!iconTheme.iconDefinitions || typeof iconTheme.iconDefinitions !== "object") {
        error(folder, `Icon theme '${iconTheme.id}' missing 'iconDefinitions' map`);
      }
    }
  }

  await validateInstallPackage(folder, manifest);

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

const extensionFolders: string[] = [];

async function collectExtensionFolders(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === "extension.json")) {
    extensionFolders.push(relative(EXTENSIONS_DIR, directory));
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "packages")
      .map((entry) => collectExtensionFolders(join(directory, entry.name))),
  );
}

await collectExtensionFolders(EXTENSIONS_DIR);
extensionFolders.sort((a, b) => a.localeCompare(b));

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
