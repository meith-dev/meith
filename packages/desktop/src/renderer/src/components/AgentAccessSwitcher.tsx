import { ChevronDownIcon, HandIcon, ShieldAlertIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface AgentAccessSwitcherProps {
  /** Whether gated tools run without prompting (full access). */
  autoAccept: boolean;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Persist a new access mode. */
  onChange: (autoAccept: boolean) => void;
}

/** Radio value encoding for the two access modes. */
const FULL = "full";
const APPROVAL = "approval";

/**
 * Compact in-composer access-mode switcher, shown to the right of the model
 * switcher. Mirrors the Codex control: a shield-alert icon + "Full access" in
 * the brand color when gated tools auto-run, or a hand icon + "Ask for
 * approval" in muted gray when each gated tool requires confirmation.
 */
export function AgentAccessSwitcher({
  autoAccept,
  disabled,
  onChange,
}: AgentAccessSwitcherProps) {
  const Icon = autoAccept ? ShieldAlertIcon : HandIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${
          autoAccept
            ? "text-primary hover:text-primary"
            : "text-muted-foreground hover:text-accent-foreground"
        }`}
        aria-label={`Access mode: ${autoAccept ? "Full access" : "Ask for approval"}`}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="font-medium">
          {autoAccept ? "Full access" : "Ask for approval"}
        </span>
        <ChevronDownIcon className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="min-w-56">
        <DropdownMenuRadioGroup
          value={autoAccept ? FULL : APPROVAL}
          onValueChange={(value) => onChange(value === FULL)}
        >
          <DropdownMenuLabel>Access</DropdownMenuLabel>
          <DropdownMenuRadioItem value={APPROVAL}>
            <span className="flex items-center gap-2">
              <HandIcon className="size-4 shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span>Ask for approval</span>
                <span className="text-xs text-muted-foreground">
                  Confirm each gated tool before it runs.
                </span>
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value={FULL}>
            <span className="flex items-center gap-2">
              <ShieldAlertIcon className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="flex flex-col">
                <span>Full access</span>
                <span className="text-xs text-muted-foreground">
                  Write files, run processes, and control the browser without prompting.
                </span>
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
