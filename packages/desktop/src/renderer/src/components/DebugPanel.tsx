import type { AppState, LogEntry } from "@meith/shared";
import type { ToolDescriptor } from "@meith/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Workbench } from "@/hooks/useWorkbench";

interface DebugPanelProps {
  workbench: Workbench;
  state: AppState | null;
  onClose: () => void;
}

/**
 * Bottom diagnostics drawer. Consolidates the developer surfaces from the
 * scaffold (tool runner, raw state, logs) into a single tabbed panel that sits
 * under the workbench and can be toggled with Cmd/Ctrl+J.
 */
export function DebugPanel({ workbench, state, onClose }: DebugPanelProps) {
  return (
    <section
      aria-label="Diagnostics"
      className="flex h-72 shrink-0 flex-col border-t border-border bg-card"
    >
      <Tabs defaultValue="tools" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center justify-between border-b border-border px-2">
          <TabsList className="bg-transparent">
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground"
          >
            Close
          </Button>
        </div>

        <TabsContent value="tools" className="min-h-0 flex-1">
          <ToolRunner workbench={workbench} />
        </TabsContent>
        <TabsContent value="state" className="min-h-0 flex-1">
          <StateView state={state} />
        </TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <LogView workbench={workbench} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// --- Tools -----------------------------------------------------------------

interface RunState {
  status: "idle" | "running" | "ok" | "error";
  output?: unknown;
  error?: string;
}

function ToolRunner({ workbench }: { workbench: Workbench }) {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState("{}");
  const [run, setRun] = useState<RunState>({ status: "idle" });

  useEffect(() => {
    workbench.bridge.tools
      .list()
      .then((list) => {
        setTools(list);
        setSelected((cur) => cur ?? list[0]?.name ?? null);
      })
      .catch(() => undefined);
  }, [workbench]);

  const current = tools.find((t) => t.name === selected) ?? null;

  async function invoke() {
    if (!selected) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = args.trim() ? JSON.parse(args) : {};
    } catch (err) {
      setRun({ status: "error", error: `Invalid JSON arguments: ${String(err)}` });
      return;
    }
    setRun({ status: "running" });
    const result = await workbench.call(selected, parsed);
    if (result.ok) {
      setRun({ status: "ok", output: result.content });
    } else {
      setRun({
        status: "error",
        error: `${result.error?.code ?? "TOOL_FAILED"}: ${result.error?.message ?? "Tool failed"}`,
      });
    }
  }

  return (
    <div className="grid h-full grid-cols-[220px_1fr]">
      <ScrollArea className="border-r border-border">
        <ul className="flex flex-col gap-0.5 p-2">
          {tools.map((tool) => (
            <li key={tool.name}>
              <button
                type="button"
                onClick={() => {
                  setSelected(tool.name);
                  setRun({ status: "idle" });
                }}
                className={cn(
                  "w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-xs",
                  tool.name === selected
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {tool.name}
              </button>
            </li>
          ))}
          {tools.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">No tools registered.</li>
          )}
        </ul>
      </ScrollArea>

      <ScrollArea className="min-h-0">
        {current ? (
          <div className="flex flex-col gap-3 p-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm font-semibold">{current.name}</h3>
                {current.capabilities?.map((cap) => (
                  <Badge key={cap} variant="secondary" className="text-[10px]">
                    {cap}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{current.description}</p>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Arguments (JSON)
              </span>
              <textarea
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                spellCheck={false}
                rows={4}
                className="rounded-md border border-input bg-background p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <div>
              <Button size="sm" onClick={invoke} disabled={run.status === "running"}>
                {run.status === "running" ? "Running…" : "Run tool"}
              </Button>
            </div>

            {run.status !== "idle" && run.status !== "running" && (
              <pre
                className={cn(
                  "overflow-auto rounded-md border p-2 font-mono text-xs",
                  run.status === "error"
                    ? "border-destructive/40 text-destructive"
                    : "border-border text-foreground",
                )}
              >
                {run.status === "error" ? run.error : JSON.stringify(run.output, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <div className="p-4 text-xs text-muted-foreground">
            Select a tool to inspect and run it.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// --- State -----------------------------------------------------------------

function StateView({ state }: { state: AppState | null }) {
  if (!state) {
    return <div className="p-4 text-xs text-muted-foreground">Loading state…</div>;
  }
  return (
    <ScrollArea className="h-full">
      <pre className="p-3 font-mono text-xs leading-relaxed text-foreground">
        {JSON.stringify(state, null, 2)}
      </pre>
    </ScrollArea>
  );
}

// --- Logs ------------------------------------------------------------------

function LogView({ workbench }: { workbench: Workbench }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    workbench.bridge.logs
      .get(500)
      .then((list) => mounted && setEntries(list))
      .catch(() => undefined);
    const off = workbench.bridge.logs.onEntry((entry) => {
      setEntries((prev) => [...prev, entry].slice(-500));
    });
    return () => {
      mounted = false;
      off();
    };
  }, [workbench]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entries.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  const levelClass = useMemo(
    () => ({
      debug: "text-muted-foreground",
      info: "text-foreground",
      warn: "text-amber-400",
      error: "text-destructive",
    }),
    [],
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0.5 p-3 font-mono text-xs" role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No log entries yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground/70">{formatTime(entry.ts)}</span>
              <span className={cn("shrink-0 w-12 uppercase", levelClass[entry.level])}>
                {entry.level}
              </span>
              <span className="shrink-0 text-muted-foreground">{entry.source}</span>
              <span className="min-w-0 break-words text-foreground">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}
