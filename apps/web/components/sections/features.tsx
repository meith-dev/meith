import {
  FolderTree,
  Globe,
  LayoutGrid,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react"

const features = [
  {
    icon: Globe,
    title: "Agents that actually act",
    body: "Meith agents don't just reply. They browse the web, read and edit your files, and run commands — calling real tools through a typed protocol, with every step shown inline.",
  },
  {
    icon: LayoutGrid,
    title: "Spaces for every project",
    body: "Each space is one project. Switch between them from the rail like profiles, and keep agent chats, files, and browser tabs scoped to the work in front of you.",
  },
  {
    icon: Wrench,
    title: "One shared tool registry",
    body: "The renderer, the CLI, and the agent runtime all cooperate around a single registry of tools — so a capability added once is available everywhere.",
  },
  {
    icon: ShieldCheck,
    title: "Permission on every action",
    body: "Tools that touch your machine ask first. Allow once, always allow, or deny — you stay in control of files, commands, and network access at all times.",
  },
  {
    icon: FolderTree,
    title: "Your files, in context",
    body: "Point meith at a folder and it works inside it. Edits land as inline diffs you can review and undo, so nothing changes without you seeing it.",
  },
  {
    icon: TerminalSquare,
    title: "Built-in dev runtime",
    body: "Start dev servers, watch output, and preview localhost right beside the conversation. The status bar tracks what's running and on which port.",
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
            Everything an AI agent needs to do real work — files, tools, a
            browser, and a runtime — gathered into one desktop app.
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
