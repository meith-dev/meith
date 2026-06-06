#!/usr/bin/env node
import { parseArgs, buildParams } from "./args.js";
import { commands, listCommands } from "./commands.js";
import { ToolClient, resolveSocketPath } from "./client.js";

const HELP = `aide — control the AIDE desktop runtime from your terminal

Usage:
  aide <command> [args] [--flags]
  aide call <toolName> [--key value ...]
  aide tools

Commands:
${listCommands()}

Built-in:
  tools             List every tool the runtime exposes
  call <toolName>   Invoke any registered tool by its exact name

Options:
  --socket <path>   Override the runtime socket path
  --json            Print raw JSON output
  -h, --help        Show this help
`;

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.flags.help === true || parsed.flags.h === true) {
    process.stdout.write(HELP + "\n");
    return;
  }

  const socketPath =
    typeof parsed.flags.socket === "string" ? parsed.flags.socket : undefined;
  const asJson = parsed.flags.json === true;
  delete parsed.flags.socket;
  delete parsed.flags.json;

  const client = new ToolClient({ socketPath });
  try {
    await client.connect();

    if (parsed.command === "tools") {
      const tools = await client.listTools();
      if (asJson) {
        process.stdout.write(JSON.stringify(tools, null, 2) + "\n");
      } else {
        for (const t of tools) {
          process.stdout.write(`${t.name}\n    ${t.description}\n`);
        }
      }
      return;
    }

    let toolName: string;
    let params: Record<string, unknown>;

    if (parsed.command === "call") {
      const name = parsed.positionals.shift();
      if (!name) {
        fail('Usage: aide call <toolName> [--key value ...]');
        return;
      }
      toolName = name;
      params = buildParams(parsed, []);
    } else {
      const spec = commands[parsed.command];
      if (!spec) {
        fail(`Unknown command "${parsed.command}". Run "aide --help".`);
        return;
      }
      toolName = spec.tool;
      params = buildParams(parsed, spec.positionals);
    }

    const result = await client.callTool(toolName, params);
    printResult(result, asJson);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    client.close();
  }
}

function printResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  if (result == null) process.stdout.write("ok\n");
  else if (typeof result === "string") process.stdout.write(result + "\n");
  else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

function fail(message: string): void {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write(`socket: ${resolveSocketPath()}\n`);
  process.exitCode = 1;
}

void main();
