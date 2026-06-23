import type { AgentConfigOption } from "@meith/shared";
import { isModelConfigOption, isReasoningConfigOption } from "@meith/shared";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

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
}

/** Short label for a value, falling back to the raw value. */
function labelFor(option: AgentConfigOption | undefined, value: string): string {
  if (!value) return "";
  const match = option?.values.find((v) => v.value === value);
  return match?.name ?? value;
}

/**
 * Compact in-composer switcher for the active agent's model + reasoning effort,
 * inspired by the Codex switcher: a Reasoning list with a nested Model submenu.
 * Only renders when the agent advertises at least one selectable option.
 */
export function AgentModelSwitcher({
  options,
  loading,
  model,
  reasoning,
  disabled,
  onChange,
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label="Switch model and reasoning"
      >
        {modelLabel && <span className="font-medium text-foreground">{modelLabel}</span>}
        {reasoningLabel && <span>{reasoningLabel}</span>}
        {!modelLabel && !reasoningLabel && <span>Model</span>}
        <ChevronDownIcon className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="min-w-44">
        {hasReasoning && reasoningOption && (
          // Base UI's GroupLabel must live inside a Group/RadioGroup (it reads
          // the group context), so the section header goes INSIDE the group.
          <DropdownMenuRadioGroup
            value={activeReasoning}
            onValueChange={(value) => onChange({ reasoning: value })}
          >
            <DropdownMenuLabel>{reasoningOption.name || "Reasoning"}</DropdownMenuLabel>
            {reasoningOption.values.map((v) => (
              <DropdownMenuRadioItem key={v.value} value={v.value}>
                {v.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}

        {hasReasoning && hasModels && <DropdownMenuSeparator />}

        {hasModels && modelOption && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span className="flex-1">{modelOption.name || "Model"}</span>
              {modelLabel && (
                <span className="text-xs text-muted-foreground">{modelLabel}</span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              <DropdownMenuRadioGroup
                value={activeModel}
                onValueChange={(value) => onChange({ model: value })}
              >
                <DropdownMenuLabel>{modelOption.name || "Model"}</DropdownMenuLabel>
                {modelOption.values.map((v) => (
                  <DropdownMenuRadioItem key={v.value} value={v.value}>
                    {v.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
