import { Eye, Globe, KeyRound, ShieldCheck } from "lucide-react";

const guarantees = [
  {
    icon: Eye,
    title: "Read-only context",
    body: "State, logs, file summaries, and git counts run without prompts.",
  },
  {
    icon: KeyRound,
    title: "Actions that change things",
    body: "Writes, process starts, browser control, and destructive actions require Allow or Deny.",
  },
  {
    icon: Globe,
    title: "Browser tabs stay contained",
    body: "Browser tabs cannot request camera, microphone, geolocation, or other OS permissions. Popups and new-window navigations are blocked.",
  },
  {
    icon: ShieldCheck,
    title: "Caller identity is fixed",
    body: "Plugins and agents cannot choose a privileged identity. meith resolves it from the tab or session.",
  },
];

export function Safety() {
  return (
    <section id="safety" className="border-b border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-wide text-primary">
            You stay in control
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Agents ask before they touch your machine.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Read-only context runs quietly. File writes, browser control, process starts,
            and destructive actions pause for approval and leave an audit trail.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {guarantees.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                <item.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold tracking-tight">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
