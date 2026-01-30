// Bun plugin to mock 'cloudflare:workers' imports
// This allows importing the config file outside of the wrangler runtime
import { plugin } from "bun";

plugin({
  name: "cloudflare-workers-mock",
  setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
      path: import.meta.resolveSync("./mocks/durable-object.mock.mjs"),
      namespace: "file",
    }));
  },
});
