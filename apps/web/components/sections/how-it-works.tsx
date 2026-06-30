import { MeithMark } from "@/components/meith-mark";
import { Bot, Layout, Plug, TerminalSquare } from "lucide-react";

const callers = [
  { icon: Layout, label: "Renderer", note: "the visual app" },
  { icon: TerminalSquare, label: "CLI", note: "meith command" },
  { icon: Bot, label: "Agent", note: "AI sessions" },
  { icon: Plug, label: "Plugins", note: "web apps" },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-primary">
              Shared project context
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              One workspace for the whole loop.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              meith sits around your project. The desktop app, CLI, plugins, and agents
              use the same tools for files, tabs, dev servers, the built-in browser, git
              changes, and permissions.
            </p>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              A standalone agent has to ask what happened in the browser. In meith, it can
              open the app, click through the UI, inspect what changed, and read the logs
              itself.
            </p>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Use the agent you want. meith connects to external agents through{" "}
              <span className="font-mono text-foreground">ACP</span>, while provider tool
              requests still route through meith&apos;s registry.
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
                validate, gate, run, audit
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                "app state",
                "files and Git",
                "browser control",
                "permissions & audit",
              ].map((label) => (
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
  );
}
