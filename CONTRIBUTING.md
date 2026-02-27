# Contributing Extensions

This repository contains extensions for the [Athas](https://athas.dev) editor. Extensions can provide language support (syntax highlighting, LSP, formatting, linting), themes, icon themes, snippets, keymaps, and more.

## Repository Structure

```
extensions/
  bash/
    extension.json      # Extension manifest
    parser.wasm         # Tree-sitter WASM grammar
    highlights.scm      # Tree-sitter highlight queries
  lua/
    extension.json      # Extension manifest
    parser.wasm
    highlights.scm
    tooling.json        # Platform-specific tooling (pre-built LSP, formatter, linter binaries)
    build.sh            # Build script for tooling archives
  ...
registry.json           # Extension registry
index.json              # Extension index (for marketplace)
manifests.json          # Combined manifests (auto-generated, do not edit manually)
scripts/                # Validation and generation scripts
```

- `extension.json` defines the extension manifest (category, capabilities, tool references)
- `tooling.json` (optional) defines pre-built platform-specific binaries distributed as tarballs
- Not every extension has a `tooling.json`. Extensions without one rely on runtime-installed tools
- `query-sources.json` pins upstream Tree-sitter highlight query sources for opt-in languages

## Adding a New Extension

1. Create a folder under `extensions/` (lowercase, use underscores for multi-word names like `c_sharp`).

2. Add an `extension.json` manifest:

```json
{
  "$schema": "https://athas.dev/schemas/extension.json",
  "id": "athas.mylang",
  "name": "MyLang",
  "displayName": "MyLang",
  "version": "1.0.0",
  "description": "MyLang language support with syntax highlighting",
  "publisher": "Athas",
  "categories": ["Language"],
  "languages": [
    {
      "id": "mylang",
      "extensions": [".ml"],
      "aliases": ["MyLang"]
    }
  ],
  "capabilities": {
    "grammar": {
      "wasmPath": "parser.wasm",
      "highlightQuery": "highlights.scm"
    }
  }
}
```

3. Add the required files for your extension type (e.g., `parser.wasm` and `highlights.scm` for language extensions).

4. Update `registry.json` and `index.json` to include your extension.

5. Regenerate `manifests.json`:
   ```bash
   bun run scripts/generate-manifests.ts
   ```

6. Validate your extension:
   ```bash
   bun run scripts/validate.ts
   ```

## Upstream Tree-sitter Queries

For language extensions, prefer pinned upstream queries instead of hand-editing
`highlights.scm` directly.

1. Add an entry in `query-sources.json` with:
   - `repository` (e.g. `tree-sitter/tree-sitter-rust`)
   - `revision` (tag or commit SHA)
   - `queryPath` (usually `queries/highlights.scm`)
   - `targetPath` (extension `highlights.scm`)
   - optional `overridePath` (e.g. `highlights.override.scm`)
   - optional `replacements` for tiny deterministic patches
2. Add/modify `<extension>/highlights.override.scm` for local Athas-specific rules.
3. Run:
   ```bash
   bun run scripts/sync-upstream-queries.ts
   ```
4. Verify:
   ```bash
   bun run scripts/sync-upstream-queries.ts --check
   ```

`highlights.scm` is treated as generated output for entries in `query-sources.json`.

## Extension Manifest Format

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (format: `publisher.name`) |
| `name` | string | Short name |
| `version` | string | Semver version |
| `categories` | string[] | Extension categories (`Language`, `Theme`, `Snippets`, `Keymaps`, etc.) |

### Categories

- `Language` - Language support (grammar, LSP, formatter, linter)
- `Theme` - Editor themes
- `Snippets` - Code snippets
- `Keymaps` - Keyboard shortcut presets
- `Formatter` - Code formatters
- `Linter` - Code linters
- `Other` - Everything else

### Language Capabilities

#### Grammar

```json
"grammar": {
  "wasmPath": "parser.wasm",
  "highlightQuery": "highlights.scm"
}
```

#### LSP

```json
"lsp": {
  "name": "pyright",
  "runtime": "bun",
  "package": "pyright",
  "args": ["--stdio"]
}
```

Supported runtimes: `bun`, `python`, `go`, `binary`

#### Formatter

```json
"formatter": {
  "name": "black",
  "runtime": "python",
  "package": "black",
  "args": ["--stdin-filename", "${file}", "-"]
}
```

#### Linter

```json
"linter": {
  "name": "ruff",
  "runtime": "python",
  "package": "ruff",
  "args": ["check", "--stdin-filename", "${file}", "--output-format", "json", "-"]
}
```

## Testing Locally

1. Clone this repository alongside the main Athas repo:
   ```
   athasdev/
     athas/        # Main editor repo
     extensions/   # This repo
   ```

2. Serve the extensions directory locally:
   ```bash
   bunx serve .
   ```

3. Point the editor to your local server:
   ```bash
   VITE_PARSER_CDN_URL=http://localhost:3000/extensions bun run dev
   ```

## Validation

```bash
bun run scripts/validate.ts
```

CI runs this automatically on pull requests.
