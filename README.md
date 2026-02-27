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
bun run scripts/sync-upstream-queries.ts
```

## Upstream Query Sync

Tree-sitter highlight queries can be pinned to upstream grammar repositories via
`query-sources.json`.

- `highlights.scm` is generated from pinned upstream sources.
- Use `highlights.override.scm` for local Athas-specific fixes.
- To verify everything is in sync:
  ```bash
  bun run scripts/sync-upstream-queries.ts --check
  ```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE)
