import { homedir } from "node:os";
import { join } from "node:path";
import { bootstrap } from "./bootstrap.js";

/**
 * Headless boot of the main-process services WITHOUT Electron.
 *
 * This proves (and lets you test) the integration path:
 *   1. services start + socket server listens
 *   2. `~/.meith/config.json` is written
 *   3. the CLI can connect and call tools
 *
 * Run with: `pnpm --filter @meith/desktop dev:headless`
 */
async function main() {
  const userDataPath =
    process.env.MEITH_USER_DATA ?? join(homedir(), ".meith", "userData");

  const container = await bootstrap(userDataPath);
  container.logger.info("Harness", "headless services running. Ctrl+C to stop.");
  container.logger.info(
    "Harness",
    `socket: ${container.config.socketPath} | tools: ${container.registry
      .describe()
      .map((t) => t.name)
      .join(", ")}`,
  );

  const shutdown = async () => {
    await container.socket.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
