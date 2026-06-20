import type { Metadata } from "next"
import {
  CardGrid,
  Code,
  DocCard,
  DocHeader,
  H2,
  Lead,
  P,
  UL,
} from "@/components/docs/prose"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Introduction",
  description:
    "meith is a desktop workspace that puts an AI assistant right next to your code.",
}

export default function DocsIndexPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Introduction"
        description="meith is a desktop workspace that puts an AI assistant right next to your code."
      />

      <Lead>
        meith collects the pieces developers usually scatter across multiple
        windows — project folders, code files, terminal sessions, browser
        previews, run commands, logs, plugins, and agent chats — and puts them in
        one place. A shared tool system connects everything, so the visual app,
        the terminal command, a plugin, and an AI agent all act on the exact same
        project state instead of their own isolated views.
      </Lead>

      <P>
        The name comes from the Irish <em>meitheal</em>: a group of people coming
        together to work on a common task. In meith, the app, command line,
        plugins, and agents gather around a single workspace.
      </P>

      <H2 id="what-you-can-do">What you can do with it</H2>
      <UL>
        <li>Open a project folder in its own workspace.</li>
        <li>Browse and edit code in the integrated editor.</li>
        <li>Start and stop your project&apos;s run command from the top bar.</li>
        <li>Preview the running local app in an embedded browser tab.</li>
        <li>View terminal and dev-server logs without leaving the window.</li>
        <li>
          Split panes to arrange your browser, editor, terminal, or agent side by
          side.
        </li>
        <li>Ask an agent to work within the context of your current project.</li>
        <li>
          Install web-app plugins and explicitly approve the APIs they can use.
        </li>
        <li>
          Use the <Code>meith</Code> terminal command to inspect and control a
          running app instance.
        </li>
      </UL>

      <H2 id="not-locked-in">Not locked into one AI provider</H2>
      <P>
        meith doesn&apos;t tie you to a single model vendor. The agent runtime uses
        an adapter interface and connects to external agents via{" "}
        <Code>ACP</Code> (Agent Client Protocol), keeping the desktop app
        independent of any specific AI provider or SDK.
      </P>

      <H2 id="explore">Where to next</H2>
      <CardGrid>
        <DocCard href="/docs/getting-started" title="Getting started">
          Install meith, open your first project, and run your first agent
          session.
        </DocCard>
        <DocCard href="/docs/spaces" title="Workspaces & tabs">
          How spaces map to projects, and how tabs organize your work.
        </DocCard>
        <DocCard href="/docs/agents" title="Working with agents">
          Ask agents to act on your project and review what they do.
        </DocCard>
        <DocCard href="/docs/tools" title="Tools & permissions">
          How the shared tool registry keeps you in control of every action.
        </DocCard>
      </CardGrid>

      <DocsPager pathname="/docs" />
    </>
  )
}
