import type { ParsedArgs } from "../types";
import { syncAll } from "../sync";
import { createLogger } from "../../logger";

const log = createLogger("sync");

export async function syncCommand(args: ParsedArgs, configPath: string) {
  await syncAll(configPath, args.workerFilter);
  log.info("Sync complete");
}
