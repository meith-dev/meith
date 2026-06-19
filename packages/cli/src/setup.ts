import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MeithConfigSchema } from "@meith/shared";
import type { ParsedArgs } from "./args.js";
import { meithHome } from "./instances.js";
import { type OutputMode, out } from "./output.js";

/**
 * `meith setup` — print instructions for putting the `meith` command on PATH.
 * With `--write`, append the export line to the user's shell rc file (opt-in;
 * we never edit shell config without explicit consent).
 */
export function runSetup(parsed: ParsedArgs, mode: OutputMode): void {
  const binDir = resolveBinDir();
  const { rc, exportLine } = shellTarget(binDir);

  if (parsed.flags.write === true) {
    if (rcContains(rc, binDir)) {
      if (!mode.quiet) out(`Already configured in ${rc}.`);
      return;
    }
    // Ensure the parent directory exists (notably `~/.config/fish`).
    mkdirSync(dirname(rc), { recursive: true });
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
  out(`Add that line to ${rc}, or re-run with --write to do it for you:`);
  out("  meith setup --write");
}

/** Directory containing the running `meith` executable. */
function resolveBinDir(): string {
  const configPath = join(meithHome(), "config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = MeithConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
      if (cfg.cliBinPath) return dirname(cfg.cliBinPath);
    } catch {
      // Fall back to the invoked executable.
    }
  }
  const invoked = process.argv[1];
  if (invoked) return dirname(invoked);
  return process.cwd();
}

/**
 * Best-effort shell rc path and the syntactically-correct line to add `binDir`
 * to PATH for that shell. fish uses `fish_add_path` (idempotent) rather than the
 * POSIX `export PATH=...` form, which it cannot parse.
 */
function shellTarget(binDir: string): { rc: string; exportLine: string } {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("fish")) {
    return {
      rc: join(homedir(), ".config", "fish", "config.fish"),
      exportLine: `fish_add_path ${binDir}`,
    };
  }
  const exportLine = `export PATH="${binDir}:$PATH"`;
  if (shell.includes("zsh")) return { rc: join(homedir(), ".zshrc"), exportLine };
  if (shell.includes("bash")) return { rc: join(homedir(), ".bashrc"), exportLine };
  return { rc: join(homedir(), ".profile"), exportLine };
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
