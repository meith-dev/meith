import type { Metadata } from "next"
import {
  DocsHeader,
  H2,
  P,
  Lead,
  Ul,
  Li,
  InlineCode,
  Callout,
  Table,
  Divider,
} from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Developer overview",
  description:
    "How meith is built: an Electron workbench backed by a local tool runtime that the UI, CLI, plugins, and agents all share.",
}

export default function DevelopersOverviewPage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Developer overview"
        description="meith is an Electron desktop workbench backed by a local tool runtime. Everything routes through one validated registry."
      />

      <Lead>
        The main process is the authority for state and side effects. The renderer, CLI, plugins, and agent runtime all
        reach application capabilities through the same validated <InlineCode>ToolRegistry</InlineCode>.
      </Lead>

      <P>
        That design keeps the app consistent: opening a tab from the UI, running <InlineCode>meith open</InlineCode>, or
        letting an agent control a browser tab all go through the same tool definition, validation, permission, logging,
        and persistence path.
      </P>

      <H2 id="packages">Packages</H2>
      <P>meith is a pnpm monorepo built from four packages.</P>
      <Table
        head={["Package", "Role"]}
        rows={[
          [
            <InlineCode key="s">@meith/shared</InlineCode>,
            "Zod schemas and inferred types for app state, tabs, projects, tools, agents, plugins, logs, settings, IDs, and result helpers.",
          ],
          [
            <InlineCode key="p">@meith/protocol</InlineCode>,
            "Tool contracts, tool descriptors, NDJSON protocol messages, naming helpers, and public plugin bridge types.",
          ],
          [
            <InlineCode key="d">@meith/desktop</InlineCode>,
            "Electron main/preload/renderer, services, tool registration, socket server, IPC, browser/terminal hosts, agents, plugins, storage, and packaging.",
          ],
          [
            <InlineCode key="c">@meith/cli</InlineCode>,
            "Terminal client that discovers a running runtime and calls tools over the local socket.",
          ],
        ]}
      />

      <H2 id="authority">Authority model</H2>
      <P>
        The runtime is centered on <InlineCode>packages/desktop/src/main/bootstrap.ts</InlineCode>.{" "}
        <InlineCode>bootstrap(userDataPath, options)</InlineCode> wires the services, registers tools, starts the local
        socket server, writes config, publishes an instance record, hydrates state, and returns the service container.
      </P>
      <CodeBlock
        language="text"
        code={`Renderer IPC ─────┐
CLI socket ───────┤
Plugin bridge ────┤
Agent MCP bridge ─┼── ToolRegistry ── services ── app state / files / browser / processes
Internal calls ───┘`}
      />
      <P>
        <InlineCode>ToolRegistry.call()</InlineCode> is the common choke point. It:
      </P>
      <Ul>
        <Li>rejects unknown tools,</Li>
        <Li>validates arguments with each tool&apos;s Zod schema,</Li>
        <Li>
          asks <InlineCode>PermissionService</InlineCode> to authorize privileged calls,
        </Li>
        <Li>applies timeout and cancellation handling,</Li>
        <Li>passes an abort signal and optional event emitter to the tool,</Li>
        <Li>
          normalizes returned values into a <InlineCode>ToolResult</InlineCode>,
        </Li>
        <Li>logs and audits every call.</Li>
      </Ul>

      <H2 id="services">Services</H2>
      <P>
        The main services are created in <InlineCode>bootstrap.ts</InlineCode>:
      </P>
      <Ul>
        <Li>
          <InlineCode>AppStateService</InlineCode> owns persisted app state and emits reactive state changes.
        </Li>
        <Li>
          <InlineCode>BrowserTabService</InlineCode> owns browser/workspace tab records and delegates live web contents
          to a <InlineCode>BrowserViewHost</InlineCode>.
        </Li>
        <Li>
          <InlineCode>SpaceService</InlineCode> creates, updates, switches, and closes workspaces.
        </Li>
        <Li>
          <InlineCode>ProjectService</InlineCode> detects folders, opens projects into spaces, generates templates,
          prewarms generated projects, and starts project run commands.
        </Li>
        <Li>
          <InlineCode>WorkspaceFileService</InlineCode> reads, writes, patches, searches, and diagnoses files inside
          trusted workspace boundaries.
        </Li>
        <Li>
          <InlineCode>DevServerService</InlineCode> and <InlineCode>TerminalService</InlineCode> start and track managed
          processes, dev servers, and terminal sessions.
        </Li>
        <Li>
          <InlineCode>PluginHostService</InlineCode> installs plugins, stores grants, and gates plugin bridge APIs.
        </Li>
        <Li>
          <InlineCode>AgentService</InlineCode> stores sessions and messages, runs the configured adapter, and gates
          agent tool calls.
        </Li>
        <Li>
          <InlineCode>McpBridgeService</InlineCode> exposes per-agent-session tools over a localhost MCP-style HTTP
          endpoint for external ACP agents.
        </Li>
        <Li>
          <InlineCode>PermissionService</InlineCode> authorizes non-renderer privileged calls and writes audit entries.
        </Li>
        <Li>
          <InlineCode>StorageService</InlineCode> exposes read-only storage introspection, and{" "}
          <InlineCode>ToolSocketService</InlineCode> exposes the registry over a local NDJSON socket.
        </Li>
      </Ul>

      <H2 id="persistence">Persistence</H2>
      <P>
        Runtime data lives under the user data path passed to <InlineCode>bootstrap()</InlineCode>. In normal use,
        discovery data lives under <InlineCode>~/.meith</InlineCode>.
      </P>
      <Ul>
        <Li>
          <InlineCode>~/.meith/config.json</InlineCode> records the active runtime socket, app version, protocol
          version, user data path, instance path, and managed CLI launcher.
        </Li>
        <Li>
          <InlineCode>~/.meith/instances/&lt;pid&gt;.json</InlineCode> records live runtime instances so the CLI can
          list, target, or kill them.
        </Li>
        <Li>
          <InlineCode>&lt;userData&gt;/state.json</InlineCode> stores spaces, projects, tabs, file edit events, plugins,
          and settings.
        </Li>
        <Li>
          <InlineCode>&lt;userData&gt;/logs.jsonl</InlineCode> and <InlineCode>&lt;userData&gt;/audit.jsonl</InlineCode>{" "}
          store app logs and tool authorization records.
        </Li>
      </Ul>
      <Callout>
        <InlineCode>JsonStore</InlineCode> writes bounded JSON atomically and runs migrations before schema validation.
        Corrupt state is backed up and reset to defaults instead of crashing the app.
      </Callout>

      <H2 id="dev-modes">Development modes</H2>
      <CodeBlock
        language="bash"
        code={`# desktop app
pnpm dev

# renderer-only mock mode
pnpm dev:renderer

# headless main-process runtime
pnpm --filter @meith/desktop dev:headless

# full verification
pnpm check`}
      />

      <Divider />
      <DocsPager />
    </article>
  )
}
