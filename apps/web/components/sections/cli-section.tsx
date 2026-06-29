import { CodeBlock } from "@/components/code-block";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const cliExample = `# list the runtime's registered tools
meith tools

# open a local URL in a browser tab
meith open http://localhost:3000

# inspect managed dev servers
meith dev-servers

# call any registered tool directly
meith call app_health`;

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
              Use it from the terminal too.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              The <span className="font-mono text-foreground">meith</span> CLI talks to
              the running desktop app over a local socket and calls the same tools. Open
              preview tabs, inspect dev servers, stream logs, capture screenshots, or call
              a tool by name.
            </p>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Packaged desktop builds include their own Node/npm/npx runtime and CLI
              bundle, so the app can launch built-in ACP presets without relying on your
              global Node setup.
            </p>
            <Link
              href="/docs/cli"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Read the CLI guide
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <CodeBlock code={cliExample} label="meith terminal" />
        </div>
      </div>
    </section>
  );
}
