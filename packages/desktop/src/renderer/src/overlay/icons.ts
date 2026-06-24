import {
  BotIcon,
  FileCodeIcon,
  GitCompareIcon,
  GlobeIcon,
  HandIcon,
  MonitorIcon,
  PlayIcon,
  SettingsIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { ClaudeMark, CodexMark } from "../components/AgentIcon";

/** Any icon usable in the overlay: lucide icons + our brand marks all accept a
 * `className` and paint with `currentColor`. */
type OverlayIcon = ComponentType<{ className?: string }>;

/**
 * Curated icons addressable by a stable string name. Menu descriptors cross the
 * IPC boundary (so they can't carry component references); both the overlay
 * document and the non-Electron fallback resolve icons by name here.
 */
export const OVERLAY_ICONS: Record<string, OverlayIcon> = {
  globe: GlobeIcon,
  play: PlayIcon,
  settings: SettingsIcon,
  editor: FileCodeIcon,
  terminal: TerminalIcon,
  agent: BotIcon,
  preview: MonitorIcon,
  diff: GitCompareIcon,
  hand: HandIcon,
  "shield-alert": ShieldAlertIcon,
  claude: ClaudeMark,
  codex: CodexMark,
};

/** Resolve a registered overlay icon by name (undefined when unknown/omitted). */
export function overlayIcon(name?: string): OverlayIcon | undefined {
  return name ? OVERLAY_ICONS[name] : undefined;
}
