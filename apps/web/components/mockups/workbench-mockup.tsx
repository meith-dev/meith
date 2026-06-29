import { MeithMark } from "@/components/meith-mark";
import { cn } from "@/lib/utils";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode,
  FileDiff,
  FilePlus,
  Folder,
  FolderOpen,
  GitCompare,
  Hand,
  Paperclip,
  PlayIcon,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Terminal,
  TerminalSquare,
  Wrench,
} from "lucide-react";

const spaces = [
  { initial: "M", color: "var(--primary)", active: true },
  { initial: "A", color: "oklch(0.62 0.13 250)", active: false },
  { initial: "D", color: "oklch(0.6 0.13 150)", active: false },
];

const workspaceToggles = [
  { icon: FileCode, label: "Editor", open: false },
  { icon: Terminal, label: "Terminal", open: false },
  { icon: Bot, label: "Agent", open: true },
];

const agentSessions = [
  { title: "Pricing Section", active: true, status: "running", updated: "just now" },
  { title: "Hero Polish", active: false, status: "idle", updated: "12 min ago", unread: true },
  { title: "Nav Cleanup", active: false, status: "idle", updated: "31 min ago" },
];

function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

export function WorkbenchMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40 select-none",
        className,
      )}
    >
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

      <div className="flex h-10 items-stretch border-b border-border">
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border bg-card">
          <MeithMark className="size-5 text-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 bg-card/40 px-2">
          {workspaceToggles.map((toggle) => (
            <div
              key={toggle.label}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                toggle.open ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <toggle.icon className="size-4 shrink-0" />
              <span>{toggle.label}</span>
            </div>
          ))}

          <div className="min-w-0 flex-1" />
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
            <GitCompare className="size-3.5 text-muted-foreground" />
            <span className="font-mono tabular-nums text-[oklch(0.7_0.13_150)]">
              +107
            </span>
            <span className="font-mono tabular-nums text-[oklch(0.62_0.2_25)]">-12</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            :3000
          </div>
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

      <div className="flex h-[560px]">
        <nav className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-card py-3">
          <div className="flex flex-1 flex-col items-center gap-2">
            {spaces.map((space) => (
              <div
                key={space.initial}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-sm font-semibold text-white",
                  space.active && "ring-2 ring-offset-2 ring-offset-card",
                )}
                style={{
                  backgroundColor: space.color,
                  boxShadow: space.active ? `0 0 0 2px ${space.color}` : undefined,
                }}
              >
                {space.initial}
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

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-9 items-center border-b border-border bg-card/40 px-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-xs text-foreground">
                    <Bot className="size-3.5" />
                    <span className="max-w-24 truncate">Agent</span>
                  </div>
                </div>
                <Plus className="size-3.5 text-muted-foreground" />
              </div>

              <div className="flex min-h-0 flex-1">
                <aside className="hidden w-36 shrink-0 border-r border-border bg-card/25 md:flex md:flex-col">
                  <div className="h-11 border-b border-border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sessions
                      </span>
                      <Plus className="size-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">8 conversations</span>
                  </div>
                  <div className="space-y-1 px-2 py-2">
                    {agentSessions.map((session) => (
                      <div
                        key={session.title}
                        className={cn(
                          "rounded-md px-2 py-1.5",
                          session.active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/85",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2 text-xs">
                          <span className="relative flex size-4 shrink-0 items-center justify-center">
                            <Bot className="size-3.5 text-muted-foreground" />
                            {(session.status === "running" || session.unread) && (
                              <span
                                className={cn(
                                  "absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
                                  session.status === "running"
                                    ? "bg-primary"
                                    : "bg-[oklch(0.62_0.13_250)]",
                                )}
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{session.title}</span>
                        </div>
                        <div className="pl-6 pt-0.5 text-[10px] text-muted-foreground">
                          {session.updated}
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="flex h-11 items-center justify-between border-b border-border px-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Pricing Section</p>
                      <p className="text-[11px] text-muted-foreground">7 messages</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-primary/50 px-2 py-0.5 text-[11px] text-primary">
                        Running
                      </span>
                      <span className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground">
                        + New session
                      </span>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 overflow-hidden p-3.5 text-[13px] leading-relaxed">
                    <div className="flex h-full min-h-0 w-full flex-col justify-end overflow-hidden">
                      <div className="space-y-2.5">
                        <div className="flex justify-end">
                          <div className="max-w-[82%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">
                            Add a pricing section and start the dev server.
                          </div>
                        </div>

                      <div className="flex justify-start">
                        <div className="max-w-[90%] space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Agent</span>
                            <span>streaming</span>
                          </div>
                          <div className="rounded-lg bg-muted p-2">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 py-1.5 text-sm">
                                <span className="font-medium text-foreground">Thoughts</span>
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                  · Checking the existing layout and section spacing
                                </span>
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                              </div>
                              <div className="rounded-md border border-border/80 bg-background px-2.5 py-1.5">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-foreground">Thoughts</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    2 updates
                                  </span>
                                  <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                                </div>
                                <div className="mt-1.5 rounded-md border border-border bg-background/80 p-1.5">
                                  <div className="flex items-center gap-2 text-xs">
                                    <Wrench className="size-3.5 text-muted-foreground" />
                                    <span className="font-medium text-foreground">
                                      Ran 3 commands
                                    </span>
                                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="max-w-[92%] rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                          <ShieldAlert className="size-3.5 text-amber-400" />
                          <span>Permission required</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          The agent wants to run{" "}
                          <code className="font-mono text-foreground">project_run</code> to
                          start a process.
                        </p>
                        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="size-3 rounded-[3px] border border-input bg-background" />
                          Remember for this tool in this session
                        </label>
                        <div className="mt-1.5 flex gap-2">
                          <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                            Allow
                          </span>
                          <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground">
                            Deny
                          </span>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>

                  <div className="border-t border-border p-3">
                    <div className="rounded-md border border-input bg-transparent">
                      <div className="truncate px-3 pt-2.5 pb-2 text-[13px] text-muted-foreground">
                        Message the agent...
                      </div>
                      <div className="flex items-center justify-between border-t border-border/70 px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
                            <Paperclip className="size-4" />
                          </span>
                          <span className="flex size-7 items-center justify-center gap-0.5 rounded-md text-foreground">
                            <ClaudeMark className="size-4" />
                            <ChevronDown className="size-3 text-muted-foreground" />
                          </span>
                          <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
                            <Hand className="size-4" />
                          </span>
                        </div>
                        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                          <Send className="size-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="hidden w-[43%] shrink-0 flex-col border-l border-border bg-background lg:flex">
              <div className="flex h-9 items-center border-b border-border bg-card/40 px-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-xs text-foreground">
                    <FileDiff className="size-3.5" />
                    <span className="truncate">Diff</span>
                  </div>
                </div>
                <Plus className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex h-8 items-center gap-3 border-b border-border bg-card/40 px-3 text-[11px]">
                <span className="text-muted-foreground">2 changed files</span>
                <span className="font-mono tabular-nums text-[oklch(0.7_0.13_150)]">
                  +107
                </span>
                <span className="font-mono tabular-nums text-[oklch(0.62_0.2_25)]">-12</span>
                <RefreshCw className="ml-auto size-3.5 text-muted-foreground" />
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="w-40 shrink-0 bg-card/30 py-1 text-xs">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
                    <ChevronRight className="size-3 rotate-90" />
                    <FolderOpen className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate font-mono">apps</span>
                    <span className="font-mono text-[10px]">2</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 pl-6 text-muted-foreground">
                    <ChevronRight className="size-3 rotate-90" />
                    <Folder className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate font-mono">web</span>
                  </div>
                  <div className="flex items-center gap-2 bg-accent px-2 py-1.5 pl-10 text-foreground">
                    <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono">page.tsx</span>
                    <span className="font-mono text-[10px]">
                      <span className="text-[oklch(0.7_0.13_150)]">+23</span>{" "}
                      <span className="text-[oklch(0.62_0.2_25)]">-12</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 pl-10 text-foreground">
                    <FilePlus className="size-3.5 shrink-0 text-[oklch(0.7_0.13_150)]" />
                    <span className="min-w-0 flex-1 truncate font-mono">pricing.tsx</span>
                    <span className="font-mono text-[10px] text-[oklch(0.7_0.13_150)]">
                      +84
                    </span>
                  </div>
                </div>
                <div className="w-1 shrink-0 border-r border-border" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex h-8 items-center gap-2 border-b border-border bg-card/40 px-3 text-[11px]">
                    <FileDiff className="size-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      apps/web/app/page.tsx
                    </span>
                    <span className="font-mono">
                      <span className="text-[oklch(0.7_0.13_150)]">+23</span>{" "}
                      <span className="text-[oklch(0.62_0.2_25)]">-12</span>
                    </span>
                  </div>
                  <div className="font-mono text-[10px] leading-5">
                    <div className="bg-muted/60 px-2 text-muted-foreground">
                      @@ -12,3 +12,4 @@
                    </div>
                    <div className="grid grid-cols-[2.25rem_2.25rem_1fr] border-b border-border/40">
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">12</span>
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">12</span>
                      <span className="truncate px-2 text-foreground">{"<Hero />"}</span>
                    </div>
                    <div className="grid grid-cols-[2.25rem_2.25rem_1fr] bg-[oklch(0.62_0.2_25_/_0.1)]">
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">13</span>
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60" />
                      <span className="truncate px-2 text-[oklch(0.72_0.18_25)]">{"-<Features />"}</span>
                    </div>
                    <div className="grid grid-cols-[2.25rem_2.25rem_1fr] bg-[oklch(0.7_0.13_150_/_0.1)]">
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60" />
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">13</span>
                      <span className="truncate px-2 text-[oklch(0.75_0.16_150)]">
                        {"+<Pricing />"}
                      </span>
                    </div>
                    <div className="grid grid-cols-[2.25rem_2.25rem_1fr] bg-[oklch(0.7_0.13_150_/_0.1)]">
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60" />
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">14</span>
                      <span className="truncate px-2 text-[oklch(0.75_0.16_150)]">
                        {"+<Features />"}
                      </span>
                    </div>
                    <div className="grid grid-cols-[2.25rem_2.25rem_1fr]">
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">14</span>
                      <span className="border-r border-border px-2 text-right text-muted-foreground/60">15</span>
                      <span className="truncate px-2 text-foreground">{"<HowItWorks />"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

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
            <span>2 workspace tabs</span>
            <span>1 browser tab</span>
            <span className="font-mono">meith workbench</span>
          </div>
        </div>
      </div>
    </div>
  );
}
