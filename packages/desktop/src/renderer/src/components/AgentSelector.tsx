import { ACP_PRESETS, type AcpPreset } from "@meith/shared";
import { ChevronDownIcon } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** Presets the composer lets you switch between, in display order. */
const SELECTABLE_PRESETS: AcpPreset[] = ["claude", "codex", "custom"];

interface AgentSelectorProps {
  /** Currently selected agent preset. */
  preset: AcpPreset;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Switch to a different agent preset. */
  onChange: (preset: AcpPreset) => void;
}

/**
 * Compact in-composer agent picker, shown beside the model switcher. The
 * trigger is icon-only (the agent's brand mark) to stay tight; the menu lists
 * each agent with its icon + label for clarity.
 */
export function AgentSelector({ preset, disabled, onChange }: AgentSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Agent: ${ACP_PRESETS[preset].label}`}
        title={ACP_PRESETS[preset].label}
      >
        <AgentIcon preset={preset} className="size-4" />
        <ChevronDownIcon className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="min-w-40">
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={(value) => onChange(value as AcpPreset)}
        >
          <DropdownMenuLabel>Agent</DropdownMenuLabel>
          {SELECTABLE_PRESETS.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <span className="flex items-center gap-2">
                <AgentIcon preset={p} className="size-4 shrink-0" />
                {ACP_PRESETS[p].label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
