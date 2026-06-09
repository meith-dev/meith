#!/usr/bin/env node

try {
  await import("../dist/index.js");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") {
    console.error("The meith CLI has not been built yet. Run `pnpm build:deps` first.");
    process.exit(1);
  }

  throw error;
}
