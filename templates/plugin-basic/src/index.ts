/**
 * meith plugin (basic).
 *
 * A plugin registers tools into the same `ToolRegistry` every caller (CLI,
 * renderer, agents) uses, so a plugin tool is indistinguishable from a built-in
 * one. The host loads the default export, enforces the declared `capabilities`,
 * namespaces the tool names, and runs the plugin in an isolated context.
 *
 * See ../README.md and docs/developer/PLUGIN_API.md in the meith repo for the full
 * contract. The `MeithPlugin` / `PluginApi` types below are intentionally
 * local placeholders until `@meith/protocol` exports them.
 */

// --- Local placeholder types (replace with `@meith/protocol` once exported) ---
type ToolCapability =
  | "read-only"
  | "writes-files"
  | "controls-browser"
  | "starts-process"
  | "accesses-network"
  | "destructive";

interface ZodLike {
  object: (shape: Record<string, unknown>) => unknown;
  string: () => { default: (value: string) => unknown };
}

interface PluginApi {
  z: ZodLike;
  registerTool: (tool: {
    name: string;
    description: string;
    capabilities?: ToolCapability[];
    inputSchema: unknown;
    execute: (ctx: unknown, input: Record<string, unknown>) => unknown;
  }) => void;
}

interface MeithPlugin {
  id: string;
  name: string;
  version: string;
  capabilities: ToolCapability[];
  register: (api: PluginApi) => void;
}

const plugin: MeithPlugin = {
  id: "com.example.hello",
  name: "Hello",
  version: "0.1.0",
  // Declare every capability the plugin's tools may use; the host enforces that
  // these are a subset of what the user granted at install time.
  capabilities: ["read-only"],
  register(api) {
    api.registerTool({
      name: "hello_world",
      description: "Return a friendly greeting.",
      capabilities: ["read-only"],
      inputSchema: api.z.object({ name: api.z.string().default("world") }),
      execute: (_ctx, input) => ({ message: `hello, ${input.name ?? "world"}` }),
    });
  },
};

export default plugin;
