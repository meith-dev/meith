import { DocsPager } from "@/components/docs/docs-pager";
import { Callout, Code, DocHeader, H2, OL, P, UL } from "@/components/docs/prose";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plugins",
  description: "Install web-app plugins and approve exactly which APIs they can use.",
};

export default function PluginsPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="Plugins"
        description="A meith plugin is a web app that runs inside a controlled plugin browser tab — with only the access you approve."
      />

      <H2 id="what">What a plugin can and can't do</H2>
      <P>
        A plugin is just a web app. It does not load code into the main process, does not
        get Node access, and does not register its own tools into the host. Instead, meith
        may expose a <Code>window.meithPlugin</Code> bridge in the plugin&apos;s tab —
        containing only the API namespaces you approved, with every privileged action
        routed back through the shared tool registry.
      </P>

      <H2 id="install">Installing & approving</H2>
      <OL>
        <li>Install a plugin from a local folder, a packaged archive, or a dev URL.</li>
        <li>meith reads the plugin&apos;s manifest and stores its requested grants.</li>
        <li>
          The plugin starts <strong>disabled</strong>, with no approved grants.
        </li>
        <li>
          You review the requested API namespaces and capabilities and approve a subset.
        </li>
        <li>Once its requested APIs are approved, the plugin can be enabled.</li>
        <li>Opening it creates a plugin-mode browser tab.</li>
      </OL>
      <Callout title="Approval can only narrow">
        Approving grants always intersects your choices with what the manifest requested —
        approval can never exceed what the plugin asked for. Identity is resolved from the
        tab itself, so a plugin can&apos;t forge another plugin&apos;s id or grant itself
        extra permissions.
      </Callout>

      <H2 id="namespaces">API namespaces</H2>
      <P>The bridge can expose these namespaces, each only when approved:</P>
      <UL>
        <li>
          <Code>identity</Code> — always present; the approved id, name, version, APIs,
          and capabilities.
        </li>
        <li>
          <Code>tools</Code> — list and call registry tools (still gated by approved
          capabilities).
        </li>
        <li>
          <Code>storage</Code> — read browser and workspace tab listings.
        </li>
        <li>
          <Code>cdp</Code> — send Chrome DevTools Protocol commands to a tab (requires a
          browser-control capability).
        </li>
        <li>
          <Code>ai</Code> — stream text from an ephemeral agent session, without bypassing
          agent or tool permissions.
        </li>
      </UL>

      <H2 id="manage">Managing plugins</H2>
      <P>
        Plugin management is itself exposed through normal tools — surfaced in the
        Settings &rarr; Plugins panel and callable from the CLI with commands like{" "}
        <Code>meith plugins</Code>, <Code>meith install-plugin</Code>,{" "}
        <Code>meith approve-plugin</Code>, <Code>meith enable-plugin</Code>, and{" "}
        <Code>meith open-plugin</Code>. The underlying tools are <Code>list_plugins</Code>
        , <Code>install_plugin</Code>, <Code>approve_plugin_grants</Code>,{" "}
        <Code>set_plugin_enabled</Code>, <Code>uninstall_plugin</Code>, and{" "}
        <Code>open_plugin_tab</Code>.
      </P>

      <H2 id="build">Building your own</H2>
      <P>
        Building a plugin is building a web app with a <Code>plugin.json</Code> manifest.
        The full reference — manifests, sources, grants, every bridge API, and the
        security model — is in the developer docs:{" "}
        <a className="text-primary hover:underline" href="/docs/developers/plugin-api">
          Plugin API
        </a>
        .
      </P>

      <DocsPager pathname="/docs/plugins" />
    </>
  );
}
