import { watch, type FSWatcher } from "fs";
import { createLogger } from "../../logger";

const DEBOUNCE_MS = 100;
const log = createLogger("config-watcher");

/**
 * Watches a config file for changes and triggers a callback with debouncing.
 * Handles errors in the callback to prevent watcher from dying.
 * Uses a mutex to prevent concurrent onChange executions.
 */
export class ConfigWatcher {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watcher: FSWatcher | null = null;
  private isProcessing = false;

  constructor(private configPath: string) {}

  start(onChange: () => Promise<void>) {
    log.debug(`Watching ${this.configPath} for changes`);

    this.watcher = watch(this.configPath, async (eventType) => {
      if (eventType === "change") {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(async () => {
          // Skip if already processing - the ongoing process will pick up file changes
          if (this.isProcessing) {
            log.debug("Config change detected, but rebuild already in progress");
            return;
          }

          this.isProcessing = true;
          log.info("Config changed, regenerating");
          try {
            await onChange();
          } catch (err) {
            log.error("Error regenerating config:", err);
          } finally {
            this.isProcessing = false;
          }
        }, DEBOUNCE_MS);
      }
    });
  }

  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
