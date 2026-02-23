/**
 * Download all grammar .wasm files from CDN for local development.
 *
 * Usage: bun run scripts/download-grammars.ts
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");
const CDN_BASE_URL = process.env.EXTENSIONS_CDN_BASE_URL || "https://athas.dev/extensions";

async function downloadFile(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = await response.arrayBuffer();
    await writeFile(dest, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const folder of folders) {
    const dir = join(EXTENSIONS_DIR, folder);
    const wasmPath = join(dir, "parser.wasm");

    if (existsSync(wasmPath)) {
      skipped++;
      continue;
    }

    const url = `${CDN_BASE_URL}/${folder}/parser.wasm`;
    process.stdout.write(`Downloading ${folder}/parser.wasm...`);

    if (await downloadFile(url, wasmPath)) {
      console.log(" ok");
      downloaded++;
    } else {
      console.log(" not found (skipped)");
      failed++;
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} already present, ${failed} not available`);
}

await main();
