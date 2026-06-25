import type { Metadata } from "next"
import {
  CardGrid,
  Callout,
  Code,
  DocCard,
  DocHeader,
  H2,
  Lead,
  OL,
  P,
  UL,
} from "@/components/docs/prose"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Using meith",
  description:
    "A tour of the meith workbench and the everyday loop of opening a project, running it, and working alongside an agent.",
}

export default function UsingMeithPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Using meith"
        description="A practical tour of the workbench — what each part of the window does, and the everyday loop of building with an agent at your side."
      />

      <Lead>
        meith is a single window that gathers the things you normally spread
        across an editor, a terminal, a browser, and a chat app while building a
        web app. Once you know where each surface lives, the daily loop is fast:
        open a project, split a couple of panes, start the dev server, and let an
        agent build features while you watch the preview update at every step.
      </Lead>

      <H2 id="layout">The workbench at a glance</H2>
      <P>
        meith is a fixed desktop shell rather than a scrolling web page. From the
        outside in, the window is made of a few stable regions:
      </P>
      <UL>
        <li>
          A custom <strong>title bar</strong> across the top, with the meith mark,
          the active project&apos;s run controls, and window chrome.
        </li>
        <li>
          The far-left <strong>Spaces rail</strong> — an icon rail that works like
          a profile switcher, with one avatar per open project and buttons to
          create a workspace or open a folder.
        </li>
        <li>
          The central <strong>workspace</strong>, where your editor, browser,
          terminal, agent, and plugin tabs live and can be split into panes.
        </li>
        <li>
          A collapsible <strong>diagnostics drawer</strong> along the bottom for
          terminal output and dev-server logs.
        </li>
        <li>
          A <strong>status bar</strong> footer that shows live signals such as how
          many dev servers are running and on which port, plus whether the runtime
          is connected.
        </li>
      </UL>

      <H2 id="loop">A typical session</H2>
      <OL>
        <li>
          Open a project folder from the Spaces rail. meith creates a space for it
          and scopes every tab you open to that project.
        </li>
        <li>
          Split the workspace so you can see more than one thing at once — a common
          layout is an agent chat on the left and a live <Code>localhost</Code>{" "}
          preview on the right.
        </li>
        <li>
          Start your project&apos;s run command from the title bar. The status bar
          shows the running server and its port, and the embedded browser tab can
          point straight at it.
        </li>
        <li>
          Ask the agent to build something concrete — a component, a page, a
          feature. As it calls tools, each step appears inline; read-only steps
          run immediately and anything that touches your machine pauses for
          approval.
        </li>
        <li>
          Watch the preview update and check the diagnostics drawer for logs as
          changes land.
        </li>
      </OL>

      <H2 id="changes">Reviewing what changed</H2>
      <P>
        When an agent edits files, the edits aren&apos;t a black box. meith reads a
        project&apos;s working-tree changes — staged, unstaged, and brand-new
        files — and presents them as per-file diffs with added and removed line
        counts, so you can see exactly what was rewritten before you keep it.
      </P>
      <Callout title="Edits are reversible">
        File edits land as reviewable diffs, and a workspace-level undo lets you
        roll back the last write if a change wasn&apos;t what you wanted.
      </Callout>

      <H2 id="control">Staying in control</H2>
      <P>
        Everything an agent or plugin does flows through one shared tool registry,
        and privileged actions stop for your sign-off. When a tool wants to write
        a file, control the browser, start a process, or do something destructive,
        meith pauses and asks. You can:
      </P>
      <UL>
        <li>
          <strong>Allow once</strong> to permit just this action,
        </li>
        <li>
          <strong>Always allow</strong> to create a standing grant, or
        </li>
        <li>
          <strong>Deny</strong> to stop it.
        </li>
      </UL>
      <P>
        Read-only work never interrupts you, and every call is audited. See{" "}
        <a className="text-primary hover:underline" href="/docs/tools">
          Tools &amp; permissions
        </a>{" "}
        for the full model.
      </P>

      <H2 id="terminal">Driving it from the terminal</H2>
      <P>
        meith also answers to a command line. The <Code>meith</Code> command talks
        to the running app over a local socket and calls the exact same tools the
        window uses — so you can open tabs, inspect dev servers, or stream logs
        without leaving your shell. Run <Code>meith setup</Code> once to add it to
        your <Code>PATH</Code>, then explore with{" "}
        <a className="text-primary hover:underline" href="/docs/cli">
          The meith CLI
        </a>
        .
      </P>

      <H2 id="next">Go deeper</H2>
      <CardGrid>
        <DocCard href="/docs/spaces" title="Workspaces & tabs">
          How spaces map to projects, and how tabs and split panes organize your
          work.
        </DocCard>
        <DocCard href="/docs/agents" title="Working with agents">
          Put an agent to work in your project&apos;s context and review every
          action.
        </DocCard>
        <DocCard href="/docs/plugins" title="Plugins">
          Extend meith with web-app plugins and approve exactly what they can
          touch.
        </DocCard>
        <DocCard href="/docs/cli" title="The meith CLI">
          Inspect and control a running runtime from your terminal.
        </DocCard>
      </CardGrid>

      <DocsPager pathname="/docs/using-meith" />
    </>
  )
}
