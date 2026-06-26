import type { Metadata } from "next"
import { Code, Callout, DocHeader, H2, P, UL } from "@/components/docs/prose"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Working with agents",
  description:
    "Ask agents to act on your project, watch each tool call, and stay in control.",
}

export default function AgentsPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Working with agents"
        description="In meith, agents don't just chat — they call real tools to build your web app, with every step shown inline."
      />

      <H2 id="context">Agents work in your project's context</H2>
      <P>
        Open an agent chat tab inside a workspace and the agent operates within
        that project. It can read and edit your app&apos;s code, run the dev
        server, drive an embedded browser to check the live preview, and inspect
        dev-server logs — all through the same shared tool registry the rest of
        the app uses.
      </P>

      <H2 id="adapters">Provider-agnostic by design</H2>
      <P>
        meith doesn&apos;t lock you into one AI provider. The agent runtime uses an
        adapter interface, and currently includes:
      </P>
      <UL>
        <li>
          a built-in <strong>mock adapter</strong> for local testing without any
          external model,
        </li>
        <li>
          an <strong>ACP subprocess adapter</strong> that connects to real
          external agents over the Agent Client Protocol.
        </li>
      </UL>
      <P>
        The <Code>ACP</Code> path lets an agent use meith&apos;s tools without
        forcing the app to depend on a particular AI vendor or SDK.
      </P>

      <H2 id="control">You approve what matters</H2>
      <P>
        Agents do not get unrestricted access. Read-only work runs without
        interruption, but anything that changes your machine pauses for approval:
      </P>
      <UL>
        <li>file writes,</li>
        <li>browser control,</li>
        <li>process starts,</li>
        <li>destructive actions.</li>
      </UL>
      <P>
        You can remember an approval for the same tool for the rest of the
        session. ACP provider-side approvals are narrowed to tools exposed by
        meith, so provider-native helpers cannot bypass the shared registry.
      </P>
      <Callout title="Edits are reviewable">
        When an agent edits a file, the change lands as an inline diff with a
        gutter marker, so you can see exactly what was rewritten — and undo it.
      </Callout>

      <H2 id="next">Learn more</H2>
      <P>
        For how permissions and tool calls work under the hood, see{" "}
        <a className="text-primary hover:underline" href="/docs/tools">
          Tools &amp; permissions
        </a>
        . Developers integrating agents should read the{" "}
        <a
          className="text-primary hover:underline"
          href="/docs/developers/agent-runtime"
        >
          Agent runtime
        </a>{" "}
        reference.
      </P>

      <DocsPager pathname="/docs/agents" />
    </>
  )
}
