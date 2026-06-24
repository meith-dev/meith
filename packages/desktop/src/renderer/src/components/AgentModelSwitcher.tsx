import type { OverlayActionItem } from "@/lib/overlay";
import type { AgentConfigOption } from "@meith/shared";
import { isModelConfigOption, isReasoningConfigOption } from "@meith/shared";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { OverlayDropdown } from "./OverlayDropdown";

interface AgentModelSwitcherProps {
  /** Config options advertised by the active agent (model + reasoning). */
  options: AgentConfigOption[];
  /** True while options are being fetched. */
  loading: boolean;
  /** Currently selected model value (session override or config default). */
  model: string;
  /** Currently selected reasoning value. */
  reasoning: string;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Persist a new model/reasoning selection. */
  onChange: (patch: { model?: string; reasoning?: string }) => void;
  /** Notified when the menu opens/closes (e.g. to freeze the browser view). */
  onMenuOpenChange?: (open: boolean) => void;
}

/** Short label for a value, falling back to the raw value. */
function labelFor(option: AgentConfigOption | undefined, value: string): string {
  if (!value) return "";
  const match = option?.values.find((v) => v.value === value);
  return match?.name ?? value;
}

/**
 * Compact in-composer switcher for the active agent's model + reasoning effort,
 * inspired by the Codex switcher. Renders through {@link OverlayDropdown} so the
 * menu floats ABOVE the native browser view instead of being clipped behind it;
 * the reasoning + model options are shown as two groups in a single menu (the
 * overlay menu is flat — it has no nested submenus). Only renders when the agent
 * advertises at least one selectable option.
 */
export function AgentModelSwitcher({
  options,
  loading,
  model,
  reasoning,
  disabled,
  onChange,
  onMenuOpenChange,
}: AgentModelSwitcherProps) {
  const modelOption = options.find((o) => isModelConfigOption(o));
  const reasoningOption = options.find((o) => isReasoningConfigOption(o));

  const hasModels = (modelOption?.values.length ?? 0) > 0;
  const hasReasoning = (reasoningOption?.values.length ?? 0) > 0;

  if (loading) {
    return (
      <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" aria-hidden />
        Loading models…
      </span>
    );
  }

  // Nothing to switch (e.g. mock adapter / agent advertises no options).
  if (!hasModels && !hasReasoning) return null;

  const activeModel = model || modelOption?.currentValue || "";
  const activeReasoning = reasoning || reasoningOption?.currentValue || "";
  const modelLabel = labelFor(modelOption, activeModel);
  const reasoningLabel = labelFor(reasoningOption, activeReasoning);

  const items: OverlayActionItem[] = [];
  if (hasReasoning && reasoningOption) {
    const groupLabel = reasoningOption.name || "Reasoning effort";
    for (const v of reasoningOption.values) {
      items.push({
        id: `reasoning:${v.value}`,
        label: v.name,
        groupLabel,
        checked: v.value === activeReasoning,
        onSelect: () => onChange({ reasoning: v.value }),
      });
    }
  }
  if (hasModels && modelOption) {
    const groupLabel = modelOption.name || "Model";
    modelOption.values.forEach((v, i) => {
      items.push({
        id: `model:${v.value}`,
        label: v.name,
        groupLabel,
        separatorBefore: i === 0 && items.length > 0,
        checked: v.value === activeModel,
        onSelect: () => onChange({ model: v.value }),
      });
    });
  }

  return (
    <OverlayDropdown
      align="start"
      minWidth={208}
      onOpenChange={onMenuOpenChange}
      items={items}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          aria-label="Switch model and reasoning"
        >
          {modelLabel && (
            <span className="font-medium text-foreground">{modelLabel}</span>
          )}
          {reasoningLabel && <span>{reasoningLabel}</span>}
          {!modelLabel && !reasoningLabel && <span>Model</span>}
          <ChevronDownIcon className="size-3" aria-hidden />
        </button>
      }
    />
  );
}
