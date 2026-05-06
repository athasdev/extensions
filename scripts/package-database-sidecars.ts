#!/usr/bin/env bun

import { $ } from "bun";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensionsDir = join(root, "extensions");
const cdnBaseUrl = process.env.EXTENSIONS_CDN_BASE_URL || "https://athas.dev/extensions";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function currentPlatformArch() {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}

async function sha256(path: string) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function hasCompletePackageInfo(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.downloadUrl === "string" &&
    entry.downloadUrl.length > 0 &&
    typeof entry.size === "number" &&
    entry.size > 0 &&
    typeof entry.checksum === "string" &&
    entry.checksum.length > 0
  );
}

async function createPackage(params: {
  extensionDir: string;
  manifest: Record<string, unknown>;
  sidecarPath: string;
  binaryPath: string;
  packagePath: string;
}) {
  const tempDir = await mkdtemp(join(tmpdir(), "athas-db-extension-"));

  try {
    await $`rsync -az --exclude='.DS_Store' ${params.extensionDir}/ ${tempDir}/`;

    const packagedManifest = { ...params.manifest };
    delete packagedManifest.installation;
    await writeFile(join(tempDir, "extension.json"), `${JSON.stringify(packagedManifest, null, 2)}\n`);

    const targetBinary = join(tempDir, params.sidecarPath);
    await mkdir(dirname(targetBinary), { recursive: true });
    await cp(params.binaryPath, targetBinary);
    await chmod(targetBinary, 0o755);

    await mkdir(dirname(params.packagePath), { recursive: true });
    await $`find ${tempDir} -exec touch -t 202001010000 {} +`;
    await $`tar --no-xattrs -czf ${params.packagePath} -C ${tempDir} .`;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const platformArch = argValue("--platform") || process.env.PLATFORM_ARCH || currentPlatformArch();
const binDir = resolve(
  argValue("--bin-dir") ||
    process.env.ATHAS_DATABASE_SIDECAR_BIN_DIR ||
    "../athas/crates/database/target/release",
);

const databaseFolders = ["duckdb", "mongodb", "mysql", "postgres", "redis", "sqlite"];
let packagedCount = 0;

for (const folder of databaseFolders) {
  const extensionDir = join(extensionsDir, "database", folder);
  const manifestPath = join(extensionDir, "extension.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  const provider = (manifest.databaseProviders as Array<Record<string, unknown>> | undefined)?.[0];
  const sidecar = provider?.sidecar as Record<string, string> | undefined;
  const sidecarPath = sidecar?.[platformArch];

  if (!provider || !sidecarPath) {
    throw new Error(`Database extension ${folder} has no sidecar for ${platformArch}`);
  }

  const binaryPath = join(binDir, basename(sidecarPath));
  if (!(await stat(binaryPath).then((value) => value.isFile()).catch(() => false))) {
    throw new Error(`Missing database sidecar binary for ${folder}: ${binaryPath}`);
  }

  const packagePath = join(root, "database", folder, `${platformArch}.tar.gz`);
  await createPackage({ extensionDir, manifest, sidecarPath, binaryPath, packagePath });

  const packageStats = await stat(packagePath);
  const packageInfo = {
    downloadUrl: `${cdnBaseUrl}/database/${folder}/${platformArch}.tar.gz`,
    size: packageStats.size,
    checksum: await sha256(packagePath),
  };

  const installation = (manifest.installation ?? {}) as Record<string, unknown>;
  const platformPackages = Object.fromEntries(
    Object.entries((installation.platformArch ?? {}) as Record<string, unknown>).filter(([, value]) =>
      hasCompletePackageInfo(value),
    ),
  );
  platformPackages[platformArch] = packageInfo;
  installation.platformArch = platformPackages;
  installation.downloadUrl = packageInfo.downloadUrl;
  installation.size = packageInfo.size;
  installation.checksum = packageInfo.checksum;
  manifest.installation = installation;

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  packagedCount += 1;
}

console.log(`Packaged ${packagedCount} database sidecar extension(s) for ${platformArch}.`);
