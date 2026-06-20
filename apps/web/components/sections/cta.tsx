import Link from "next/link"
import { ArrowRight, GitFork } from "lucide-react"
import { MeithMark } from "@/components/meith-mark"
import { siteConfig } from "@/lib/site"

export function Cta() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="bg-grid bg-grid-fade pointer-events-none absolute inset-0"
      />
      <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-card">
          <MeithMark className="size-7 text-foreground" />
        </div>
        <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Put an AI assistant right next to your code.
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Free and open source. Install meith and let the app, CLI, plugins, and
          agents gather around one workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={siteConfig.releases}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Download for desktop
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={siteConfig.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            <GitFork className="size-4" />
            View on GitHub
          </Link>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Requires {siteConfig.platforms}
        </p>
      </div>
    </section>
  )
}
