import { DocsPager } from "@/components/docs/docs-pager";
import {
  Callout,
  Divider,
  DocsHeader,
  H2,
  InlineCode,
  Lead,
  Li,
  P,
  Ul,
} from "@/components/docs/prose";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "Workspaces and projects, the browser runtime, the React renderer, and the CLI — and how they cooperate around the registry.",
};

export default function ArchitecturePage() {
  return (
    <article>
      <DocsHeader
        eyebrow="Developers"
        title="Architecture"
        description="A closer look at workspaces, the browser runtime, the renderer, and the CLI."
      />

      <Lead>
        A space is the visible workspace in the left rail. A project is a folder on disk.
        The renderer never mutates services directly — it calls tools, then re-renders
        from pushed app state.
      </Lead>

      <H2 id="workspaces">Workspaces and projects</H2>
      <P>
        Opening a folder with <InlineCode>project_open</InlineCode> detects package
        metadata, creates or reuses a dedicated space, records a project, and opens an
        editor tab rooted at the folder. <InlineCode>ProjectService</InlineCode> detects:
      </P>
      <Ul>
        <Li>project name,</Li>
        <Li>
          package manager (<InlineCode>pnpm</InlineCode>, <InlineCode>npm</InlineCode>,{" "}
          <InlineCode>yarn</InlineCode>, <InlineCode>bun</InlineCode>, or{" "}
          <InlineCode>unknown</InlineCode>),
        </Li>
        <Li>
          framework hints such as Next.js, Vite, React, Vue, Svelte, Astro, Remix, or
          Node,
        </Li>
        <Li>package scripts.</Li>
      </Ul>
      <P>
        Run commands live on the project record. The top bar&apos;s Run button calls{" "}
        <InlineCode>project_run</InlineCode>, which uses the configured command or falls
        back to a detected <InlineCode>dev</InlineCode>/<InlineCode>start</InlineCode>
        -style script. Dev servers are associated by cwd, their output is captured, and
        detected ports can be opened in browser tabs.
      </P>
      <P>
        Generated projects are copied from <InlineCode>templates/</InlineCode> into{" "}
        <InlineCode>~/Documents/meith</InlineCode> by default.{" "}
        <InlineCode>project_prewarm</InlineCode> can keep generated app copies ready so
        creating a new workspace is fast.
      </P>

      <H2 id="browser-runtime">Browser runtime</H2>
      <P>
        Browser tab metadata is persisted in app state. Live browser views are supplied by
        a BrowserViewHost:
      </P>
      <Ul>
        <Li>
          Electron uses <InlineCode>ElectronBrowserViewHost</InlineCode> backed by native{" "}
          <InlineCode>WebContentsView</InlineCode>s.
        </Li>
        <Li>
          Headless tests and harness runs use{" "}
          <InlineCode>HeadlessBrowserViewHost</InlineCode>.
        </Li>
      </Ul>
      <P>
        The renderer measures the actual content area and reports it over{" "}
        <InlineCode>meith:browser:viewport</InlineCode>; the main process sizes the native
        view to that region. When settings, overlays, or split-drag drop zones need DOM
        interaction above the native view, the renderer temporarily collapses the view.
      </P>
      <Callout title="Ownership">
        Automation callers (<InlineCode>agent</InlineCode> and{" "}
        <InlineCode>plugin</InlineCode>) must claim a tab with{" "}
        <InlineCode>browser_use_start</InlineCode> before mutating it. Interactive callers
        (<InlineCode>renderer</InlineCode>, <InlineCode>cli</InlineCode>) can control
        unclaimed tabs directly. Ownership conflicts return{" "}
        <InlineCode>PERMISSION_DENIED</InlineCode>.
      </Callout>

      <H2 id="renderer">Renderer</H2>
      <P>
        The renderer is a React and Vite workbench in{" "}
        <InlineCode>packages/desktop/src/renderer/src</InlineCode>. It uses the preload
        bridge exposed as <InlineCode>window.meith</InlineCode>; in browser-only preview
        mode it falls back to an in-memory mock bridge. Major surfaces include:
      </P>
      <Ul>
        <Li>
          <InlineCode>SpacesRail</InlineCode> for switching, creating, opening, closing,
          and inspecting spaces.
        </Li>
        <Li>
          <InlineCode>TabStrip</InlineCode> and <InlineCode>PaneToolbar</InlineCode> for
          tab management.
        </Li>
        <Li>
          <InlineCode>BrowserArea</InlineCode> for the embedded browser controls and
          native view target.
        </Li>
        <Li>
          <InlineCode>EditorView</InlineCode> for Monaco-backed file editing through{" "}
          <InlineCode>workspace_*</InlineCode> tools, and{" "}
          <InlineCode>TerminalView</InlineCode> for PTY sessions.
        </Li>
        <Li>
          <InlineCode>AgentView</InlineCode> for session list, transcript, composer, stop
          button, and permission cards.
        </Li>
        <Li>
          <InlineCode>DiffView</InlineCode> for a working-tree diff tab with a folder
          tree, cached summary counts, and lazy patch loading for the selected file.
        </Li>
        <Li>
          <InlineCode>SettingsView</InlineCode>, <InlineCode>DebugPanel</InlineCode>, and{" "}
          <InlineCode>StatusBar</InlineCode> for preferences, diagnostics, and connection
          state.
        </Li>
      </Ul>
      <P>
        High-frequency app-state and dev-server updates are scheduled with React
        transitions so process logs, status updates, and large state pushes do not block
        typing, tab dragging, or browser interaction.
      </P>

      <H2 id="cli">CLI</H2>
      <P>
        The CLI resolves a target runtime from <InlineCode>--socket</InlineCode>,{" "}
        <InlineCode>--instance</InlineCode>, live instance records, or{" "}
        <InlineCode>~/.meith/config.json</InlineCode>. It sends NDJSON frames to the
        runtime socket. Common surfaces:
      </P>
      <Ul>
        <Li>
          <InlineCode>meith [path]</InlineCode> launches the app and optionally opens a
          project path.
        </Li>
        <Li>
          <InlineCode>meith new [name]</InlineCode> creates and opens a generated project.
        </Li>
        <Li>
          mapped commands such as <InlineCode>open</InlineCode>,{" "}
          <InlineCode>tabs</InlineCode>, <InlineCode>navigate</InlineCode>,{" "}
          <InlineCode>screenshot</InlineCode>, <InlineCode>processes</InlineCode>,{" "}
          <InlineCode>dev-servers</InlineCode>, and <InlineCode>start-dev</InlineCode>{" "}
          call specific tools.
        </Li>
        <Li>
          The mapped command surface also covers spaces/workspace tabs,
          projects/templates, workspace files, git diff, browser automation, terminals,
          settings, storage, plugins, and runtime diagnostics.
        </Li>
        <Li>
          <InlineCode>meith call &lt;toolName&gt;</InlineCode> can invoke any registered
          tool, and <InlineCode>meith tools</InlineCode> lists them.
        </Li>
        <Li>
          <InlineCode>
            meith app &lt;list|logs|health|bug-report|kill|screenshot&gt;
          </InlineCode>{" "}
          inspects or controls runtime instances.
        </Li>
      </Ul>

      <Divider />
      <DocsPager />
    </article>
  );
}
