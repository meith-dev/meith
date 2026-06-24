import { ChevronDownIcon, HandIcon, ShieldAlertIcon } from "lucide-react";
import { OverlayDropdown } from "./OverlayDropdown";

interface AgentAccessSwitcherProps {
  /** Whether gated tools run without prompting (full access). */
  autoAccept: boolean;
  /** Disable interaction (e.g. while a turn is running or no session). */
  disabled?: boolean;
  /** Persist a new access mode. */
  onChange: (autoAccept: boolean) => void;
  /** Notified when the menu opens/closes (e.g. to freeze the browser view). */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * Compact in-composer access-mode switcher, shown to the right of the model
 * switcher. Mirrors the Codex control: a shield-alert icon + "Full access" in
 * the brand color when gated tools auto-run, or a hand icon + "Ask for
 * approval" in muted gray when each gated tool requires confirmation. Renders
 * through {@link OverlayDropdown} so the menu floats ABOVE the native browser
 * view instead of being clipped behind it.
 */
export function AgentAccessSwitcher({
  autoAccept,
  disabled,
  onChange,
  onMenuOpenChange,
}: AgentAccessSwitcherProps) {
  const Icon = autoAccept ? ShieldAlertIcon : HandIcon;

  return (
    <OverlayDropdown
      align="start"
      minWidth={248}
      onOpenChange={onMenuOpenChange}
      items={[
        {
          id: "approval",
          label: "Ask for approval",
          iconName: "hand",
          description: "Confirm each gated tool before it runs.",
          groupLabel: "Access",
          checked: !autoAccept,
          onSelect: () => onChange(false),
        },
        {
          id: "full",
          label: "Full access",
          iconName: "shield-alert",
          description:
            "Write files, run processes, and control the browser without prompting.",
          groupLabel: "Access",
          checked: autoAccept,
          onSelect: () => onChange(true),
        },
      ]}
      trigger={
        <button
          type="button"
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
        </button>
      }
    />
  );
}
