import type { Metadata } from "next"
import { DocsHeader, H2, P, Lead, Ul, Li, Ol, InlineCode, Callout, Divider } from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Agent runtime",
  description:
    "How meith manages agent sessions, transcripts, permissions, and adapters while keeping all app actions behind the shared tool registry.",
}

export default function AgentRuntimePage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Agent runtime"
        description="Sessions, the system prompt, permission gating, and the Mock and ACP adapters."
      />

      <Lead>
        The agent runtime lives in the desktop main process. It manages sessions, transcripts, configuration, streaming
        output, permission prompts, and adapter execution while keeping all app actions behind the shared tool registry.
      </Lead>
      <P>
        The runtime keeps provider-specific code out of the core app. <InlineCode>AgentService</InlineCode> owns sessions
        and gating; adapters know how to talk to a specific backend or protocol.
      </P>

      <H2 id="sessions">Session model</H2>
      <P>
        A session contains an id, title, cwd, optional space id, optional model, adapter id, status, timestamps, and
        messages. <InlineCode>AgentStore</InlineCode> persists session metadata and messages. On startup,{" "}
        <InlineCode>AgentService.hydrate()</InlineCode> loads stored sessions and resets any crash-left{" "}
        <InlineCode>running</InlineCode> sessions back to <InlineCode>idle</InlineCode>. The renderer shows sessions in{" "}
        <InlineCode>AgentView</InlineCode>: a resizable session list, transcript, composer, stop button, and pending
        permission cards.
      </P>
      <P>
        Session titles are generated from the first useful user request and capped for the session list.{" "}
        <InlineCode>lastViewedAt</InlineCode> tracks finished sessions with unseen updates.
      </P>
      <P>
        Transcripts are stored outside the session index as per-session JSONL records. Streaming text is appended as
        compact message patches, including optional <InlineCode>thought</InlineCode> and{" "}
        <InlineCode>message</InlineCode> segment kinds. When a transcript grows past size or record-count thresholds,{" "}
        <InlineCode>AgentStore</InlineCode> compacts it into message snapshots while preserving tool calls, usage,
        errors, and text segments.
      </P>

      <H2 id="config">Configuration</H2>
      <P>
        Agent config is stored by <InlineCode>AgentConfigStore</InlineCode> and edited in Settings:
      </P>
      <Ul>
        <Li>
          <InlineCode>adapter</InlineCode>: <InlineCode>mock</InlineCode> or <InlineCode>acp</InlineCode>
        </Li>
        <Li>
          <InlineCode>acpPreset</InlineCode>: <InlineCode>claude</InlineCode>, <InlineCode>codex</InlineCode>, or{" "}
          <InlineCode>custom</InlineCode>
        </Li>
        <Li>
          <InlineCode>command</InlineCode> and <InlineCode>args</InlineCode> for a custom ACP executable
        </Li>
        <Li>
          <InlineCode>model</InlineCode> (optional) and <InlineCode>autoAccept</InlineCode>
        </Li>
        <Li>
          <InlineCode>reasoning</InlineCode> for an optional effort/reasoning level advertised by the ACP agent
        </Li>
      </Ul>
      <P>
        The default adapter is <InlineCode>mock</InlineCode>, so the UI works without external setup.
      </P>

      <H2 id="system-prompt">System prompt</H2>
      <P>
        <InlineCode>buildSystemPrompt()</InlineCode> composes the prompt from a static base, the live tool catalog from{" "}
        <InlineCode>registry.describe()</InlineCode>, the current session context (cwd, space name, open browser tabs),
        and safety text reflecting whether auto-accept is enabled. The tool list is never hardcoded — if a tool is
        registered, the agent prompt can include it. If a tool is removed or renamed, the prompt changes with the
        registry.
      </P>

      <H2 id="permissions">Tool calls and permissions</H2>
      <P>
        Agents are just another registry caller, but not a trusted one. <InlineCode>AgentService.gatedCall()</InlineCode>{" "}
        applies this policy:
      </P>
      <Ul>
        <Li>tools with no privileged capabilities run directly,</Li>
        <Li>privileged tools prompt the user unless auto-accept is on or the decision was remembered,</Li>
        <Li>
          denied calls return <InlineCode>PERMISSION_DENIED</InlineCode>,
        </Li>
        <Li>
          approved calls write a one-use grant into <InlineCode>PermissionService</InlineCode>,
        </Li>
        <Li>
          the final call goes through <InlineCode>ToolRegistry.call()</InlineCode> with{" "}
          <InlineCode>caller: &quot;agent&quot;</InlineCode> and the real session id.
        </Li>
      </Ul>
      <Callout>
        Privileged capabilities are <InlineCode>writes-files</InlineCode>, <InlineCode>controls-browser</InlineCode>,{" "}
        <InlineCode>starts-process</InlineCode>, and <InlineCode>destructive</InlineCode>.{" "}
        <InlineCode>accesses-network</InlineCode> is still declared and audited.
      </Callout>

      <H2 id="acp">The ACP adapter</H2>
      <P>
        <InlineCode>AcpAdapter</InlineCode> runs an external Agent Client Protocol subprocess over stdio:
      </P>
      <Ol>
        <Li>Resolve the configured preset or custom command.</Li>
        <Li>Spawn the subprocess in the session cwd.</Li>
        <Li>
          Initialize ACP with <InlineCode>protocolVersion: 1</InlineCode>.
        </Li>
        <Li>Start the per-session MCP bridge and register the session, receiving a localhost URL and bearer token.</Li>
        <Li>
          Send <InlineCode>session/new</InlineCode> with that MCP server, then <InlineCode>session/prompt</InlineCode>{" "}
          with the composed prompt.
        </Li>
        <Li>
          Map ACP <InlineCode>session/update</InlineCode> notifications into meith stream chunks.
        </Li>
      </Ol>
      <P>
        ACP permission requests are allowed at the ACP layer only when they reference a tool exposed by the MCP server
        named <InlineCode>meith</InlineCode>. Provider-native tools, other MCP servers, and unknown helper surfaces are
        denied before they can bypass <InlineCode>AgentService</InlineCode>, <InlineCode>PermissionService</InlineCode>,
        or browser ownership.
      </P>
      <P>
        When an ACP agent advertises config options, meith applies the selected model and reasoning level through{" "}
        <InlineCode>session/set_config_option</InlineCode>. If a text verbosity option exists, meith sets it to low by
        default so streamed output stays compact. Built-in Claude and Codex presets also wait until the agent has listed
        the per-session Meith MCP tools before the prompt is sent.
      </P>
      <P>
        Packaged desktop builds run built-in ACP presets through Meith&apos;s bundled{" "}
        <InlineCode>npx</InlineCode>, with npm cache and prefix directed at Meith-managed directories. The ACP package
        can still be fetched from the npm registry, but the app does not rely on a user-installed Node, npm, or npx.
      </P>

      <H2 id="mcp-bridge">MCP bridge</H2>
      <P>
        <InlineCode>McpBridgeService</InlineCode> is a dependency-light local HTTP JSON-RPC server bound to{" "}
        <InlineCode>127.0.0.1</InlineCode> on an ephemeral port. Each session gets a unique bearer token mapping to a
        binding, and <InlineCode>tools/call</InlineCode> maps the external request back into the session&apos;s gated
        tool call function — preserving the same permission, audit, and browser-ownership model as in-process calls.
      </P>
      <CodeBlock
        language="ts"
        code={`// supported MCP-style methods
initialize
notifications/initialized
notifications/cancelled
ping
tools/list
tools/call`}
      />

      <Divider />
      <DocsPager />
    </article>
  )
}
