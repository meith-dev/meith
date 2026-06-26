import { Eye, KeyRound, ShieldCheck } from "lucide-react"

const guarantees = [
  {
    icon: Eye,
    title: "Read-only runs free",
    body: "Reading state, logs, metadata, file summaries, and git counts executes without interruption. Low-risk context gathering stays out of your way.",
  },
  {
    icon: KeyRound,
    title: "Privileged actions ask first",
    body: "File writes, browser control, process starts, and destructive actions pause for Allow or Deny. You can remember an agent tool decision for that session.",
  },
  {
    icon: ShieldCheck,
    title: "Identity stays anchored",
    body: "Plugin identity comes from the tab itself, and agent tool calls use the real session id. ACP approvals are accepted only for tools exposed by meith.",
  },
]

export function Safety() {
  return (
    <section className="border-b border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-wide text-primary">
            You stay in control
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Agents and plugins stay behind the same gate.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Every major action routes through the shared tool registry, where
            tools declare their capabilities upfront. The renderer is trusted as
            part of the core app — agents and plugins face strict limits, and
            every call is validated and audited.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {guarantees.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                <item.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
