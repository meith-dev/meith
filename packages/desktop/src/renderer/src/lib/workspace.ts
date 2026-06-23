import type { WorkspaceTab } from "@meith/shared";
import {
  BotIcon,
  FileCodeIcon,
  GitCompareIcon,
  type LucideIcon,
  MonitorIcon,
  TerminalIcon,
} from "lucide-react";

/** Icon + human label for each workspace-tab kind. */
export const WORKSPACE_KINDS: Record<
  WorkspaceTab["kind"],
  { icon: LucideIcon; label: string }
> = {
  editor: { icon: FileCodeIcon, label: "Editor" },
  terminal: { icon: TerminalIcon, label: "Terminal" },
  agent: { icon: BotIcon, label: "Agent" },
  preview: { icon: MonitorIcon, label: "Preview" },
  diff: { icon: GitCompareIcon, label: "Diff" },
};

/**
 * Maps each workspace kind to a stable overlay icon name (see
 * `overlay/icons.ts`). Used when a menu must cross the IPC boundary to the
 * overlay window, which can't carry React component references.
 */
export const WORKSPACE_ICON_NAME: Record<WorkspaceTab["kind"], string> = {
  editor: "editor",
  terminal: "terminal",
  agent: "agent",
  preview: "preview",
  diff: "diff",
};

/** Strip a filesystem path down to its last segment for compact display. */
export function basename(path: string): string {
  const parts = path.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/** Best-effort hostname for a URL, falling back to the raw string. */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
