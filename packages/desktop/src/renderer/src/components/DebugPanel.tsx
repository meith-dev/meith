import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DevServers } from "@/hooks/useDevServers";
import type { Workbench } from "@/hooks/useWorkbench";
import { cn } from "@/lib/utils";
import type { ToolDescriptor } from "@meith/protocol";
import type { AppState, DevServer, LogEntry } from "@meith/shared";
import { useEffect, useMemo, useRef, useState } from "react";

export type DebugTab = "output" | "tools" | "state" | "logs";

interface DebugPanelProps {
  workbench: Workbench;
  state: AppState | null;
  onClose: () => void;
  /** Live dev-server state for the Output tab. */
  devServers: DevServers;
  /** cwd of the active project, to default the Output filter. */
  activeProjectCwd?: string;
  /** Controlled active tab. */
  tab: DebugTab;
  onTabChange: (tab: DebugTab) => void;
}

/**
 * Bottom diagnostics drawer. Consolidates run output, the tool runner, raw
 * state, and logs into a single tabbed panel that sits under the workbench and
 * can be toggled with Cmd/Ctrl+J.
 */
export function DebugPanel({
  workbench,
  state,
  onClose,
  devServers,
  activeProjectCwd,
  tab,
  onTabChange,
}: DebugPanelProps) {
  const runningCount = devServers.runningServers.length;

  return (
    <section
      aria-label="Diagnostics"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-card"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as DebugTab)}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-10 min-w-0 shrink-0 items-stretch justify-between border-b border-border">
          <TabsList className="h-full min-w-0 gap-0 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-full">
            <DiagTab value="output">
              Output
              {runningCount > 0 && (
                <span className="flex size-1.5 rounded-full bg-primary" aria-hidden />
              )}
            </DiagTab>
            <DiagTab value="tools">Tools</DiagTab>
            <DiagTab value="state">State</DiagTab>
            <DiagTab value="logs">Logs</DiagTab>
          </TabsList>
          <div className="flex shrink-0 items-center px-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="shrink-0 text-muted-foreground"
            >
              Close
            </Button>
          </div>
        </div>

        <TabsContent value="output" className="min-h-0 flex-1">
          <OutputView devServers={devServers} activeProjectCwd={activeProjectCwd} />
        </TabsContent>
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

/**
 * Diagnostics tab trigger styled to match the workbench TabStrip: a flat,
 * full-height cell with a right divider, a `bg-background` fill when active, and
 * a top accent strip — instead of the default rounded pill.
 */
function DiagTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "relative h-full flex-none gap-1.5 rounded-none border-0 border-r border-border px-4 text-sm font-normal text-muted-foreground transition-colors",
        "hover:bg-accent/40 hover:text-foreground",
        "data-active:bg-background data-active:text-foreground data-active:shadow-none",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-transparent data-active:before:bg-primary",
      )}
    >
      {children}
    </TabsTrigger>
  );
}

// --- Output (run logs) -----------------------------------------------------

function OutputView({
  devServers,
  activeProjectCwd,
}: {
  devServers: DevServers;
  activeProjectCwd?: string;
}) {
  const { servers, logsForServer } = devServers;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Default the selection to a server in the active project, else the first.
  const resolvedId = useMemo(() => {
    if (selectedId && servers.some((s) => s.id === selectedId)) return selectedId;
    const inProject = servers.find((s) => s.cwd === activeProjectCwd);
    return inProject?.id ?? servers[0]?.id ?? null;
  }, [selectedId, servers, activeProjectCwd]);

  const current = servers.find((s) => s.id === resolvedId) ?? null;
  const entries = resolvedId ? logsForServer(resolvedId) : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, resolvedId]);

  if (servers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Nothing running. Use the Run button in the workspace panel to start a command.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[200px_minmax(0,1fr)] grid-rows-1">
      <ScrollArea className="h-full min-h-0 border-r border-border">
        <ul className="flex flex-col gap-0.5 p-2">
          {servers.map((s) => {
            const live = s.status === "running" || s.status === "starting";
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    s.id === resolvedId
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      live ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">{s.name}</span>
                  {s.port != null && (
                    <span className="shrink-0 font-mono text-[10px] text-primary">
                      :{s.port}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="flex min-h-0 min-w-0 flex-col">
        {current && (
          <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
            <StatusBadge server={current} />
            <span className="min-w-0 truncate font-mono text-muted-foreground">
              {current.command}
              {current.args.length > 0 ? ` ${current.args.join(" ")}` : ""}
            </span>
          </div>
        )}
        <ScrollArea className="h-full min-h-0">
          <div className="flex flex-col gap-0.5 p-3 font-mono text-xs" role="log">
            {entries.length === 0 ? (
              <p className="text-muted-foreground">Waiting for output…</p>
            ) : (
              entries.map((e) => (
                <div key={e.seq} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/60">
                    {formatTime(e.ts)}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 whitespace-pre-wrap break-words",
                      e.stream === "stderr" ? "text-destructive" : "text-foreground",
                      e.stream === "system" && "text-muted-foreground italic",
                    )}
                  >
                    {e.text}
                  </span>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function StatusBadge({ server }: { server: DevServer }) {
  const map: Record<
    DevServer["status"],
    { label: string; variant: "default" | "secondary" | "destructive" }
  > = {
    starting: { label: "starting", variant: "secondary" },
    running: { label: "running", variant: "default" },
    exited: { label: "exited", variant: "secondary" },
    errored: { label: "errored", variant: "destructive" },
    stopped: { label: "stopped", variant: "secondary" },
  };
  const { label, variant } = map[server.status] ?? map.stopped;
  return (
    <Badge variant={variant} className="shrink-0 text-[10px]">
      {label}
    </Badge>
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
    <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] grid-rows-1">
      <ScrollArea className="h-full min-h-0 border-r border-border">
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
            <li className="px-2 py-3 text-xs text-muted-foreground">
              No tools registered.
            </li>
          )}
        </ul>
      </ScrollArea>

      <ScrollArea className="h-full min-h-0">
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
      <div
        className="flex flex-col gap-0.5 p-3 font-mono text-xs"
        role="log"
        aria-live="polite"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No log entries yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground/70">
                {formatTime(entry.ts)}
              </span>
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
