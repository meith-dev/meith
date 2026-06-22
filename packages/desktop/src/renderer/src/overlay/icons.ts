import {
  BotIcon,
  FileCodeIcon,
  GitCompareIcon,
  GlobeIcon,
  type LucideIcon,
  MonitorIcon,
  PlayIcon,
  SettingsIcon,
  TerminalIcon,
} from "lucide-react";

/**
 * Curated lucide icons addressable by a stable string name. Menu descriptors
 * cross the IPC boundary (so they can't carry component references); both the
 * overlay document and the non-Electron fallback resolve icons by name here.
 */
export const OVERLAY_ICONS: Record<string, LucideIcon> = {
  globe: GlobeIcon,
  play: PlayIcon,
  settings: SettingsIcon,
  editor: FileCodeIcon,
  terminal: TerminalIcon,
  agent: BotIcon,
  preview: MonitorIcon,
  diff: GitCompareIcon,
};

/** Resolve a registered overlay icon by name (undefined when unknown/omitted). */
export function overlayIcon(name?: string): LucideIcon | undefined {
  return name ? OVERLAY_ICONS[name] : undefined;
}
