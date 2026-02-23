# Athas Extensions

Extensions for the [Athas](https://athas.dev) editor.

## Structure

Each extension lives under `extensions/{name}/`:

```
extensions/
  lua/
    extension.json    # Extension manifest
    parser.wasm       # Tree-sitter WASM grammar
    highlights.scm    # Tree-sitter highlight queries
    tooling.json      # Platform-specific tooling (LSP, formatter, linter binaries)
    build.sh          # Build script for tooling archives
```

Root-level files:

- `registry.json` / `index.json` - Extension registry for the marketplace
- `manifests.json` - Combined manifests (auto-generated, do not edit manually)

## Scripts

```bash
bun run scripts/validate.ts
bun run scripts/generate-manifests.ts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE)
