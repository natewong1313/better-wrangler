import type { ParsedArgs } from "../types";
import { syncAll } from "../sync";
import { runMiniflareDevMode } from "../dev/miniflare";
import { runLegacyDevMode } from "../dev/legacy";

export async function devCommand(args: ParsedArgs, configPath: string) {
  const syncResult = await syncAll(configPath, args.workerFilter);

  if (args.useLegacy) {
    await runLegacyDevMode(configPath, args.workerFilter, syncResult);
  } else {
    await runMiniflareDevMode(configPath, args.workerFilter, syncResult);
  }
}
