import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolClient } from "../client.js";

describe("ToolClient", () => {
  it("reports a clear runtime-unavailable error", async () => {
    const socketPath = join(
      tmpdir(),
      `meith-missing-runtime-${process.pid}-${Date.now()}.sock`,
    );
    const client = new ToolClient({ socketPath, timeoutMs: 100 });

    await expect(client.connect()).rejects.toThrow(
      /Could not connect to the meith runtime.*pnpm dev:headless/s,
    );
  });
});
