#!/usr/bin/env bun

import { $ } from "bun";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensionsDir = join(root, "extensions");
const targetDir = process.env.EXTENSIONS_CDN_ROOT;

if (!targetDir) {
  console.error("Missing EXTENSIONS_CDN_ROOT environment variable.");
  process.exit(1);
}

console.log(`Syncing extensions CDN content...`);
console.log(`Source: ${extensionsDir}/`);
console.log(`Target: ${targetDir}/`);

await $`mkdir -p ${targetDir}`;

// Sync extension config files (json, scm, sh, md) without deleting existing wasm files
await $`rsync -az --include='*/' --include='*.json' --include='*.scm' --include='*.sh' --include='*.md' --exclude='*' ${extensionsDir}/ ${targetDir}/`;

// Sync root-level registry files
for (const file of ["registry.json", "index.json", "manifests.json"]) {
  await $`cp ${join(root, file)} ${targetDir}/${file}`;
}

console.log("Extensions CDN sync complete.");
