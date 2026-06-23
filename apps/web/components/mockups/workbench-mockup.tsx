import { MeithMark } from "@/components/meith-mark";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode,
  FolderOpen,
  GitCompare,
  Globe,
  PlayIcon,
  Plus,
  Settings,
  Terminal,
  TerminalSquare,
  Wrench,
} from "lucide-react";

const spaces = [
  { initial: "M", color: "var(--primary)", active: true },
  { initial: "A", color: "oklch(0.62 0.13 250)", active: false },
  { initial: "D", color: "oklch(0.6 0.13 150)", active: false },
];

// Editor / Terminal / Agent are single-instance workspace toggles that live in
// the top bar; the Agent tab is currently open here.
const workspaceToggles = [
  { icon: FileCode, label: "Editor", open: false },
  { icon: Terminal, label: "Terminal", open: false },
  { icon: Bot, label: "Agent", open: true },
];

// The tab strip carries the open Agent workspace tab plus browser tabs; the
// "+" opens a new browser tab only.
const tabs = [
  { icon: Bot, label: "Agent", active: true },
  { icon: Globe, label: "localhost:3000", active: false },
];

/**
 * Faithful static recreation of the meith desktop workbench, built from the
 * real renderer surfaces: the top bar (brand cell, workspace toggles, git-diff
 * chip, split Run control), the far-left Spaces rail, a per-pane tab strip, the
 * agent transcript (with a tool-call card and a permission prompt), a side
 * preview pane, and the runtime status bar. Decorative only — `aria-hidden`.
 */
