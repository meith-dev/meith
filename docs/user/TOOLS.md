---
title: Tools & permissions
description: How meith's shared tool registry keeps agents and plugins in check.
section: Using meith
sectionOrder: 1
order: 60
slug: tools
---

# Tools & permissions

## One shared tool registry

The visual interface, the terminal command, plugins, and agents all act through
a single tool registry that lives in the desktop main process. Tools declare
their capabilities upfront: reading state, writing files, controlling the
browser, starting processes, making network requests, or performing destructive
actions.

## Tools available out of the box

A default meith desktop build registers these tool groups before any plugin is
installed. Agents receive the same live catalog in their system prompt,
generated from `registry.describe()`, so the names below are the built-in surface
they can request immediately.

| Group | What it covers | Built-in tools |
| --- | --- | --- |
| App diagnostics | Inspect app state, logs, health, instances, screenshots, debug mode, and bug reports. | `app_get_state`, `app_get_logs`, `app_list_instances`, `app_health`, `app_screenshot`, `app_set_debug_mode`, `app_export_bug_report` |
| Browser control | Open, focus, navigate, inspect, automate, screenshot, and debug browser tabs. | `get_tabs`, `get_active_tab`, `open_browser_tab`, `navigate`, `go_back`, `go_forward`, `refresh`, `focus_browser_tab`, `close_browser_tab`, `browser_use_start`, `browser_use_end`, `get_browser_state`, `click_element`, `type_text`, `scroll_page`, `send_keys`, `cdp_command`, `get_console_logs`, `get_network_logs`, `take_screenshot` |
| Spaces & workspace tabs | Manage spaces plus editor, terminal, agent, and preview tabs inside them. | `list_spaces`, `create_space`, `update_space`, `switch_space`, `close_space`, `open_workspace_tab`, `set_workspace_tab_file`, `set_workspace_tab_terminal`, `focus_workspace_tab`, `close_workspace_tab` |
| Projects | Detect, open, generate, prewarm, allocate, configure, run, and stop projects. | `project_list`, `project_detect`, `project_open`, `project_start_dev_server`, `project_stop_dev_server`, `project_run`, `project_set_run_config`, `project_list_templates`, `project_create`, `project_create_plugin`, `project_prewarm`, `project_prewarm_status`, `project_allocate` |
| Files & diagnostics | List, read, search, edit, undo, and inspect TypeScript or JavaScript diagnostics. | `workspace_list_files`, `workspace_read_file`, `workspace_search`, `workspace_write_file`, `workspace_apply_patch`, `workspace_undo`, `get_diagnostics` |
| Git | Inspect a project's working-tree changes as cached summaries, per-file counts, and lazy-loaded patches. | `git_diff` |
| Processes & terminals | Create terminals, manage dev servers, inspect process trees, and read or stream logs. | `create_terminal`, `list_terminals`, `write_terminal`, `resize_terminal`, `kill_terminal`, `close_terminal`, `get_terminal_snapshot`, `start_dev_server`, `list_dev_servers`, `stop_dev_server`, `get_process_tree`, `get_process_logs`, `attach_process_logs` |
| Storage | Inspect durable storage collections and export persisted state for backup or debugging. | `storage_list_collections`, `storage_read_collection`, `storage_export_state` |
| Plugins | Install, grant, enable, open, list, and uninstall controlled plugin tabs. | `list_plugins`, `install_plugin`, `approve_plugin_grants`, `set_plugin_enabled`, `open_plugin_tab`, `uninstall_plugin` |
| Settings | Read and patch global app settings such as auto-run and the default package manager. | `get_app_settings`, `set_app_settings` |

> **Plugin tools do not expand the host catalog**
>
> Plugins run as web apps in controlled browser tabs. They can request access to
> approved host tools through `window.meithPlugin`, but they do not add arbitrary
> new tools to the main-process registry.

## Who is trusted, and who is not

The renderer is fully trusted as part of the core app. Agents and plugins face
strict limits:

- read-only actions execute without interruption,
- file writes, browser control, process starts, and destructive actions require
  explicit permission or an approved grant,
- the host resolves plugin identity directly from the plugin tab itself,
  ignoring whatever data the plugin sends,
- plugin tabs only access the `window.meithPlugin` APIs you specifically
  approve,
- agents or plugins without a valid active session are denied privileged tools
  outright, and revoking a session immediately ends any grants it held.

Additional safeguards run below the permission layer:

- Browser tabs (including plugin tabs) cannot acquire OS-level permissions such
  as camera, microphone, geolocation, or notifications — all such requests are
  denied automatically.
- Browser tabs cannot open new windows or popups through `window.open()` or
  `target=_blank` links. Opening additional tabs must go through `open_browser_tab`.
- The file listing and file search tools skip symbolic links, so a symlink
  inside a project that points outside the project folder cannot be used to
  read files that would otherwise be out of reach.

## Permission prompts

When an agent or plugin requests a privileged action, meith pauses and asks. You
can **Allow** or **Deny**. Agent prompts can also remember the decision for the
same tool for the rest of that session.

> **Audited by default**
>
> Every call through the registry is validated against the tool's declared
> capabilities and audited, so nothing slips through unchecked.

## For developers

The full wire protocol, result envelopes, capabilities, timeouts, and caller
policies are documented in the developer reference:
[Tool Protocol](/docs/developers/tool-protocol) and
[Adding Tools](/docs/developers/adding-tools).
