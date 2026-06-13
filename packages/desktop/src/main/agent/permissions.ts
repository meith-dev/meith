import type { ToolDescriptor } from "@meith/protocol";
import type { ToolCapability } from "@meith/shared";

/**
 * Capability-based permission classification for agent tool calls.
 *
 * Read-only tools are always auto-allowed. Anything that writes files, starts
 * processes, controls the browser, or is destructive is "gated": the runtime
 * pauses the call and asks the user to approve it (unless auto-accept is on).
 * `accesses-network` alone is treated as non-gated (read-like) since many
 * read-only tools also touch the network.
 */

/** Capabilities that require explicit approval before the tool runs. */
const GATED_CAPABILITIES: ReadonlySet<ToolCapability> = new Set([
  "writes-files",
  "starts-process",
  "controls-browser",
  "destructive",
]);

/**
 * Decide whether a tool requires approval, and which capability is the reason.
 * Returns `null` when the call is auto-allowed (read-only / network-only).
 */
export function gatingCapability(
  capabilities: readonly ToolCapability[] | undefined,
): ToolCapability | null {
  if (!capabilities || capabilities.length === 0) return null;
  // Prefer the most severe reason for a clear approval prompt.
  const order: ToolCapability[] = [
    "destructive",
    "writes-files",
    "starts-process",
    "controls-browser",
  ];
  for (const cap of order) {
    if (capabilities.includes(cap) && GATED_CAPABILITIES.has(cap)) return cap;
  }
  return null;
}

/** True when a tool with these capabilities needs approval before running. */
export function requiresApproval(
  capabilities: readonly ToolCapability[] | undefined,
): boolean {
  return gatingCapability(capabilities) !== null;
}

/** Look up a tool's capabilities from a descriptor list (empty if unknown). */
export function capabilitiesFor(
  tools: readonly ToolDescriptor[],
  name: string,
): ToolCapability[] {
  return tools.find((t) => t.name === name)?.capabilities ?? [];
}
