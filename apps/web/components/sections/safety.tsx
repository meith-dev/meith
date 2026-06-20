import { Eye, KeyRound, ShieldCheck } from "lucide-react"

const guarantees = [
  {
    icon: Eye,
    title: "Read-only runs free",
    body: "Reading state, logs, metadata, and files executes without interruption. The work that can't hurt you never nags you.",
  },
  {
    icon: KeyRound,
    title: "Privileged actions ask first",
    body: "File writes, browser control, process starts, and destructive actions require explicit permission or an approved grant.",
  },
  {
    icon: ShieldCheck,
    title: "Identity can't be forged",
    body: "The host resolves plugin identity from the tab itself, ignoring whatever the plugin claims. Capabilities are checked on every call.",
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
            Agents and plugins don&apos;t get the keys by default.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Every major action routes through the shared tool registry, where
            tools declare their capabilities upfront. The renderer is trusted as
            part of the core app — agents and plugins face strict limits, and
            every call is audited.
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
