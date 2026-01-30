# better-wrangler

## 0.2.0

### Minor Changes

- 2aac4ae: ### New Features

  - Add `create-app` command for scaffolding projects from templates
  - Add D1 database viewer to devtools UI
  - Add KV data viewer to devtools UI
  - Add `bun` condition to exports for direct TypeScript source resolution
  - Add comprehensive tests for Durable Object rename and delete migrations
  - Add CI deployment tests for examples
  - Add Starlight documentation site

  ### Improvements

  - Use structured logging for CLI command operations
  - Improve WebSocket reliability with operation IDs and disconnect cleanup
  - Implement cursor-based pagination for KV list to fetch all entries
  - Improve UX with escape key handling and memory management
  - Add error display and server-side input validation
  - Improve accessibility and responsive design
  - Normalize Miniflare worker options

  ### Bug Fixes

  - Use vitest instead of bun:test in migration tests
  - Use binding name for `mf.getKVNamespace()`
  - Use Node.js compatible path resolution in tests
  - Exclude deployment tests from regular test suite

  ### Examples

  - Add hello-world example
  - Add D1 database example with auto-migrations
  - Add Drizzle ORM example with D1 database
