import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolDescriptor } from "@meith/protocol";
import { ToolClient } from "./client.js";
import { type CommandSpec, commands, listCommands } from "./commands.js";
import { out } from "./output.js";

/** Read the CLI's own version from its package.json (best-effort). */
export function cliVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The top-level `meith --help` text. */
export function topLevelHelp(): string {
  return `meith — control the meith desktop runtime from your terminal

Usage:
  meith [path]                  Launch the app (optionally open a project path)
  meith new [name]              Create and open a new project
  meith <command> [args] [--flags]
  meith call <toolName> [--key value ...]
  meith app <list|logs|health|bug-report|kill|screenshot>

Commands:
${listCommands()}

Built-in:
  app               Inspect/control running instances (list, logs, health, bug-report, kill, screenshot)
  setup             Print shell PATH setup instructions (--write to apply)
  tools             List every tool the runtime exposes
  call <toolName>   Invoke any registered tool by its exact name
  devlogs           Stream a dev server's logs (attach by --cwd or --id)

Options:
  --socket <path>   Override the runtime socket path
  --instance <id>   Target a specific instance by pid or label
  --timeout <ms>    Per-call timeout override
  --json            Print the raw ToolResult envelope as JSON
  --quiet           Suppress progress/diagnostics; print only results
  --arg-json <json> Merge a JSON object into the tool params
  --<key>-json <v>  Parse a single flag value as JSON (nested params)
  --stdin           Read a JSON params object from stdin
  -v, --verbose     Print streamed tool log events
  -V, --version     Print the CLI version
  -h, --help        Show this help (use "meith <command> --help" for details)

Run "meith <command> --help" for command-specific help.`;
}

/**
 * Print command-specific help. Static help (summary + positional slots) is
 * always available offline; when the runtime is reachable, it is enriched with
 * the tool's description and JSON-schema-derived flags from its descriptor.
 */
export async function commandHelp(
  command: string,
  socketPath: string,
  timeoutMs?: number,
): Promise<void> {
  // `call <tool>` and direct tool help are purely dynamic.
  if (command === "call") {
    out("Usage: meith call <toolName> [--key value ...]");
    out("Run with a running runtime to inspect a specific tool's parameters:");
    out("  meith call <toolName> --help");
    return;
  }

  const spec: CommandSpec | undefined = commands[command];
  if (spec) {
    out(`meith ${command} — ${spec.summary}`);
    const usageArgs = spec.positionals.map((p) => `<${p}>`).join(" ");
    out(`\nUsage:\n  meith ${command}${usageArgs ? ` ${usageArgs}` : ""} [--flags]`);
    out(`\nRuntime tool: ${spec.tool}`);
    const descriptor = await tryDescribe(spec.tool, socketPath, timeoutMs);
    if (descriptor) printDescriptor(descriptor);
    else out("\n(Start the app to see this tool's parameters.)");
    return;
  }

  // Unknown command: treat the token as a tool name for dynamic help.
  const descriptor = await tryDescribe(command, socketPath, timeoutMs);
  if (descriptor) {
    out(`meith call ${command}`);
    printDescriptor(descriptor);
  } else {
    out(`No static help for "${command}".`);
    out('Start the app and run "meith call <toolName> --help" for tool details.');
  }
}

/** Print help for a specific tool name (`meith call <tool> --help`). */
export async function toolHelp(
  toolName: string,
  socketPath: string,
  timeoutMs?: number,
): Promise<void> {
  const descriptor = await tryDescribe(toolName, socketPath, timeoutMs);
  if (!descriptor) {
    out(`Cannot describe "${toolName}": the runtime is not reachable.`);
    out('Start the desktop app (or "pnpm dev:headless") and try again.');
    process.exitCode = 1;
    return;
  }
  out(`meith call ${toolName}`);
  printDescriptor(descriptor);
}

/** Connect briefly and return the descriptor for `toolName`, or undefined. */
async function tryDescribe(
  toolName: string,
  socketPath: string,
  timeoutMs?: number,
): Promise<ToolDescriptor | undefined> {
  const client = new ToolClient({ socketPath, timeoutMs: timeoutMs ?? 3000 });
  try {
    await client.connect();
    const tools = await client.listTools();
    return tools.find((t) => t.name === toolName);
  } catch {
    return undefined;
  } finally {
    client.close();
  }
}

/** Render a tool descriptor's description + parameters from its JSON schema. */
function printDescriptor(descriptor: ToolDescriptor): void {
  out(`\n${descriptor.description}`);
  const flags = schemaFlags(descriptor.inputSchema);
  if (flags.length > 0) {
    out("\nParameters:");
    for (const line of flags) out(line);
  } else {
    out("\n(no parameters)");
  }
  if (descriptor.capabilities.length > 0) {
    out(`\nCapabilities: ${descriptor.capabilities.join(", ")}`);
  }
}

/** Turn a JSON-Schema object into human-readable `--key <type>` lines. */
function schemaFlags(schema: Record<string, unknown>): string[] {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const lines: string[] = [];
  for (const [key, def] of Object.entries(props)) {
    const type = describeType(def);
    const req = required.has(key) ? " (required)" : "";
    const desc = typeof def.description === "string" ? `\n      ${def.description}` : "";
    lines.push(`  --${key} <${type}>${req}${desc}`);
  }
  return lines;
}

/** Best-effort JSON-Schema type label for a property definition. */
function describeType(def: Record<string, unknown>): string {
  if (Array.isArray(def.enum)) return def.enum.join("|");
  if (typeof def.type === "string") return def.type;
  if (Array.isArray(def.type)) return def.type.join("|");
  if (def.anyOf || def.oneOf) return "value";
  return "value";
}
