import { createRequire } from "node:module";

export function versionCommand(): void {
  const require = createRequire(import.meta.url);
  const packageJson = require("../../../package.json");
  console.log(`bw v${packageJson.version}`);
}
