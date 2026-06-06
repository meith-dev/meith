export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Minimal argv parser: supports --flag, --flag=value, --flag value,
 * -short, and bare positionals. No external dependencies.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else if (token.startsWith("-") && token.length > 1) {
      flags[token.slice(1)] = true;
    } else {
      positionals.push(token);
    }
  }

  const command = positionals.length > 0 ? positionals.shift()! : null;
  return { command, positionals, flags };
}

/**
 * Coerce string flag values into JSON-friendly primitives so that
 * "--lines=120" becomes a number and "--watch" becomes a boolean.
 */
export function coerce(value: string | boolean): unknown {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

/**
 * Build a tool params object from parsed flags + positionals, using a
 * declarative mapping of positional slots to param names.
 */
export function buildParams(
  parsed: ParsedArgs,
  positionalNames: string[] = []
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  positionalNames.forEach((name, i) => {
    if (parsed.positionals[i] !== undefined) {
      params[name] = coerce(parsed.positionals[i]);
    }
  });
  for (const [key, value] of Object.entries(parsed.flags)) {
    params[key] = coerce(value);
  }
  return params;
}
