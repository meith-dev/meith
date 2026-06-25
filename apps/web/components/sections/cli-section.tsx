import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CodeBlock } from "@/components/code-block"

const cliExample = `# list the runtime's registered tools
meith tools

# open a local URL in a browser tab
meith open http://localhost:3000

# inspect running app instances
meith app list

# call any registered tool directly
meith call app_health`

export function CliSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-primary">
              Same tools, from your shell
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Drive your project from the command line.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              The <span className="font-mono text-foreground">meith</span> CLI
              discovers a running runtime over a local socket and calls the exact
              same tools the app uses. Open preview tabs, inspect dev-server
              processes, stream build logs, or invoke any tool by name — straight
              from your existing terminal workflow.
            </p>
            <Link
              href="/docs/cli"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Read the CLI guide
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <CodeBlock code={cliExample} label="meith — terminal" />
        </div>
      </div>
    </section>
  )
}
