---
"better-wrangler": patch
---

Fix CLI failing with "Cannot find package 'vite'" when run via bunx. Moved vite, react, and related packages from devDependencies to dependencies since they are required at runtime by the CLI.
