#!/usr/bin/env bun

import { $ } from "bun";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensionsDir = join(root, "extensions");
const packagesDir = join(root, "packages");
const cdnBaseUrl = process.env.EXTENSIONS_CDN_BASE_URL || "https://athas.dev/extensions";

function contributionCount(manifest: Record<string, unknown>, key: string): number {
  const contributes =
    typeof manifest.contributes === "object" &&
    manifest.contributes !== null &&
    !Array.isArray(manifest.contributes)
      ? (manifest.contributes as Record<string, unknown>)
      : {};

  const topLevel = Array.isArray(manifest[key]) ? manifest[key].length : 0;
  const contributed = Array.isArray(contributes[key]) ? contributes[key].length : 0;
  return topLevel + contributed;
}

async function collectExtensionFolders(directory: string, folders: string[] = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === "extension.json")) {
    folders.push(relative(extensionsDir, directory));
    return folders;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "packages")
      .map((entry) => collectExtensionFolders(join(directory, entry.name), folders)),
  );

  return folders;
}

function shouldPackage(manifest: Record<string, unknown>) {
  const hasNativeSidecar = contributionCount(manifest, "databaseProviders") > 0;
  const isLanguage = contributionCount(manifest, "languages") > 0;
  const isPureAssetExtension =
    contributionCount(manifest, "themes") > 0 || contributionCount(manifest, "iconThemes") > 0;

  return isPureAssetExtension && !hasNativeSidecar && !isLanguage;
}

async function sha256(path: string) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function createStablePackage(extensionDir: string, manifest: Record<string, unknown>, packagePath: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "athas-extension-"));

  try {
    await $`rsync -az --exclude='.DS_Store' ${extensionDir}/ ${tempDir}/`;

    const packagedManifest = { ...manifest };
    delete packagedManifest.installation;
    await writeFile(join(tempDir, "extension.json"), `${JSON.stringify(packagedManifest, null, 2)}\n`);

    await $`find ${tempDir} -exec touch -t 202001010000 {} +`;
    await $`tar --no-xattrs -czf ${packagePath} -C ${tempDir} .`;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const folders = await collectExtensionFolders(extensionsDir);
let packagedCount = 0;

for (const folder of folders.sort((a, b) => a.localeCompare(b))) {
  const extensionDir = join(extensionsDir, folder);
  const manifestPath = join(extensionDir, "extension.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;

  if (!shouldPackage(manifest)) {
    continue;
  }

  const extensionId = String(manifest.id);
  const packagePath = join(packagesDir, folder, `${extensionId}.tar.gz`);
  await mkdir(dirname(packagePath), { recursive: true });
  await createStablePackage(extensionDir, manifest, packagePath);

  const packageStats = await stat(packagePath);
  manifest.installation = {
    downloadUrl: `${cdnBaseUrl}/packages/${folder}/${extensionId}.tar.gz`,
    size: packageStats.size,
    checksum: await sha256(packagePath),
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  packagedCount += 1;
}

console.log(`Packaged ${packagedCount} extension(s).`);
