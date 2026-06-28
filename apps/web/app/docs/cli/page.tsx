import { CodeBlock } from "@/components/code-block";
import { DocsPager } from "@/components/docs/docs-pager";
import { Callout, Code, DocHeader, H2, P, UL } from "@/components/docs/prose";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The meith CLI",
  description:
    "Inspect and control a running meith runtime from your terminal with the meith command.",
};

export default function CliPage() {
  return (
    <>
      <DocHeader
        eyebrow="Using meith"
        title="The meith CLI"
        description="The meith command talks to a running runtime over a local socket and calls the exact same tools the app uses."
      />

      <H2 id="setup">Setup</H2>
      <P>
        On startup the runtime registers the running instance and exposes a managed
        launcher at <Code>~/.meith/bin/meith</Code>. Open the desktop app once, then use
        that launcher to add it to your shell:
      </P>
      <CodeBlock
        label="terminal"
        code={`# print shell PATH setup instructions
~/.meith/bin/meith setup

# or write the launcher dir into your shell config
~/.meith/bin/meith setup --write

# after restarting your shell
meith app list`}
      />
      <P>
        Through the monorepo you can also run the CLI with{" "}
        <Code>pnpm cli &lt;command&gt;</Code>.
      </P>

      <H2 id="launch">Launching & projects</H2>
      <CodeBlock
        label="terminal"
        code={`meith                 # launch the app
meith ./my-project    # launch and open a project path
meith new my-app      # create and open a new project`}
      />

      <H2 id="tools">Tools & generic calls</H2>
      <P>
        Every runtime capability is a tool. List them, or invoke any tool by its exact
        name with <Code>meith call</Code>:
      </P>
      <CodeBlock
        label="terminal"
        code={`meith tools                  # list every tool the runtime exposes
meith call app_health        # invoke any registered tool by name
meith call <tool> --help     # inspect a tool's parameters`}
      />

      <H2 id="common">Common commands</H2>
      <P>
        Friendly commands map to the registered desktop tools. The full list is available
        with <Code>meith --help</Code>; common groups include:
      </P>
      <UL>
        <li>
          <Code>meith tabs</Code> — list browser and workspace tabs.
        </li>
        <li>
          <Code>meith open &lt;url&gt;</Code> — open a new browser tab at a URL.
        </li>
        <li>
          <Code>meith active-tab</Code> — show the active browser tab.
        </li>
        <li>
          <Code>meith browser-state &lt;tabId&gt;</Code> — inspect interactable browser
          elements for automation.
        </li>
        <li>
          <Code>meith click &lt;tabId&gt; &lt;elementId&gt;</Code>,{" "}
          <Code>meith type &lt;tabId&gt; &lt;elementId&gt; &lt;text&gt;</Code>,{" "}
          <Code>meith keys &lt;tabId&gt; &lt;keys&gt;</Code> — automate a tab.
        </li>
        <li>
          <Code>meith spaces</Code>, <Code>meith create-space &lt;name&gt;</Code>, and{" "}
          <Code>meith open-workspace-tab &lt;title&gt; &lt;cwd&gt;</Code> — manage spaces
          and workspace tabs.
        </li>
        <li>
          <Code>meith projects</Code>, <Code>meith open-project &lt;cwd&gt;</Code>,
          <Code>meith templates</Code>, and{" "}
          <Code>meith create-project &lt;template&gt;</Code> — manage projects and
          templates.
        </li>
        <li>
          <Code>meith files &lt;cwd&gt;</Code>,{" "}
          <Code>meith read &lt;cwd&gt; &lt;path&gt;</Code>,{" "}
          <Code>meith search &lt;cwd&gt; &lt;query&gt;</Code>, and{" "}
          <Code>meith diagnostics &lt;cwd&gt; [path]</Code> — inspect workspace files.
        </li>
        <li>
          <Code>meith diff &lt;cwd&gt;</Code> — summarize the git working tree.
        </li>
        <li>
          <Code>meith app list</Code> — inspect running app instances.
        </li>
        <li>
          <Code>meith health</Code> — print runtime service health.
        </li>
        <li>
          <Code>meith dev-servers</Code> — list managed dev servers and their port.
        </li>
        <li>
          <Code>meith start-dev &lt;cwd&gt; &lt;command&gt;</Code> — start a dev server.
        </li>
        <li>
          <Code>meith devlogs</Code> — stream a dev server&apos;s logs.
        </li>
        <li>
          <Code>meith processes</Code> — list managed child processes.
        </li>
        <li>
          <Code>meith settings</Code>, <Code>meith storage</Code>, and{" "}
          <Code>meith plugins</Code> — inspect settings, durable storage, and installed
          plugins.
        </li>
      </UL>
      <Callout>
        Run <Code>meith --help</Code> for the full command list, or{" "}
        <Code>meith &lt;command&gt; --help</Code> for command-specific details. When the
        runtime is reachable, help is enriched with each tool&apos;s live parameter
        schema.
      </Callout>

      <H2 id="options">Useful options</H2>
      <UL>
        <li>
          <Code>--json</Code> — print the raw <Code>ToolResult</Code> envelope.
        </li>
        <li>
          <Code>--instance &lt;id&gt;</Code> — target a specific instance by pid or label.
        </li>
        <li>
          <Code>--socket &lt;path&gt;</Code> — override the runtime socket path.
        </li>
        <li>
          <Code>--timeout &lt;ms&gt;</Code> — per-call timeout override.
        </li>
        <li>
          <Code>--arg-json &lt;json&gt;</Code> / <Code>--stdin</Code> — pass complex
          params as JSON.
        </li>
      </UL>

      <DocsPager pathname="/docs/cli" />
    </>
  );
}
