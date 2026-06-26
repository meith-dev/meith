import {
  GitCompare,
  Globe,
  LayoutGrid,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react"

const features = [
  {
    icon: Wrench,
    title: "Agent sessions that persist",
    body: "meith keeps agent chats scoped to the workspace, with compact transcripts, generated session titles, model controls, and remembered approvals for trusted tools.",
  },
  {
    icon: TerminalSquare,
    title: "Dev servers, built in",
    body: "Start your dev server from the top bar, watch logs inside the workbench, and open detected localhost ports without leaving the desktop app.",
  },
  {
    icon: Globe,
    title: "Live preview & browsing",
    body: "Preview the running app beside the chat. Agents can claim browser tabs before automation, so browser control stays attributed and conflicts are blocked.",
  },
  {
    icon: GitCompare,
    title: "Fast reviewable diffs",
    body: "The top bar shows cached working-tree totals, and the Diff tab groups changed files by folder while loading full patches only when you select a file.",
  },
  {
    icon: LayoutGrid,
    title: "A space per project",
    body: "Each space is one app. Switch from the rail and keep agent sessions, source files, terminals, browser tabs, and run commands scoped to that project.",
  },
  {
    icon: ShieldCheck,
    title: "Permission where it matters",
    body: "Writes, browser control, process starts, and destructive actions ask first. ACP provider-side approvals are narrowed to meith tools.",
  },
]

export function Features() {
  return (
    <section id="features" className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            A workbench, not a chat box
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Everything you need to build a web app with AI: project files,
            persistent agent sessions, dev-server logs, localhost preview, and
            fast reviewable diffs in one desktop app.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