export function WorkbenchMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40 select-none",
        className,
      )}
    >
      {/* Window chrome */}
      <div className="flex h-8 items-center gap-2 border-b border-border bg-card px-3">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[oklch(0.62_0.2_25)]" />
          <span className="size-3 rounded-full bg-[oklch(0.82_0.13_85)]" />
          <span className="size-3 rounded-full bg-[oklch(0.7_0.13_150)]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">meith</span>
          <ChevronRight className="size-3" />
          <span>Marketing site</span>
        </div>
      </div>

      {/* Top bar: brand cell (aligned to the rail width) + workspace toggles +
          git-diff chip + run controls. */}
      <div className="flex h-10 items-stretch border-b border-border">
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border bg-card">
          <MeithMark className="size-5 text-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 bg-card/40 px-2">
          {workspaceToggles.map((t) => (
            <div
              key={t.label}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                t.open ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <t.icon className="size-4 shrink-0" />
              <span>{t.label}</span>
            </div>
          ))}

          <div className="min-w-0 flex-1" />

          {/* Git-diff chip */}
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
            <GitCompare className="size-3.5 text-muted-foreground" />
            <span className="font-mono tabular-nums text-[oklch(0.7_0.13_150)]">
              +128
            </span>
            <span className="font-mono tabular-nums text-[oklch(0.62_0.2_25)]">-34</span>
          </div>

          {/* Live port chip */}
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            :3000
          </div>

          {/* Split Run control */}
          <div className="flex items-stretch">
            <span className="flex h-7 items-center gap-1.5 rounded-md rounded-r-none bg-primary px-2.5 text-xs font-medium text-primary-foreground">
              <PlayIcon className="size-3.5 fill-current" />
              Run Dev
            </span>
            <span className="flex h-7 w-6 items-center justify-center rounded-md rounded-l-none border-l border-primary-foreground/20 bg-primary text-primary-foreground">
              <ChevronDown className="size-3.5" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex h-[420px]">
        {/* Spaces rail */}
        <nav className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-card py-3">
          <div className="flex flex-1 flex-col items-center gap-2">
            {spaces.map((s) => (
              <div
                key={s.initial}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-sm font-semibold text-white",
                  s.active && "ring-2 ring-offset-2 ring-offset-card",
                )}
                style={{
                  backgroundColor: s.color,
                  // @ts-expect-error css var
                  "--tw-ring-color": s.color,
                }}
              >
                {s.initial}
              </div>
            ))}
            <div className="my-1 h-px w-7 bg-border" />
            <div className="flex size-9 items-center justify-center rounded-md text-muted-foreground">
              <Plus className="size-4.5" />
            </div>
            <div className="flex size-9 items-center justify-center rounded-md text-muted-foreground">
              <FolderOpen className="size-4.5" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-px w-7 bg-border" />
            <div className="flex size-9 items-center justify-center rounded-md text-muted-foreground">
              <TerminalSquare className="size-4.5" />
            </div>
            <div className="flex size-9 items-center justify-center rounded-md text-muted-foreground">
              <Settings className="size-4.5" />
            </div>
          </div>
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tab strip */}
          <div className="flex h-9 items-center border-b border-border bg-card/40 px-2">
            <div className="flex flex-1 items-center gap-1">
              {tabs.map((t) => (
                <div
                  key={t.label}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs",
                    t.active ? "bg-background text-foreground" : "text-muted-foreground",
                  )}
                >
                  <t.icon className="size-3.5" />
                  <span className="max-w-28 truncate">{t.label}</span>
                </div>
              ))}
            </div>
            <div className="flex size-7 items-center justify-center rounded-md border-l border-border pl-2 text-muted-foreground">
              <Plus className="size-3.5" />
            </div>
          </div>

          {/* Body: transcript + preview */}
          <div className="flex min-h-0 flex-1">
            {/* Agent transcript */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-hidden p-3.5 text-[13px] leading-relaxed">
                {/* user message */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg rounded-br-sm bg-secondary px-3 py-2 text-secondary-foreground">
                    Summarize the Q3 report and start the dev server.
                  </div>
                </div>

                {/* assistant message */}
                <div className="max-w-[88%] text-foreground/90">
                  On it. I&apos;ll read the report first, then bring up the preview.
                </div>

                {/* tool call card */}
                <div className="rounded-lg border border-border bg-card/70 p-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Wrench className="size-3.5 text-primary" />
                    <span className="font-medium text-foreground">read_file</span>
                    <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      docs/q3-report.md
                    </code>
                    <span className="ml-auto flex items-center gap-1 text-primary">
                      <Check className="size-3.5" />
                      done
                    </span>
                  </div>
                </div>

                {/* permission prompt */}
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Circle className="size-2 fill-primary text-primary" />
                    Permission required
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Run{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                      pnpm dev
                    </code>{" "}
                    in this workspace?
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <span className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
                      Allow once
                    </span>
                    <span className="rounded-md border border-border px-2.5 py-1 text-[11px] text-foreground">
                      Always allow
                    </span>
                    <span className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground">
                      Deny
                    </span>
                  </div>
                </div>
              </div>

              {/* composer */}
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <span className="flex-1 truncate text-[13px] text-muted-foreground">
                    Ask meith to do something…
                  </span>
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <ArrowUp className="size-3.5" />
                  </span>
                </div>
              </div>
            </div>

            {/* Preview pane */}
            <div className="hidden w-2/5 shrink-0 flex-col border-l border-border bg-card/30 lg:flex">
              <div className="flex h-8 items-center gap-2 border-b border-border px-3 text-[11px] text-muted-foreground">
                <Globe className="size-3.5" />
                <span className="truncate font-mono">localhost:3000</span>
                <span className="ml-auto flex items-center gap-1 text-primary">
                  <PlayIcon className="size-2.5 fill-current" />
                  live
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                <div className="h-2.5 w-1/2 rounded bg-primary/70" />
                <div className="h-2 w-3/4 rounded bg-muted" />
                <div className="h-2 w-2/3 rounded bg-muted" />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="h-14 rounded-md border border-border bg-background" />
                  <div className="h-14 rounded-md border border-border bg-background" />
                </div>
                <div className="h-2 w-1/2 rounded bg-muted" />
                <div className="h-2 w-3/5 rounded bg-muted" />
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Circle className="size-2 fill-primary text-primary" />
              Runtime connected
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <PlayIcon className="size-2.5 fill-primary text-primary" />1 running
              <span className="font-mono text-primary">:3000</span>
            </span>
            <span className="ml-auto">3 spaces</span>
            <span>1 workspace tab</span>
            <span>1 browser tab</span>
            <span className="font-mono">meith workbench</span>
          </div>
        </div>
      </div>
    </div>
  );
}
