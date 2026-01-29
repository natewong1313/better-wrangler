import type { ParsedArgs } from "../types";
import { syncAll } from "../sync";

export async function syncCommand(args: ParsedArgs, configPath: string) {
  await syncAll(configPath, args.workerFilter);
  console.log("Sync complete");
}
