import type { Metadata } from "next"
import { Code, Callout, DocHeader, H2, P, UL } from "@/components/docs/prose"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Tools & permissions",
  description:
    "How meith's shared tool registry keeps agents and plugins in check.",
}

export default function ToolsPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Tools & permissions"
        description="Every major action in meith routes through a shared tool registry, so you stay in control of what touches your machine."
      />

      <H2 id="registry">One shared tool registry</H2>
      <P>
        The visual interface, the terminal command, plugins, and agents all act
        through a single tool registry that lives in the desktop main process.
        Tools declare their capabilities upfront — things like reading state,
        writing files, controlling the browser, starting processes, making
        network requests, or performing destructive actions.
      </P>

      <H2 id="trust">Who is trusted, and who isn't</H2>
      <P>
        The renderer is fully trusted as part of the core app. Agents and plugins
        face strict limits:
      </P>
      <UL>
        <li>read-only actions execute without interruption,</li>
        <li>
          file writes, browser control, process starts, and destructive actions
          require explicit permission or an approved grant,
        </li>
        <li>
          the host resolves plugin identity directly from the plugin tab itself,
          ignoring whatever data the plugin sends,
        </li>
        <li>
          plugin tabs only access the <Code>window.meithPlugin</Code> APIs you
          specifically approve.
        </li>
      </UL>

      <H2 id="prompts">Permission prompts</H2>
      <P>
        When an agent or plugin requests a privileged action, meith pauses and
        asks. You can <strong>Allow once</strong>, <strong>Always allow</strong>{" "}
        (creating a standing grant), or <strong>Deny</strong>. Grants are scoped
        and can be revisited later.
      </P>
      <Callout title="Audited by default">
        Every call through the registry is validated against the tool&apos;s
        declared capabilities and audited — so nothing slips through unchecked.
      </Callout>

      <H2 id="developers">For developers</H2>
      <P>
        The full wire protocol, result envelopes, capabilities, timeouts, and
        caller policies are documented in the developer reference:{" "}
        <a
          className="text-primary hover:underline"
          href="/docs/developers/tool-protocol"
        >
          Tool protocol
        </a>{" "}
        and{" "}
        <a
          className="text-primary hover:underline"
          href="/docs/developers/adding-tools"
        >
          Adding tools
        </a>
        .
      </P>

      <DocsPager pathname="/docs/tools" />
    </>
  )
}
