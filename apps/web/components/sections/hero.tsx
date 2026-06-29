import { ArrowRight, GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkbenchMockup } from "@/components/mockups/workbench-mockup"
import { siteConfig } from "@/lib/site"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Blueprint grid backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="font-medium text-foreground">Open source</span>
          </span>

          <h1 className="mt-7 text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Build web apps with AI from{" "}
            <span className="text-primary">one shared workbench.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {siteConfig.description}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href={siteConfig.releases} target="_blank" rel="noreferrer">
                Download for desktop
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href={siteConfig.repo} target="_blank" rel="noreferrer">
                <GitFork className="size-4" />
                View on GitHub
              </a>
            </Button>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            {siteConfig.license} licensed · {siteConfig.platforms}
          </p>
        </div>

        {/* Workbench mockup */}
        <div className="relative mx-auto mt-16 max-w-6xl">
          <WorkbenchMockup />
        </div>
      </div>
    </section>
  )
}
