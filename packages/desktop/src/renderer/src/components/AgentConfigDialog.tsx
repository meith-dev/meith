import { ACP_PRESETS, type AcpPreset, type AgentConfig } from "@meith/shared";
import { AlertTriangleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

interface AgentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfig;
  onSave: (patch: Partial<AgentConfig>) => void | Promise<void>;
}

/** Settings dialog for adapter selection, ACP command, model, and auto-accept. */
export function AgentConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: AgentConfigDialogProps) {
  const [draft, setDraft] = useState<AgentConfig>(config);

  // Reset the draft whenever the dialog opens with fresh config.
  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const isAcp = draft.adapter === "acp";
  const preset = draft.acpPreset ?? "custom";
  const isCustomPreset = preset === "custom";

  const handleSave = async () => {
    await onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agent settings</DialogTitle>
          <DialogDescription>
            Choose the runtime adapter and how tool permissions are handled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label htmlFor="agent-adapter" className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Adapter</span>
            <select
              id="agent-adapter"
              value={draft.adapter}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  adapter: e.target.value as AgentConfig["adapter"],
                }))
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="mock">Mock (built-in, no setup)</option>
              <option value="acp">ACP subprocess (external agent)</option>
            </select>
          </label>

          {isAcp && (
            <>
              <label htmlFor="agent-preset" className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Agent</span>
                <select
                  id="agent-preset"
                  value={preset}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, acpPreset: e.target.value as AcpPreset }))
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="claude">{ACP_PRESETS.claude.label}</option>
                  <option value="codex">{ACP_PRESETS.codex.label}</option>
                  <option value="custom">{ACP_PRESETS.custom.label}</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  {ACP_PRESETS[preset].description}
                </span>
              </label>

              {!isCustomPreset && (
                <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                  {ACP_PRESETS[preset].command} {ACP_PRESETS[preset].args.join(" ")}
                </p>
              )}

              {isCustomPreset && (
                <>
                  <label htmlFor="agent-command" className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Command
                    </span>
                    <Input
                      id="agent-command"
                      value={draft.command}
                      placeholder="e.g. my-agent-acp"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, command: e.target.value }))
                      }
                    />
                  </label>
                  <label htmlFor="agent-args" className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Arguments (space-separated)
                    </span>
                    <Input
                      id="agent-args"
                      value={draft.args.join(" ")}
                      placeholder="--acp"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          args: e.target.value.split(/\s+/).filter(Boolean),
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </>
          )}

          <label htmlFor="agent-model" className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Model (optional)
            </span>
            <Input
              id="agent-model"
              value={draft.model}
              placeholder="provider/model"
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            />
          </label>

          <div className="rounded-md border border-border p-3">
            <label htmlFor="agent-auto" className="flex items-start gap-2">
              <input
                id="agent-auto"
                type="checkbox"
                checked={draft.autoAccept}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, autoAccept: e.target.checked }))
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  Auto-accept tool permissions
                </span>
                <span className="text-xs text-muted-foreground">
                  Gated tools (write files, run processes, control the browser) run
                  without prompting.
                </span>
              </span>
            </label>
            {draft.autoAccept && (
              <div className="mt-2 flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  The agent can modify files and run commands without asking. Only enable
                  this if you trust the agent and the workspace.
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
