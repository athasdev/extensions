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

function getContributionArray(
  manifest: Record<string, unknown>,
  key: string,
): Array<Record<string, unknown>> {
  const contributes =
    typeof manifest.contributes === "object" &&
    manifest.contributes !== null &&
    !Array.isArray(manifest.contributes)
      ? (manifest.contributes as Record<string, unknown>)
      : {};

  return [
    ...(Array.isArray(manifest[key]) ? (manifest[key] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(contributes[key])
      ? (contributes[key] as Array<Record<string, unknown>>)
      : []),
  ];
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
    | {
        downloadUrl?: unknown;
        size?: unknown;
        checksum?: unknown;
        platformArch?: unknown;
      }
    | undefined;
  const requiresPackage =
    getContributionArray(manifest, "databaseProviders").length > 0 ||
    getContributionArray(manifest, "themes").length > 0 ||
    getContributionArray(manifest, "iconThemes").length > 0;

  if (!requiresPackage) {
    return;
  }

  if (!installation) {
    error(folder, "Installable extension missing 'installation' metadata");
    return;
  }

  await validatePackageEntry(folder, "Installation metadata", installation);

  if (installation.platformArch === undefined) {
    return;
  }

  if (
    typeof installation.platformArch !== "object" ||
    installation.platformArch === null ||
    Array.isArray(installation.platformArch)
  ) {
    error(folder, "Installation metadata 'platformArch' must be an object");
    return;
  }

  for (const [platformArch, packageEntry] of Object.entries(installation.platformArch)) {
    if (typeof packageEntry !== "object" || packageEntry === null || Array.isArray(packageEntry)) {
      error(folder, `Installation package for ${platformArch} must be an object`);
      continue;
    }

    await validatePackageEntry(
      folder,
      `Installation package for ${platformArch}`,
      packageEntry as { downloadUrl?: unknown; size?: unknown; checksum?: unknown },
    );
  }
}

async function validatePackageEntry(
  folder: string,
  label: string,
  packageEntry: { downloadUrl?: unknown; size?: unknown; checksum?: unknown },
): Promise<void> {
  if (typeof packageEntry.downloadUrl !== "string" || packageEntry.downloadUrl.length === 0) {
    error(folder, `${label} missing 'downloadUrl'`);
    return;
  }

  if (typeof packageEntry.size !== "number" || packageEntry.size <= 0) {
    error(folder, `${label} missing positive 'size'`);
  }

  if (typeof packageEntry.checksum !== "string" || packageEntry.checksum.length === 0) {
    error(folder, `${label} missing 'checksum'`);
  }

  const packagePathMatch = packageEntry.downloadUrl.match(/\/extensions\/(.+)$/);
  if (!packagePathMatch) {
    error(folder, `${label} downloadUrl must point under /extensions/: ${packageEntry.downloadUrl}`);
    return;
  }

  const packagePath = join(ROOT, packagePathMatch[1]);
  if (!(await fileExists(packagePath))) {
    error(folder, `Installation package not found: ${packagePathMatch[1]}`);
    return;
  }

  const packageStats = await stat(packagePath);
  if (typeof packageEntry.size === "number" && packageStats.size !== packageEntry.size) {
    error(
      folder,
      `${label} size mismatch: expected ${packageEntry.size}, got ${packageStats.size}`,
    );
  }

  if (typeof packageEntry.checksum === "string" && packageEntry.checksum.length > 0) {
    const actualChecksum = await sha256(packagePath);
    if (actualChecksum !== packageEntry.checksum) {
      error(
        folder,
        `${label} checksum mismatch: expected ${packageEntry.checksum}, got ${actualChecksum}`,
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
    getContributionArray(manifest, "languages").length +
    getContributionArray(manifest, "databaseProviders").length +
    getContributionArray(manifest, "agents").length +
    getContributionArray(manifest, "themes").length +
    getContributionArray(manifest, "iconThemes").length;

  if (contributionCount === 0) {
    error(folder, "Extension must declare at least one contribution");
  }

  // Languages array
  const languages = getContributionArray(manifest, "languages");
  if (languages.length > 0) {
    for (const lang of languages) {
      if (!lang.id) error(folder, "Language entry missing 'id'");
      const hasExtensionMatcher =
        Array.isArray(lang.extensions) ||
        Array.isArray(lang.filenames) ||
        Array.isArray(lang.filenamePatterns);
      if (!hasExtensionMatcher) {
        error(
          folder,
          `Language '${lang.id}' missing one of 'extensions', 'filenames', or 'filenamePatterns'`,
        );
      }
    }
  }

  const databaseProviders = getContributionArray(manifest, "databaseProviders");
  if (databaseProviders.length > 0) {
    for (const provider of databaseProviders) {
      if (!provider.id) error(folder, "Database provider missing 'id'");
      if (!provider.sidecar || typeof provider.sidecar !== "object") {
        error(folder, `Database provider '${provider.id}' missing 'sidecar' map`);
      }
    }
  }

  const agents = getContributionArray(manifest, "agents");
  if (agents.length > 0) {
    for (const agent of agents) {
      if (!agent.id) error(folder, "Agent contribution missing 'id'");
      if (!agent.name) error(folder, `Agent '${agent.id}' missing 'name'`);
      if (!agent.binaryName) error(folder, `Agent '${agent.id}' missing 'binaryName'`);

      const install = agent.install as Record<string, unknown> | undefined;
      if (install) {
        if (!install.runtime) error(folder, `Agent '${agent.id}' install missing 'runtime'`);
        if (!install.package) error(folder, `Agent '${agent.id}' install missing 'package'`);
        if (!install.command) error(folder, `Agent '${agent.id}' install missing 'command'`);
      }
    }
  }

  const themes = getContributionArray(manifest, "themes");
  if (themes.length > 0) {
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

  const iconThemes = getContributionArray(manifest, "iconThemes");
  if (iconThemes.length > 0) {
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
