import { DocsPager } from "@/components/docs/docs-pager";
import { Callout, Code, DocHeader, H2, P, Table, UL } from "@/components/docs/prose";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools & permissions",
  description: "How meith's shared tool registry keeps agents and plugins in check.",
};

const toolGroups = [
  {
    name: "App diagnostics",
    description:
      "Inspect app state, logs, health, instances, screenshots, debug mode, and bug reports.",
    tools: [
      "app_get_state",
      "app_get_logs",
      "app_list_instances",
      "app_health",
      "app_screenshot",
      "app_set_debug_mode",
      "app_export_bug_report",
    ],
  },
  {
    name: "Browser control",
    description:
      "Open, focus, navigate, inspect, automate, screenshot, and debug browser tabs.",
    tools: [
      "get_tabs",
      "get_active_tab",
      "open_browser_tab",
      "navigate",
      "go_back",
      "go_forward",
      "refresh",
      "focus_browser_tab",
      "close_browser_tab",
      "browser_use_start",
      "browser_use_end",
      "get_browser_state",
      "click_element",
      "type_text",
      "scroll_page",
      "send_keys",
      "cdp_command",
      "get_console_logs",
      "get_network_logs",
      "take_screenshot",
    ],
  },
  {
    name: "Spaces & workspace tabs",
    description:
      "Manage spaces plus editor, terminal, agent, and preview tabs inside them.",
    tools: [
      "list_spaces",
      "create_space",
      "update_space",
      "switch_space",
      "close_space",
      "open_workspace_tab",
      "set_workspace_tab_file",
      "set_workspace_tab_terminal",
      "focus_workspace_tab",
      "close_workspace_tab",
    ],
  },
  {
    name: "Projects",
    description:
      "Detect, open, generate, prewarm, allocate, configure, run, and stop projects.",
    tools: [
      "project_list",
      "project_detect",
      "project_open",
      "project_start_dev_server",
      "project_stop_dev_server",
      "project_run",
      "project_set_run_config",
      "project_list_templates",
      "project_create",
      "project_create_plugin",
      "project_prewarm",
      "project_prewarm_status",
      "project_allocate",
    ],
  },
  {
    name: "Files & diagnostics",
    description:
      "List, read, search, edit, undo, and inspect TypeScript or JavaScript diagnostics.",
    tools: [
      "workspace_list_files",
      "workspace_read_file",
      "workspace_search",
      "workspace_write_file",
      "workspace_apply_patch",
      "workspace_undo",
      "get_diagnostics",
    ],
  },
  {
    name: "Processes & terminals",
    description:
      "Create terminals, manage dev servers, inspect process trees, and read or stream logs.",
    tools: [
      "create_terminal",
      "list_terminals",
      "write_terminal",
      "resize_terminal",
      "kill_terminal",
      "close_terminal",
      "get_terminal_snapshot",
      "start_dev_server",
      "list_dev_servers",
      "stop_dev_server",
      "get_process_tree",
      "get_process_logs",
      "attach_process_logs",
    ],
  },
  {
    name: "Storage",
    description:
      "Inspect durable storage collections and export persisted state for backup or debugging.",
    tools: [
      "storage_list_collections",
      "storage_read_collection",
      "storage_export_state",
    ],
  },
  {
    name: "Plugins",
    description:
      "Install, grant, enable, open, list, and uninstall controlled plugin tabs.",
    tools: [
      "list_plugins",
      "install_plugin",
      "approve_plugin_grants",
      "set_plugin_enabled",
      "open_plugin_tab",
      "uninstall_plugin",
    ],
  },
  {
    name: "Settings",
    description:
      "Read and patch global app settings such as auto-run and the default package manager.",
    tools: ["get_app_settings", "set_app_settings"],
  },
];

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
        The visual interface, the terminal command, plugins, and agents all act through a
        single tool registry that lives in the desktop main process. Tools declare their
        capabilities upfront — things like reading state, writing files, controlling the
        browser, starting processes, making network requests, or performing destructive
        actions.
      </P>

      <H2 id="out-of-the-box">Tools available out of the box</H2>
      <P>
        A default meith desktop build registers these tool groups before any plugin is
        installed. Agents receive the same live catalog in their system prompt, generated
        from <Code>registry.describe()</Code>, so the names below are the built-in surface
        they can request immediately.
      </P>
      <Table
        head={["Group", "What it covers", "Built-in tools"]}
        rows={toolGroups.map((group) => [
          <strong key={`${group.name}-name`} className="text-foreground">
            {group.name}
          </strong>,
          group.description,
          <span key={`${group.name}-tools`} className="flex flex-wrap gap-1.5">
            {group.tools.map((tool) => (
              <Code key={tool}>{tool}</Code>
            ))}
          </span>,
        ])}
      />
      <Callout title="Plugin tools do not expand the host catalog">
        Plugins run as web apps in controlled browser tabs. They can request access to
        approved host tools through <Code>window.meithPlugin</Code>, but they do not add
        arbitrary new tools to the main-process registry.
      </Callout>

      <H2 id="trust">Who is trusted, and who isn't</H2>
      <P>
        The renderer is fully trusted as part of the core app. Agents and plugins face
        strict limits:
      </P>
      <UL>
        <li>read-only actions execute without interruption,</li>
        <li>
          file writes, browser control, process starts, and destructive actions require
          explicit permission or an approved grant,
        </li>
        <li>
          the host resolves plugin identity directly from the plugin tab itself, ignoring
          whatever data the plugin sends,
        </li>
        <li>
          plugin tabs only access the <Code>window.meithPlugin</Code> APIs you
          specifically approve.
        </li>
      </UL>

      <H2 id="prompts">Permission prompts</H2>
      <P>
        When an agent or plugin requests a privileged action, meith pauses and asks. You
        can <strong>Allow once</strong>, <strong>Always allow</strong> (creating a
        standing grant), or <strong>Deny</strong>. Grants are scoped and can be revisited
        later.
      </P>
      <Callout title="Audited by default">
        Every call through the registry is validated against the tool&apos;s declared
        capabilities and audited — so nothing slips through unchecked.
      </Callout>

      <H2 id="developers">For developers</H2>
      <P>
        The full wire protocol, result envelopes, capabilities, timeouts, and caller
        policies are documented in the developer reference:{" "}
        <a className="text-primary hover:underline" href="/docs/developers/tool-protocol">
          Tool protocol
        </a>{" "}
        and{" "}
        <a className="text-primary hover:underline" href="/docs/developers/adding-tools">
          Adding tools
        </a>
        .
      </P>

      <DocsPager pathname="/docs/tools" />
    </>
  );
}
