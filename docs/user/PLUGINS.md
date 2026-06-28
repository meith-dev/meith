---
title: Plugins
description: Install web-app plugins and approve exactly which APIs they can use.
section: Using meith
sectionOrder: 1
order: 70
slug: plugins
---

# Plugins

## What a plugin can and cannot do

A plugin is just a web app. It does not load code into the main process, does not
get Node access, and does not register its own tools into the host. Instead,
meith may expose a `window.meithPlugin` bridge in the plugin's tab, containing
only the API namespaces you approved, with every privileged action routed back
through the shared tool registry.

## Installing & approving

1. Install a plugin from a local folder, a packaged archive, or a dev URL.
2. meith reads the plugin's manifest and stores its requested grants.
3. The plugin starts **disabled**, with no approved grants.
4. You review the requested API namespaces and capabilities and approve a
   subset.
5. Once its requested APIs are approved, the plugin can be enabled.
6. Opening it creates a plugin-mode browser tab.

> **Approval can only narrow**
>
> Approving grants always intersects your choices with what the manifest
> requested. Approval can never exceed what the plugin asked for. Identity is
> resolved from the tab itself, so a plugin cannot forge another plugin's id or
> grant itself extra permissions.

## API namespaces

The bridge can expose these namespaces, each only when approved:

- `identity`: always present; the approved id, name, version, APIs, and
  capabilities.
- `tools`: list and call registry tools, still gated by approved capabilities.
- `storage`: read browser and workspace tab listings.
- `cdp`: send Chrome DevTools Protocol commands to a tab. This requires a
  browser-control capability.
- `ai`: stream text from an ephemeral agent session, without bypassing agent or
  tool permissions.

## Managing plugins

Plugin management is itself exposed through normal tools, surfaced in the
Settings Plugins panel and callable from the CLI with commands like
`meith plugins`, `meith install-plugin`, `meith approve-plugin`,
`meith enable-plugin`, and `meith open-plugin`. The underlying tools are
`list_plugins`, `install_plugin`, `approve_plugin_grants`, `set_plugin_enabled`,
`uninstall_plugin`, and `open_plugin_tab`.

## Building your own

Building a plugin is building a web app with a `plugin.json` manifest. The full
reference, including manifests, sources, grants, every bridge API, and the
security model, is in the developer docs: [Plugin API](/docs/developers/plugin-api).
