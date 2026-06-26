import { Bot, Layout, Plug, TerminalSquare } from "lucide-react"
import { MeithMark } from "@/components/meith-mark"

const callers = [
  { icon: Layout, label: "Renderer", note: "the visual app" },
  { icon: TerminalSquare, label: "CLI", note: "meith command" },
  { icon: Bot, label: "Agent", note: "AI sessions" },
  { icon: Plug, label: "Plugins", note: "web apps" },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-primary">
              A meitheal for your code
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              One project state, one permission path.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              The visual interface, the terminal command, a plugin, and the AI
              agent all act on the same workspace state: files, tabs, spaces,
              dev servers, git changes, and browser ownership. Editing a file
              from the UI, running{" "}
              <span className="font-mono text-foreground">meith open</span> to
              preview a route, or letting the agent start your dev server all go
              through the same tool definition, validation, permission, and
              audit path.
            </p>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              meith doesn&apos;t lock you into one AI provider. The agent runtime
              uses an adapter interface, stores compact per-session transcripts,
              and connects to external agents via{" "}
              <span className="font-mono text-foreground">ACP</span> (Agent
              Client Protocol). ACP tools come through meith&apos;s MCP bridge, so
              provider-native helpers cannot sidestep the registry.
            </p>
          </div>

          {/* The hub-and-spoke: callers cooperating around the registry. */}
          <div className="relative rounded-xl border border-border bg-card p-6 sm:p-10">
            <div className="grid grid-cols-2 gap-4">
              {callers.map((caller) => (
                <div
                  key={caller.label}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background p-4 text-center"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-accent text-foreground">
                    <caller.icon className="size-4" />
                  </div>
                  <p className="mt-1 text-sm font-semibold">{caller.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {caller.note}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-5 text-center">
              <MeithMark className="size-7 text-foreground" />
              <p className="text-sm font-semibold">Shared ToolRegistry</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                validate · gate · run · audit
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {["app state", "files & diffs", "browser & processes"].map((label) => (
                <div
                  key={label}
                  className="rounded-md border border-border bg-background px-2 py-2 font-mono text-[11px] text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
