# Athas Extensions

Extensions for the [Athas](https://athas.dev) editor.

Syntax highlighting is now bundled in Athas core by default. This repository focuses on
language tooling extensions (LSP, formatter, linter, snippets), plus themes and icon themes.

## Structure

Language extensions can live under `extensions/{name}/`. Marketplace contribution
extensions are grouped by type:

```
extensions/
  lua/
    extension.json    # Extension manifest
    tooling.json      # Platform-specific tooling (LSP, formatter, linter binaries)
    build.sh          # Build script for tooling archives
  theme/
    market/
      extension.json  # Theme contribution manifest
      icon.svg
  icon-theme/
    market/
      extension.json  # Icon theme contribution manifest
      icon.svg
```

Root-level files:

- `registry.json` / `index.json` - Extension registry for the marketplace
- `manifests.json` - Combined manifests (auto-generated, do not edit manually)

## Scripts

```bash
bun run scripts/validate.ts
bun run scripts/package-extensions.ts
bun run scripts/generate-manifests.ts
bun run scripts/build-extensions-index.ts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE)
