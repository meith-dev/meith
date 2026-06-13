import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ParsedArgs } from "./args.js";
import { type OutputMode, out } from "./output.js";

/**
 * `meith setup` — print instructions for putting the `meith` command on PATH.
 * With `--write`, append the export line to the user's shell rc file (opt-in;
 * we never edit shell config without explicit consent).
 */
export function runSetup(parsed: ParsedArgs, mode: OutputMode): void {
  const binDir = resolveBinDir();
  const exportLine = `export PATH="${binDir}:$PATH"`;

  if (parsed.flags.write === true) {
    const rc = shellRcPath();
    if (rcContains(rc, binDir)) {
      if (!mode.quiet) out(`Already configured in ${rc}.`);
      return;
    }
    appendFileSync(rc, `\n# Added by "meith setup"\n${exportLine}\n`, "utf8");
    out(`Added meith to PATH in ${rc}.`);
    out("Restart your shell or run:");
    out(`  source ${rc}`);
    return;
  }

  out("To use the `meith` command from anywhere, add its directory to your PATH:");
  out("");
  out(`  ${exportLine}`);
  out("");
  out(`Add that line to ${shellRcPath()}, or re-run with --write to do it for you:`);
  out("  meith setup --write");
}

/** Directory containing the running `meith` executable. */
function resolveBinDir(): string {
  const invoked = process.argv[1];
  if (invoked) return dirname(invoked);
  return process.cwd();
}

/** Best-effort shell rc path based on the user's shell. */
function shellRcPath(): string {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return join(homedir(), ".zshrc");
  if (shell.includes("bash")) return join(homedir(), ".bashrc");
  if (shell.includes("fish")) return join(homedir(), ".config", "fish", "config.fish");
  return join(homedir(), ".profile");
}

/** True if the rc file already references the bin directory. */
function rcContains(rc: string, binDir: string): boolean {
  if (!existsSync(rc)) return false;
  try {
    return readFileSync(rc, "utf8").includes(binDir);
  } catch {
    return false;
  }
}
