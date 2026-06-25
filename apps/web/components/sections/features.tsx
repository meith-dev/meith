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
    icon: Wrench,
    title: "Agents that write your code",
    body: "Meith agents don't just suggest snippets. They scaffold components, edit files across your project, and wire up features — calling real tools through a typed protocol, with every change shown inline.",
  },
  {
    icon: TerminalSquare,
    title: "Dev servers, built in",
    body: "Start your dev server, watch its output, and preview localhost right beside the conversation. The status bar tracks what's running and on which port — no second terminal required.",
  },
  {
    icon: Globe,
    title: "Live preview & browsing",
    body: "See your app render as the agent builds it. Meith can open localhost, click through your pages, and check its own work against what's actually on screen.",
  },
  {
    icon: FolderTree,
    title: "Reviewable code changes",
    body: "Point meith at your repo and it works inside it. Edits land as inline diffs you can review, undo, and ship — nothing touches your codebase without you seeing it.",
  },
  {
    icon: LayoutGrid,
    title: "A space per project",
    body: "Each space is one app. Switch between them from the rail like profiles, and keep agent chats, source files, and preview tabs scoped to the project in front of you.",
  },
  {
    icon: ShieldCheck,
    title: "Permission on every action",
    body: "Tools that touch your machine ask first. Allow once, always allow, or deny — you stay in control of files, commands, and network access at all times.",
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
            Everything you need to build a web app with AI — your code, a dev
            server, a live preview, and reviewable diffs — gathered into one
            desktop app.
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
