export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
  passthrough: string[];
}

/**
 * Minimal argv parser: supports --flag, --flag=value, --flag value,
 * -short, and bare positionals. No external dependencies.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];
  const passthrough: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        setFlag(flags, body.slice(0, eq), body.slice(eq + 1));
      } else if (body === "args") {
        // `--args` is a passthrough-style flag: dev-server arguments often
        // start with dashes (`node --args -e ...`), so consume the rest exactly.
        setFlag(flags, body, argv.slice(i + 1));
        break;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          setFlag(flags, body, next);
          i++;
        } else {
          setFlag(flags, body, true);
        }
      }
    } else if (token.startsWith("-") && token.length > 1) {
      setFlag(flags, token.slice(1), true);
    } else {
      positionals.push(token);
    }
  }

  const command = positionals.length > 0 ? positionals.shift()! : null;
  return { command, positionals, flags, passthrough };
}

function setFlag(
  flags: Record<string, string | boolean | string[]>,
  key: string,
  value: string | boolean | string[],
): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  const existingValues = Array.isArray(existing) ? existing : [String(existing)];
  const nextValues = Array.isArray(value) ? value : [String(value)];
  flags[key] = [...existingValues, ...nextValues];
}

/**
 * Coerce string flag values into JSON-friendly primitives so that
 * "--lines=120" becomes a number and "--watch" becomes a boolean.
 */
export function coerce(value: string | boolean | string[]): unknown {
  if (Array.isArray(value)) return value;
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
  positionalNames: string[] = [],
  reservedFlags: readonly string[] = [],
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const reserved = new Set(reservedFlags);
  positionalNames.forEach((name, i) => {
    if (parsed.positionals[i] !== undefined) {
      params[name] = coerce(parsed.positionals[i]);
    }
  });
  for (const [key, value] of Object.entries(parsed.flags)) {
    if (reserved.has(key)) continue;
    params[key] = coerce(value);
  }
  return params;
}
