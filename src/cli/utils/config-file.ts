import { existsSync } from "fs";
import { join } from "path";

// Not sure which is better
const CONFIG_FILENAMES = ["bw.config.ts", "better-wrangler.config.ts"];

export async function findConfigFile() {
  for (const filename of CONFIG_FILENAMES) {
    const path = join(process.cwd(), filename);
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error(`No config file found. Create one of: ${CONFIG_FILENAMES.join(", ")}`);
}
