import type { Metadata } from "next"
import { DocsHeader, H2, H3, P, Lead, Ul, Li, Ol, InlineCode, Callout, Table, Divider } from "@/components/docs/prose"
import { CodeBlock } from "@/components/code-block"
import { DocsPager } from "@/components/docs/docs-pager"

export const metadata: Metadata = {
  title: "Plugin API",
  description:
    "A meith plugin is a web app that runs in a controlled plugin browser tab. Learn the manifest, grants, API namespaces, and security model.",
}

export default function PluginApiPage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Plugin API"
        description="Author a sandboxed web plugin that reaches meith capabilities only through approved, audited grants."
      />

      <Lead>
        A meith plugin is a web app that runs inside a controlled plugin browser tab. It does not load code into the main
        process, does not get Node access, and does not register tools into the host.
      </Lead>
      <P>
        Instead, the host may expose <InlineCode>window.meithPlugin</InlineCode> in that plugin tab. The bridge contains
        only the API namespaces the user approved, and every privileged action routes back through the main-process tool
        registry. See <InlineCode>templates/plugin-basic/main.js</InlineCode> for a starter.
      </P>

      <H2 id="lifecycle">Lifecycle</H2>
      <Ol>
        <Li>A plugin is installed from a local directory, packaged archive, or development URL.</Li>
        <Li>The host reads the manifest and stores its requested grants.</Li>
        <Li>The plugin starts disabled with empty approved grants.</Li>
        <Li>The user reviews and approves a subset of the requested API namespaces and tool capabilities.</Li>
        <Li>The plugin can be enabled only after its requested API namespaces are approved.</Li>
        <Li>
          Opening the plugin creates a plugin-mode browser tab; the main process maps that tab&apos;s{" "}
          <InlineCode>webContents.id</InlineCode> to the plugin id.
        </Li>
      </Ol>
      <Callout title="Identity cannot be forged">
        Identity is always resolved from the sender webContents. The plugin page cannot forge another plugin id or grant
        itself extra permissions.
      </Callout>

      <H2 id="manifest">Manifest</H2>
      <P>
        The manifest can be in <InlineCode>plugin.json</InlineCode> at the plugin root or in the{" "}
        <InlineCode>meith</InlineCode> field of <InlineCode>package.json</InlineCode>.
      </P>
      <CodeBlock
        language="json"
        code={`{
  "kind": "plugin",
  "id": "com.example.hello",
  "name": "Hello Plugin",
  "version": "0.1.0",
  "description": "Shown in the permissions review UI.",
  "entry": "index.html",
  "permissions": ["read-only"],
  "requestedApis": ["tools", "storage"]
}`}
      />
      <P>
        <InlineCode>permissions</InlineCode> and <InlineCode>requestedApis</InlineCode> are requests, not grants. Runtime
        enforcement uses only <InlineCode>approvedGrants</InlineCode>, never the requested values. Approving grants always
        intersects the supplied grants with the requested grants, so approval can never exceed the manifest.
      </P>

      <H2 id="api-namespaces">API namespaces</H2>
      <P>
        The bridge shape is exported from <InlineCode>@meith/protocol</InlineCode> as <InlineCode>MeithPluginApi</InlineCode>
        . Namespaces are optional and should always be feature-detected.
      </P>
      <Table
        head={["Namespace", "Provides"]}
        rows={[
          [<InlineCode key="i">identity</InlineCode>, "Approved plugin id, name, version, APIs, and capabilities. Always present."],
          [<InlineCode key="t">tools</InlineCode>, "list() and call() against the registry, gated by approved capabilities."],
          [<InlineCode key="s">storage</InlineCode>, "Read-only browser and workspace tab listings."],
          [<InlineCode key="c">cdp</InlineCode>, "Send Chrome DevTools Protocol commands, following the tab-ownership model."],
          [<InlineCode key="a">ai</InlineCode>, "streamText() through an ephemeral agent session."],
        ]}
      />

      <H3 id="tools-api">tools</H3>
      <P>
        Tool calls are still gated by approved capabilities. A plugin with the <InlineCode>tools</InlineCode> API but
        without <InlineCode>controls-browser</InlineCode> cannot call a browser-control tool — the result is a normal{" "}
        <InlineCode>ToolResult</InlineCode> failure with <InlineCode>PERMISSION_DENIED</InlineCode>.
      </P>

      <H3 id="ai-api">ai</H3>
      <P>
        <InlineCode>AbortSignal</InlineCode> is not used across the context bridge because it is not cloneable. The plugin
        receives cancellation through <InlineCode>onStart</InlineCode>.
      </P>
      <CodeBlock
        language="js"
        code={`const result = await window.meithPlugin.ai.streamText({
  prompt: "Summarize my open tabs.",
  onStart: (controls) => {
    cancel = controls.cancel
  },
  onText: (delta) => {
    output.textContent += delta
  },
})`}
      />

      <H2 id="security">Security model</H2>
      <Ul>
        <Li>Plugin tabs run with context isolation and no Node integration.</Li>
        <Li>
          <InlineCode>window.meithPlugin</InlineCode> is injected only by the plugin preload, and identity is resolved
          from <InlineCode>webContents.id</InlineCode>.
        </Li>
        <Li>API namespaces are present only when approved, and tool calls are checked against approved capabilities on every call.</Li>
        <Li>A disabled or uninstalled plugin loses live tab authority; navigating away revokes the mapping.</Li>
        <Li>Local/package entries are realpath-contained, and archives are extracted with path traversal and link checks.</Li>
      </Ul>

      <H2 id="control-plane">Control-plane tools</H2>
      <P>Plugin management is itself exposed through normal tools, surfaced in the Settings Plugins panel and the CLI.</P>
      <Table
        head={["Tool", "Purpose"]}
        rows={[
          [<InlineCode key="l">list_plugins</InlineCode>, "List installed plugins, grants, and enabled state."],
          [<InlineCode key="i">install_plugin</InlineCode>, "Install from directory, archive, or devUrl."],
          [<InlineCode key="a">approve_plugin_grants</InlineCode>, "Approve a subset of requested capabilities and APIs."],
          [<InlineCode key="s">set_plugin_enabled</InlineCode>, "Enable or disable an installed plugin."],
          [<InlineCode key="u">uninstall_plugin</InlineCode>, "Remove the plugin and revoke open plugin tabs."],
          [<InlineCode key="o">open_plugin_tab</InlineCode>, "Open an enabled plugin in a plugin-mode browser tab."],
        ]}
      />
      <CodeBlock
        language="bash"
        code={`# install from a dev server, then approve and enable
meith call install_plugin --devUrl http://localhost:5173/
meith call approve_plugin_grants \\
  --pluginId com.example.hello \\
  --capabilities-json '["read-only"]' \\
  --apis-json '["tools","storage"]'
meith call set_plugin_enabled --pluginId com.example.hello --enabled true
meith call open_plugin_tab --pluginId com.example.hello`}
      />

      <Divider />
      <DocsPager />
    </article>
  )
}
