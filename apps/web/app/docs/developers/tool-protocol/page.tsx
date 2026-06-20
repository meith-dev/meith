import type { Metadata } from "next"
import { DocsHeader, H2, H3, P, Lead, Ul, Li, InlineCode, Callout, Table, Divider } from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Tool protocol",
  description:
    "meith exposes its tool registry over a local newline-delimited JSON socket. Learn the message types, the ToolResult envelope, and caller identity.",
}

export default function ToolProtocolPage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Tool protocol"
        description="The local NDJSON socket protocol that the CLI, plugins, and agents use to reach the registry."
      />

      <Lead>
        meith exposes its tool registry over a local newline-delimited JSON socket. The renderer uses Electron IPC, but
        it calls the same <InlineCode>ToolRegistry</InlineCode> and receives the same <InlineCode>ToolResult</InlineCode>{" "}
        shape.
      </Lead>

      <H2 id="transport">Transport</H2>
      <P>
        The socket protocol is NDJSON: each line is one complete JSON frame. The runtime writes its socket path to{" "}
        <InlineCode>~/.meith/config.json</InlineCode> and publishes live instance records in{" "}
        <InlineCode>~/.meith/instances/</InlineCode>. Every message may include <InlineCode>protocol</InlineCode>; the
        current value is <InlineCode>PROTOCOL_VERSION = 1</InlineCode>. A mismatched version returns a transport{" "}
        <InlineCode>error</InlineCode> with <InlineCode>PROTOCOL_ERROR</InlineCode>.
      </P>

      <H2 id="client-messages">Client messages</H2>
      <H3 id="tool-call">tool_call</H3>
      <P>Calls a registered tool. The response is zero or more tool_event frames, then one final tool_result frame.</P>
      <CodeBlock
        language="json"
        code={`{
  "type": "tool_call",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "toolName": "open_browser_tab",
  "arguments": { "url": "http://localhost:3000" },
  "clientInfo": {
    "caller": "cli",
    "cwd": "/work/project",
    "spaceId": "space_1",
    "tabId": "btab_1"
  },
  "timeoutMs": 30000
}`}
      />
      <P>
        <InlineCode>list_tools</InlineCode> returns serializable tool descriptors, and{" "}
        <InlineCode>cancel_tool_call</InlineCode> cancels an in-flight call by request id. Cancellation is cooperative —
        the registry aborts the call signal and races execution against it so a cancelled call always resolves with a
        structured failure.
      </P>

      <H2 id="tool-result">The ToolResult envelope</H2>
      <P>Every tool resolves to this envelope:</P>
      <CodeBlock
        language="ts"
        code={`interface ToolResult<T = unknown> {
  ok: boolean
  content?: T
  meta?: Record<string, unknown>
  diagnostics?: Array<{
    level: "info" | "warn" | "error"
    message: string
  }>
  error?: {
    code: ToolErrorCode
    message: string
    details?: unknown
  }
}`}
      />
      <P>Tools may return either a raw value or a full ToolResult.</P>
      <Ul>
        <Li>
          Raw values become <InlineCode>{`{ ok: true, content: value }`}</InlineCode>.
        </Li>
        <Li>
          <InlineCode>okResult()</InlineCode> and <InlineCode>errorResult()</InlineCode> create explicit envelopes.
        </Li>
        <Li>
          Throwing <InlineCode>ToolError</InlineCode> controls the returned error code; any other throw becomes{" "}
          <InlineCode>TOOL_FAILED</InlineCode>.
        </Li>
      </Ul>
      <P>
        Error codes: <InlineCode>UNKNOWN_TOOL</InlineCode>, <InlineCode>VALIDATION_ERROR</InlineCode>,{" "}
        <InlineCode>PERMISSION_DENIED</InlineCode>, <InlineCode>TIMEOUT</InlineCode>, <InlineCode>TOOL_FAILED</InlineCode>,{" "}
        <InlineCode>RUNTIME_SHUTTING_DOWN</InlineCode>, <InlineCode>CANCELLED</InlineCode>, and{" "}
        <InlineCode>PROTOCOL_ERROR</InlineCode>.
      </P>

      <H2 id="capabilities">Capabilities</H2>
      <P>Each tool can declare safety metadata that PermissionService treats as authorization inputs.</P>
      <Table
        head={["Capability", "Meaning"]}
        rows={[
          [<InlineCode key="r">read-only</InlineCode>, "Reads state, files, or metadata without mutating."],
          [<InlineCode key="w">writes-files</InlineCode>, "Creates, modifies, deletes, or persists files or config."],
          [<InlineCode key="b">controls-browser</InlineCode>, "Opens, navigates, clicks, types, or screenshots tabs."],
          [<InlineCode key="p">starts-process</InlineCode>, "Starts or controls processes, terminals, or dev servers."],
          [<InlineCode key="n">accesses-network</InlineCode>, "Causes network access directly or indirectly."],
          [<InlineCode key="d">destructive</InlineCode>, "Performs high-impact, irreversible actions."],
        ]}
      />

      <H2 id="caller-identity">Caller identity</H2>
      <P>
        The socket is a local but untrusted boundary. <InlineCode>ToolSocketService</InlineCode> does not trust
        security-relevant caller claims from socket peers:
      </P>
      <Ul>
        <Li>
          socket clients can assert <InlineCode>cli</InlineCode> or <InlineCode>plugin</InlineCode>,
        </Li>
        <Li>
          attempts to assert <InlineCode>renderer</InlineCode>, <InlineCode>agent</InlineCode>, or{" "}
          <InlineCode>internal</InlineCode> are downgraded,
        </Li>
        <Li>client-provided session ids are replaced by a server-assigned per-connection id.</Li>
      </Ul>
      <Callout title="Why it matters">
        This protects browser automation ownership. A socket peer cannot choose a session id to impersonate another
        owner. Renderer IPC is in-process and trusted as <InlineCode>caller: &quot;renderer&quot;</InlineCode>, and agents
        call the registry in-process with their real session id.
      </Callout>

      <H2 id="timeouts">Timeouts and auditing</H2>
      <P>
        Timeout order is <InlineCode>tool_call.timeoutMs</InlineCode>, then the tool definition&apos;s{" "}
        <InlineCode>timeoutMs</InlineCode>, then <InlineCode>DEFAULT_TOOL_TIMEOUT_MS</InlineCode>. Every registry call is
        logged and passed to <InlineCode>PermissionService.auditToolCall</InlineCode>; argument and result summaries
        redact likely secrets and large payloads before writing to <InlineCode>audit.jsonl</InlineCode>.
      </P>

      <Divider />
      <DocsPager />
    </article>
  )
}
