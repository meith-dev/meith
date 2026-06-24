import { ACP_PRESETS, type AcpPreset } from "@meith/shared";
import { ChevronDownIcon } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import { OverlayDropdown } from "./OverlayDropdown";

/** Presets the composer lets you switch between, in display order. */
const SELECTABLE_PRESETS: AcpPreset[] = ["claude", "codex", "custom"];

/** Overlay icon name for each preset's brand mark. */
const PRESET_ICON: Record<AcpPreset, string> = {
  claude: "claude",
  codex: "codex",
  custom: "terminal",
};

interface AgentSelectorProps {
  /** Currently selected agent preset. */
  preset: AcpPreset;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Switch to a different agent preset. */
  onChange: (preset: AcpPreset) => void;
  /** Notified when the menu opens/closes (e.g. to freeze the browser view). */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * Compact in-composer agent picker, shown beside the model switcher. The
 * trigger is icon-only (the agent's brand mark) to stay tight; the menu lists
 * each agent with its icon + label. Renders through {@link OverlayDropdown} so
 * the menu floats ABOVE the native browser view instead of being clipped.
 */
export function AgentSelector({
  preset,
  disabled,
  onChange,
  onMenuOpenChange,
}: AgentSelectorProps) {
  return (
    <OverlayDropdown
      align="start"
      minWidth={176}
      onOpenChange={onMenuOpenChange}
      items={SELECTABLE_PRESETS.map((p) => ({
        id: p,
        label: ACP_PRESETS[p].label,
        iconName: PRESET_ICON[p],
        groupLabel: "Agent",
        checked: p === preset,
        onSelect: () => onChange(p),
      }))}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Agent: ${ACP_PRESETS[preset].label}`}
          title={ACP_PRESETS[preset].label}
        >
          <AgentIcon preset={preset} className="size-4" />
          <ChevronDownIcon className="size-3" aria-hidden />
        </button>
      }
    />
  );
}
