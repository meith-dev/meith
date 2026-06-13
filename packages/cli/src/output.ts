import type { ToolResult } from "@meith/shared";
import { resolveSocketPath } from "./client.js";

/** Output preferences derived from global CLI flags. */
export interface OutputMode {
  /** Print raw JSON envelopes instead of friendly text. */
  json: boolean;
  /** Suppress progress/diagnostics chatter on stderr; print only results. */
  quiet: boolean;
}

/** Write a line to stdout. */
export function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** Write a line to stderr unless quiet mode is on. */
export function info(text: string, mode: OutputMode): void {
  if (!mode.quiet) process.stderr.write(`${text}\n`);
}

/** Print a top-level error and set a non-zero exit code. */
export function fail(message: string, socketPath?: string): void {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write(`socket: ${socketPath ?? resolveSocketPath()}\n`);
  process.exitCode = 1;
}

/** Render any JSON-serializable value to stdout. */
export function printJson(value: unknown): void {
  out(JSON.stringify(value, null, 2));
}

/**
 * Render a `ToolResult` envelope. In `--json` mode the raw envelope is printed;
 * otherwise content is printed as text and failures go to stderr. In `--quiet`
 * mode informational diagnostics are suppressed (errors are always shown).
 */
export function printResult(result: ToolResult, mode: OutputMode): void {
  if (mode.json) {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (!mode.quiet && result.diagnostics?.length) {
    for (const d of result.diagnostics) {
      process.stderr.write(`  [${d.level}] ${d.message}\n`);
    }
  }

  if (!result.ok) {
    const err = result.error;
    process.stderr.write(
      `error (${err?.code ?? "TOOL_FAILED"}): ${err?.message ?? "failed"}\n`,
    );
    if (err?.details !== undefined) {
      process.stderr.write(`${JSON.stringify(err.details, null, 2)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const content = result.content;
  if (content == null) {
    if (!mode.quiet) out("ok");
  } else if (typeof content === "string") {
    out(content);
  } else {
    printJson(content);
  }
}

/**
 * Print a screenshot/artifact result. In text mode prints just the artifact
 * path (script-friendly); falls back to the full envelope when there's no path.
 */
export function printArtifact(result: ToolResult, mode: OutputMode): void {
  if (mode.json) {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (
    result.ok &&
    result.content &&
    typeof result.content === "object" &&
    typeof (result.content as { path?: unknown }).path === "string"
  ) {
    out((result.content as { path: string }).path);
    return;
  }
  printResult(result, mode);
}
