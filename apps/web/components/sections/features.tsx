import {
  GitCompare,
  Globe,
  LayoutGrid,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react";

const features = [
  {
    icon: Wrench,
    title: "Project-aware agents",
    body: "Keep agent chats tied to a project, with model controls, compact history, and approvals remembered for the session.",
  },
  {
    icon: TerminalSquare,
    title: "Editor, terminal, browser",
    body: "Open files, run commands, start dev servers, and keep the running app in the same window.",
  },
  {
    icon: Globe,
    title: "A browser agents can use",
    body: "Let an agent open pages, click, type, inspect the UI, read console output, and take screenshots.",
  },
  {
    icon: GitCompare,
    title: "Built-in Git panel",
    body: "Switch or create branches from the header, review staged and unstaged files, commit with saved identities, and keep agent checkpoints.",
  },
  {
    icon: LayoutGrid,
    title: "Spaces for projects",
    body: "Each project gets its own tabs, terminals, agents, browser state, and run commands.",
  },
  {
    icon: ShieldCheck,
    title: "Permission gates",
    body: "Writes, browser control, process starts, and destructive actions ask first. Browser tabs cannot acquire OS permissions or open popups without your approval.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            More than a coding agent
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            AI agents can write code. meith gives them the rest of the loop: files,
            terminal, a browser they can control, logs, Git changes, and permissions in
            one desktop app.
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
  );
}
