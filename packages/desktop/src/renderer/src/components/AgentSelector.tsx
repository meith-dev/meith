import type { OverlayActionItem } from "@/lib/overlay";
import {
  ACP_PRESETS,
  type AcpPreset,
  type AgentConfigOption,
  isModelConfigOption,
  isReasoningConfigOption,
} from "@meith/shared";
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
  /** Config options advertised by the active agent (model + reasoning). */
  options?: AgentConfigOption[];
  /** True while options are being fetched. */
  loading?: boolean;
  /** Currently selected model value (session override or config default). */
  model?: string;
  /** Currently selected reasoning value. */
  reasoning?: string;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Switch to a different agent preset. */
  onChange: (preset: AcpPreset) => void;
  /** Persist a new model/reasoning selection. */
  onModelChange?: (patch: { model?: string; reasoning?: string }) => void;
  /** Notified when the menu opens/closes (e.g. to freeze the browser view). */
  onMenuOpenChange?: (open: boolean) => void;
}

function labelFor(option: AgentConfigOption | undefined, value: string): string {
  if (!value) return "";
  const match = option?.values.find((v) => v.value === value);
  return match?.name ?? value;
}

/**
 * Compact in-composer agent picker, shown beside the model switcher. The
 * trigger is icon-only (the agent's brand mark) to stay tight; the menu lists
 * each agent with its icon + label. Renders through {@link OverlayDropdown} so
 * the menu floats ABOVE the native browser view instead of being clipped.
 */
export function AgentSelector({
  preset,
  options = [],
  loading = false,
  model = "",
  reasoning = "",
  disabled,
  onChange,
  onModelChange,
  onMenuOpenChange,
}: AgentSelectorProps) {
  const modelOption = options.find((o) => isModelConfigOption(o));
  const reasoningOption = options.find((o) => isReasoningConfigOption(o));
  const hasModels = (modelOption?.values.length ?? 0) > 0;
  const hasReasoning = (reasoningOption?.values.length ?? 0) > 0;
  const activeModel = model || modelOption?.currentValue || "";
  const activeReasoning = reasoning || reasoningOption?.currentValue || "";
  const reasoningLabel = labelFor(reasoningOption, activeReasoning);

  const items: OverlayActionItem[] = SELECTABLE_PRESETS.map((p) => ({
    id: p,
    label: ACP_PRESETS[p].label,
    iconName: PRESET_ICON[p],
    groupLabel: "Agent",
    checked: p === preset,
    onSelect: () => onChange(p),
  }));

  if (onModelChange && !loading && hasReasoning && reasoningOption) {
    const groupLabel = reasoningOption.name || "Reasoning effort";
    for (let index = 0; index < reasoningOption.values.length; index += 1) {
      const v = reasoningOption.values[index];
      items.push({
        id: `reasoning:${v.value}`,
        label: v.name,
        groupLabel,
        separatorBefore: index === 0 && items.length > 0,
        checked: v.value === activeReasoning,
        onSelect: () => onModelChange({ reasoning: v.value }),
      });
    }
  }
  if (onModelChange && !loading && hasModels && modelOption) {
    const groupLabel = modelOption.name || "Model";
    for (let index = 0; index < modelOption.values.length; index += 1) {
      const v = modelOption.values[index];
      items.push({
        id: `model:${v.value}`,
        label: v.name,
        hint: v.value === activeModel && reasoningLabel ? reasoningLabel : undefined,
        groupLabel,
        separatorBefore: index === 0 && items.length > 0,
        checked: v.value === activeModel,
        onSelect: () => onModelChange({ model: v.value }),
      });
    }
  }

  return (
    <OverlayDropdown
      align="start"
      minWidth={176}
      onOpenChange={onMenuOpenChange}
      items={items}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Agent: ${ACP_PRESETS[preset].label}`}
          title={ACP_PRESETS[preset].label}
        >
          <AgentIcon preset={preset} className="size-4" />
        </button>
      }
    />
  );
}
