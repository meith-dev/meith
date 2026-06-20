import type { Metadata } from "next"
import { Code, DocHeader, H2, P, UL } from "@/components/docs/prose"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Workspaces & tabs",
  description: "How spaces map to projects, and how tabs organize your work.",
}

export default function SpacesPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Workspaces & tabs"
        description="Workspaces are the core of meith. One workspace generally maps to one project folder on your disk."
      />

      <H2 id="spaces">Spaces are projects</H2>
      <P>
        Each space is one project. The far-left <strong>Spaces rail</strong> works
        like a profile switcher: every open project is a colored avatar with its
        initial, and the active one is ringed. Click an avatar to switch, or use
        the <Code>+</Code> and folder buttons at the bottom of the list to create
        a new workspace or open an existing folder.
      </P>

      <H2 id="tabs">What lives inside a workspace</H2>
      <P>Within each workspace you can have:</P>
      <UL>
        <li>browser tabs for local testing or research,</li>
        <li>editor tabs for project files,</li>
        <li>terminal tabs,</li>
        <li>agent chat tabs,</li>
        <li>run commands and environment configurations,</li>
        <li>plugin tabs.</li>
      </UL>

      <H2 id="panes">Arrange panes side by side</H2>
      <P>
        Split panes to arrange your browser, editor, terminal, or agent next to
        each other. A common layout is an agent chat on the left with a live
        localhost preview on the right, so you can watch changes land as the agent
        works.
      </P>

      <H2 id="run-and-preview">Run commands & preview</H2>
      <P>
        Start and stop your project&apos;s run command from the top bar, then
        preview the running local app in an embedded browser tab. Terminal and
        dev-server logs stay inside the window — the status bar at the bottom
        shows how many servers are running and on which port.
      </P>

      <H2 id="persistence">Everything persists</H2>
      <P>
        The app persists your spaces, tabs, projects, settings, logs, and agent
        sessions across restarts, so you can quit and pick up exactly where you
        left off.
      </P>

      <DocsPager pathname="/docs/spaces" />
    </>
  )
}
