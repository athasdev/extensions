/**
 * Build parser.wasm files from tree-sitter grammar sources.
 *
 * Uses grammar-sources.json as the source of truth for which grammars to build.
 * Each entry maps a language ID to a GitHub repository and optional subdirectory.
 *
 * Usage:
 *   bun run scripts/build-grammars.ts                    # Build all missing
 *   bun run scripts/build-grammars.ts --languages sql,xml # Build specific languages
 *   bun run scripts/build-grammars.ts --all               # Rebuild everything
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const EXTENSIONS_DIR = join(ROOT, "extensions");
const GRAMMAR_SOURCES = join(ROOT, "grammar-sources.json");
const BUILD_DIR = join(ROOT, ".grammar-build");

interface GrammarSource {
  repository: string;
  path: string;
  branch?: string;
  generate?: boolean;
}

async function loadSources(): Promise<Record<string, GrammarSource>> {
  const raw = await readFile(GRAMMAR_SOURCES, "utf-8");
  return JSON.parse(raw);
}

function parseArgs(): { languages: string[] | null; all: boolean } {
  const args = process.argv.slice(2);
  let languages: string[] | null = null;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--languages" && args[i + 1]) {
      languages = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (args[i] === "--all") {
      all = true;
    }
  }

  return { languages, all };
}

async function buildGrammar(
  lang: string,
  source: GrammarSource,
): Promise<boolean> {
  const repoDir = join(BUILD_DIR, `repo-${lang}`);
  const wasmOutput = join(EXTENSIONS_DIR, lang, "parser.wasm");

  try {
    // Clone repository
    await rm(repoDir, { recursive: true, force: true });
    const repoUrl = `https://github.com/${source.repository}`;
    await $`git clone --depth 1 ${source.branch ? ["-b", source.branch] : []} ${repoUrl} ${repoDir}`.quiet();

    // Determine build path
    const buildPath = source.path === "." ? repoDir : join(repoDir, source.path);

    // Check if parser.c exists, generate if needed
    if (!existsSync(join(buildPath, "src", "parser.c"))) {
      console.log(`  Generating parser for ${lang}...`);
      await $`tree-sitter generate`.cwd(buildPath).quiet();
    }

    // Build wasm
    await mkdir(join(EXTENSIONS_DIR, lang), { recursive: true });
    await $`tree-sitter build --wasm -o ${wasmOutput} ${buildPath}`;

    if (existsSync(wasmOutput)) {
      const stat = Bun.file(wasmOutput);
      const sizeKb = Math.round((await stat.arrayBuffer()).byteLength / 1024);
      console.log(`  ${lang}: ${sizeKb}K`);
      return true;
    }

    console.error(`  ${lang}: wasm file not produced`);
    return false;
  } catch (error) {
    console.error(`  ${lang}: FAILED -`, error instanceof Error ? error.message : error);
    return false;
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
}

async function main() {
  const sources = await loadSources();
  const { languages, all } = parseArgs();

  // Determine which languages to build
  let toBuild: string[];
  if (languages) {
    toBuild = languages.filter((lang) => {
      if (!sources[lang]) {
        console.warn(`Warning: No grammar source defined for "${lang}"`);
        return false;
      }
      return true;
    });
  } else if (all) {
    toBuild = Object.keys(sources);
  } else {
    // Build only missing ones
    toBuild = Object.keys(sources).filter(
      (lang) => !existsSync(join(EXTENSIONS_DIR, lang, "parser.wasm")),
    );
  }

  if (toBuild.length === 0) {
    console.log("All parser.wasm files are up to date.");
    return;
  }

  console.log(`Building ${toBuild.length} grammar(s): ${toBuild.join(", ")}\n`);

  await mkdir(BUILD_DIR, { recursive: true });

  let succeeded = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const lang of toBuild) {
    process.stdout.write(`Building ${lang}...`);
    const ok = await buildGrammar(lang, sources[lang]);
    if (ok) {
      succeeded++;
    } else {
      failed++;
      failures.push(lang);
    }
  }

  await rm(BUILD_DIR, { recursive: true, force: true });

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

await main();
