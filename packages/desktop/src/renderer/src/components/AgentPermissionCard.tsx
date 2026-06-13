import type { AgentPermissionRequest, ToolCapability } from "@meith/shared";
import { ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

const CAPABILITY_LABELS: Record<ToolCapability, string> = {
  "read-only": "read state",
  "writes-files": "write files",
  "starts-process": "start a process",
  "controls-browser": "control the browser",
  "accesses-network": "access the network",
  destructive: "perform a destructive action",
};

interface AgentPermissionCardProps {
  request: AgentPermissionRequest;
  onDecide: (
    request: AgentPermissionRequest,
    decision: "allow" | "deny",
    remember: boolean,
  ) => void;
}

/**
 * Inline approval card for a gated tool call. The agent is paused until the
 * user allows or denies; "remember" persists the choice for this tool for the
 * rest of the session.
 */
export function AgentPermissionCard({ request, onDecide }: AgentPermissionCardProps) {
  const [remember, setRemember] = useState(false);
  const action = CAPABILITY_LABELS[request.capability] ?? request.capability;
  const argText = JSON.stringify(request.args ?? {});

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldAlertIcon
          className="size-4 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <span>Permission required</span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        The agent wants to run{" "}
        <code className="font-mono text-foreground">{request.toolName}</code> to {action}.
      </p>
      {argText !== "{}" && (
        <code className="mt-1.5 block break-all rounded bg-background/60 p-1.5 font-mono text-xs text-muted-foreground">
          {argText}
        </code>
      )}
      <label className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        Remember for this tool in this session
      </label>
      <div className="mt-2.5 flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => onDecide(request, "allow", remember)}
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDecide(request, "deny", remember)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
