import type { Metadata } from "next"
import { Code, Callout, DocHeader, H2, OL, P, UL } from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"
import { siteConfig } from "@/lib/site"

export const metadata: Metadata = {
  title: "Getting started",
  description: "Install meith, open a project, and run your first agent session.",
}

export default function GettingStartedPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Getting started"
        description="Install meith, open your first project, and put an agent to work."
      />

      <H2 id="install">Install the app</H2>
      <P>
        meith is a free, open-source desktop app for macOS, Linux, and Windows.
        Download the latest build from the releases page, then launch it like any
        other desktop application.
      </P>
      <Callout title="Builds in progress">
        meith is under active development and pre-built binaries may not be
        published yet. Until they are, you can build and run the app from source —
        see the steps below — or grab the latest artifacts from{" "}
        <a
          href={siteConfig.releases}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          GitHub Releases
        </a>
        .
      </Callout>

      <H2 id="from-source">Run from source</H2>
      <P>
        meith is a pnpm monorepo. You need <Code>Node.js 20+</Code> and{" "}
        <Code>pnpm 9+</Code> installed.
      </P>
      <CodeBlock
        label="terminal"
        code={`# clone and install
git clone ${siteConfig.repo}.git
cd meith
pnpm install

# launch the desktop app in development
pnpm dev`}
      />
      <P>Other useful entry points while developing:</P>
      <CodeBlock
        label="terminal"
        code={`# renderer only, backed by an in-memory mock bridge
pnpm dev:renderer

# main-process services without Electron
pnpm --filter @meith/desktop dev:headless`}
      />

      <H2 id="first-project">Open your first project</H2>
      <OL>
        <li>
          Launch meith. You start in a workspace backed by the built-in mock
          bridge until you open a real folder.
        </li>
        <li>
          In the far-left <strong>Spaces rail</strong>, click the folder button to
          open a project folder — or the <Code>+</Code> button to create an empty
          workspace.
        </li>
        <li>
          meith creates a space for that project. Browser tabs, editor tabs,
          terminals, and agent chats you open are scoped to it.
        </li>
      </OL>

      <H2 id="first-agent">Run your first agent session</H2>
      <OL>
        <li>Open an agent chat tab inside your workspace.</li>
        <li>
          Ask it to do something concrete — for example, &ldquo;summarize the
          README and start the dev server.&rdquo;
        </li>
        <li>
          As the agent calls tools, each step appears inline. Read-only steps run
          immediately; actions that touch your machine pause for your permission.
        </li>
        <li>
          Approve with <strong>Allow once</strong> or <strong>Always allow</strong>
          , or <strong>Deny</strong> to stop. You stay in control of every step.
        </li>
      </OL>

      <H2 id="cli-setup">Set up the CLI (optional)</H2>
      <P>
        On startup the runtime writes <Code>~/.meith/config.json</Code>, registers
        the running instance under <Code>~/.meith/instances/</Code>, and exposes a
        managed launcher at <Code>~/.meith/bin/meith</Code>. To add that launcher
        to your shell:
      </P>
      <CodeBlock
        label="terminal"
        code={`# print shell setup instructions
meith setup

# or write the launcher dir into your shell config
meith setup --write`}
      />
      <UL>
        <li>
          See <a className="text-primary hover:underline" href="/docs/cli">The meith CLI</a> for
          the full command reference.
        </li>
      </UL>

      <DocsPager pathname="/docs/getting-started" />
    </>
  )
}
