/**
 * Upload all grammar .wasm files to the CDN.
 * Requires EXTENSIONS_CDN_ROOT to be set (path on the server).
 *
 * Usage: bun run scripts/upload-grammars.ts
 */

import { existsSync } from "node:fs";
import { readdir, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");
const targetRoot = process.env.EXTENSIONS_CDN_ROOT;

if (!targetRoot) {
  console.error("Missing EXTENSIONS_CDN_ROOT environment variable.");
  process.exit(1);
}

async function main() {
  const entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  let uploaded = 0;
  let skipped = 0;

  for (const folder of folders) {
    const sourceDir = join(EXTENSIONS_DIR, folder);
    const targetDir = join(targetRoot, folder);
    const wasmFiles = (await readdir(sourceDir)).filter((f) => f.endsWith(".wasm"));

    if (wasmFiles.length === 0) {
      skipped++;
      continue;
    }

    await mkdir(targetDir, { recursive: true });

    for (const wasm of wasmFiles) {
      const src = join(sourceDir, wasm);
      const dest = join(targetDir, wasm);
      await copyFile(src, dest);
      console.log(`Uploaded ${folder}/${wasm}`);
      uploaded++;
    }
  }

  console.log(`\nDone: ${uploaded} files uploaded, ${skipped} folders had no .wasm files`);
}

await main();
