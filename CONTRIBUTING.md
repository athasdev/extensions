# Contributing Extensions

This repository contains extensions for the [Athas](https://athas.dev) editor. Extensions can provide language tooling support (LSP, formatting, linting, snippets), themes, icon themes, keymaps, and more.

Syntax highlighting is bundled in Athas core and is not managed by these extensions.

## Repository Structure

```
extensions/
  bash/
    extension.json      # Extension manifest
  lua/
    extension.json      # Extension manifest
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
  "description": "MyLang language support with LSP",
  "publisher": "Athas",
  "categories": ["Language"],
  "languages": [
    {
      "id": "mylang",
      "extensions": [".ml"],
      "aliases": ["MyLang"]
    }
  ]
}
```

3. Add capability entries in `capabilities` only for tooling provided by the extension (`lsp`, `formatter`, `linter`, snippets/commands as needed).

4. Regenerate generated files:
   ```bash
   bun run scripts/generate-manifests.ts
   bun run scripts/build-extensions-index.ts
   ```

5. Validate your extension:
   ```bash
   bun run scripts/validate.ts
   ```

## Extension Manifest Format

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (format: `publisher.name`) |
| `name` | string | Short name |
| `version` | string | Semver version |
| `categories` | string[] | Extension categories (`Language`, `Theme`, `Snippets`, `Keymaps`, etc.) |

### Categories

- `Language` - Language tooling support (LSP, formatter, linter, snippets, commands)
- `Theme` - Editor themes
- `Snippets` - Code snippets
- `Keymaps` - Keyboard shortcut presets
- `Formatter` - Code formatters
- `Linter` - Code linters
- `Other` - Everything else

### Language Capabilities

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
