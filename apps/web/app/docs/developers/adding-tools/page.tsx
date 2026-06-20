import type { Metadata } from "next"
import { DocsHeader, H2, P, Lead, Ul, Li, Ol, InlineCode, Callout, Divider } from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Adding tools",
  description:
    "A tool is a typed unit of behavior callable by the renderer, CLI, agents, plugins, and internal code through the same registry. Here is how to add one.",
}

export default function AddingToolsPage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Adding tools"
        description="Define a schema-validated tool, register it, and it becomes available to the UI, CLI, agents, and plugins at once."
      />

      <Lead>
        A tool is a typed unit of behavior callable by the renderer, CLI, agents, plugins, and internal code through the
        same <InlineCode>ToolRegistry</InlineCode>. Built-in tools live in{" "}
        <InlineCode>packages/desktop/src/main/tools/</InlineCode>.
      </Lead>
      <P>
        Every tool should be small, schema-validated, honest about its capabilities, and implemented through a service
        rather than reaching across app boundaries.
      </P>

      <H2 id="pick-service">1. Pick the owning service</H2>
      <P>
        Tools should expose behavior from a main-process service. Prefer adding logic to the service that owns the domain
        (for example <InlineCode>BrowserTabService</InlineCode> for browser tools, <InlineCode>WorkspaceFileService</InlineCode>{" "}
        for file tools), then add a thin tool wrapper. If the feature needs a new durable domain, add a service and wire
        it in <InlineCode>bootstrap.ts</InlineCode> first.
      </P>

      <H2 id="define">2. Define the tool</H2>
      <P>
        Use <InlineCode>defineTool</InlineCode> from <InlineCode>@meith/protocol</InlineCode> and a Zod input schema. Tool
        names are <InlineCode>snake_case</InlineCode>.
      </P>
      <CodeBlock
        language="ts"
        code={`import { defineTool } from "@meith/protocol"
import { ToolError, okResult } from "@meith/shared"
import { z } from "zod"
import type { ToolDeps } from "./deps.js"

export function createExampleTools(deps: ToolDeps) {
  return [
    defineTool({
      name: "example_echo",
      description: "Return the supplied message.",
      capabilities: ["read-only"],
      inputSchema: z.object({
        message: z.string().min(1).describe("Message to echo."),
      }),
      execute: async (ctx, input) => {
        if (ctx.signal?.aborted) {
          throw new ToolError("CANCELLED", "Call was cancelled.")
        }
        ctx.emit?.({ kind: "progress", message: "echoing", fraction: 1 })
        return okResult({ message: input.message })
      },
    }),
  ]
}`}
      />

      <H2 id="register">3. Register the tool</H2>
      <P>
        Register the tool factory in <InlineCode>packages/desktop/src/main/bootstrap.ts</InlineCode>:
      </P>
      <CodeBlock
        language="ts"
        code={`import { createExampleTools } from "./tools/exampleTools.js"

// after deps are available
registry.registerAll(createExampleTools(deps))`}
      />
      <P>Once registered, the tool is available through:</P>
      <Ul>
        <Li>
          renderer IPC via <InlineCode>bridge.tools.call(&quot;example_echo&quot;, args)</InlineCode>,
        </Li>
        <Li>
          CLI via <InlineCode>meith call example_echo --message hello</InlineCode>,
        </Li>
        <Li>agents through the generated live tool catalog,</Li>
        <Li>
          plugins through <InlineCode>window.meithPlugin.tools.call()</InlineCode> if granted the required capabilities,
        </Li>
        <Li>the debug tool runner.</Li>
      </Ul>

      <H2 id="capabilities">4. Declare capabilities correctly</H2>
      <P>
        Capabilities drive permission decisions and plugin grants. Be conservative and declare every meaningful effect —{" "}
        <InlineCode>writes-files</InlineCode>, <InlineCode>controls-browser</InlineCode>,{" "}
        <InlineCode>starts-process</InlineCode>, <InlineCode>accesses-network</InlineCode>, and{" "}
        <InlineCode>destructive</InlineCode>. Renderer and internal callers are trusted in-process but still audited; CLI,
        agent, and plugin callers need explicit grants for privileged capabilities.
      </P>

      <H2 id="errors">5. Handle errors and cancellation</H2>
      <Ul>
        <Li>Reject invalid input with the Zod schema where possible.</Li>
        <Li>
          Throw <InlineCode>ToolError(&quot;VALIDATION_ERROR&quot;, message)</InlineCode> for domain validation, and{" "}
          <InlineCode>ToolError(&quot;PERMISSION_DENIED&quot;, ...)</InlineCode> for ownership failures.
        </Li>
        <Li>
          Long-running tools should observe <InlineCode>ctx.signal</InlineCode> and use <InlineCode>ctx.emit</InlineCode>{" "}
          for <InlineCode>progress</InlineCode>, <InlineCode>log</InlineCode>, <InlineCode>partial_text</InlineCode>, and{" "}
          <InlineCode>artifact</InlineCode> events.
        </Li>
      </Ul>

      <H2 id="cli-command">6. Add a friendly CLI command when useful</H2>
      <P>
        Any tool is already reachable with <InlineCode>meith call</InlineCode>. For common workflows, add a command
        mapping in <InlineCode>packages/cli/src/commands.ts</InlineCode>:
      </P>
      <CodeBlock
        language="ts"
        code={`export const commands = {
  "example-echo": {
    tool: "example_echo",
    positionals: ["message"],
    summary: "Echo <message>",
  },
}`}
      />

      <H2 id="checklist">Checklist</H2>
      <Ol>
        <Li>The service owns the actual behavior.</Li>
        <Li>The tool has a Zod input schema with useful descriptions.</Li>
        <Li>
          The tool name is <InlineCode>snake_case</InlineCode> and capabilities cover every side effect.
        </Li>
        <Li>
          Errors map to the right <InlineCode>ToolErrorCode</InlineCode>; long work observes{" "}
          <InlineCode>ctx.signal</InlineCode> and streams with <InlineCode>ctx.emit</InlineCode>.
        </Li>
        <Li>
          The tool is registered in <InlineCode>bootstrap.ts</InlineCode>, and tests cover the service and registry
          behavior.
        </Li>
      </Ol>
      <Callout title="Verify your change">
        Run <InlineCode>pnpm --filter @meith/desktop test</InlineCode> and <InlineCode>pnpm typecheck</InlineCode> at a
        minimum. For broad or shared changes, run <InlineCode>pnpm check</InlineCode>.
      </Callout>

      <Divider />
      <DocsPager />
    </article>
  )
}
