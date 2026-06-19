import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  InstalledPlugin,
  PluginApiName,
  ToolCapability,
  ToolResult,
} from "@meith/shared";
import { Check, ExternalLink, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Plugins manager panel. Lets the user review the permissions a plugin
 * REQUESTED, choose which to APPROVE, enable/disable, open the plugin, and
 * uninstall it. Rendered inside the Settings view's "Plugins" tab.
 *
 * The renderer never enforces anything — every mutation flows through plugin
 * tools (`approve_plugin_grants`, `set_plugin_enabled`, ...) whose results the
 * main process authoritatively decides. This panel only mirrors state and
 * makes the split between "requested" and "approved" grants visible, which is
 * the whole point of the review step.
 */

/** Human-readable copy for each capability so the prompt is meaningful. */
const CAPABILITY_COPY: Record<ToolCapability, string> = {
  "read-only": "Read app state, tabs, and files",
  "writes-files": "Create and modify files in your projects",
  "controls-browser": "Open, focus, and navigate browser tabs",
  "starts-process": "Start and stop terminals and dev servers",
  "accesses-network": "Make outbound network requests",
  destructive: "Perform destructive actions (close/delete/uninstall)",
};

const API_COPY: Record<PluginApiName, string> = {
  tools: "Call tools (gated by the capabilities below)",
  storage: "Read your open browser and workspace tabs",
  cdp: "Send Chrome DevTools Protocol commands to tabs",
  ai: "Stream completions through the app's AI gateway",
};

type Run = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

export function PluginsPanel({
  plugins,
  run,
  isMock,
}: {
  plugins: InstalledPlugin[];
  run: Run;
  isMock: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => plugins.find((p) => p.id === selectedId) ?? plugins[0] ?? null,
    [plugins, selectedId],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Review and approve the permissions each plugin requests. A plugin only receives
        the scopes you approve, and can only run once enabled.
      </p>

      <InstallPluginForm run={run} disabled={isMock} />

      {plugins.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No plugins installed yet.
        </p>
      ) : (
        <div className="grid min-h-0 grid-cols-[200px_1fr] gap-4">
          <ScrollArea className="h-80 rounded-lg border">
            <ul className="flex flex-col gap-0.5 p-1">
              {plugins.map((plugin) => {
                const active = selected?.id === plugin.id;
                return (
                  <li key={plugin.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(plugin.id)}
                      className={`flex w-full flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        active ? "bg-muted" : "hover:bg-muted/60"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate font-medium">{plugin.name}</span>
                        <Badge variant={plugin.enabled ? "default" : "secondary"}>
                          {plugin.enabled ? "On" : "Off"}
                        </Badge>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {plugin.id}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>

          {selected ? (
            <PluginDetail key={selected.id} plugin={selected} run={run} />
          ) : (
            <div className="text-sm text-muted-foreground">Select a plugin.</div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isMock
          ? "Preview mode: changes are in-memory only."
          : "Plugins run in a sandboxed tab with only the APIs you approve."}
      </p>
    </div>
  );
}

type InstallKind = "directory" | "archive" | "devUrl";

function InstallPluginForm({ run, disabled }: { run: Run; disabled: boolean }) {
  const [kind, setKind] = useState<InstallKind>("archive");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const install = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    const result = await run("install_plugin", { [kind]: trimmed });
    setBusy(false);
    if (result.ok) {
      setValue("");
      toast.success("Plugin installed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <div className="flex rounded-md border p-0.5">
        {(["archive", "directory", "devUrl"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={kind === option ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => setKind(option)}
            disabled={disabled || busy}
          >
            {optionLabel(option)}
          </Button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder={placeholder(kind)}
        className="h-8 min-w-60 flex-1"
        disabled={disabled || busy}
      />
      <Button size="sm" onClick={install} disabled={disabled || busy || !value.trim()}>
        <Plus data-icon="inline-start" />
        Install
      </Button>
    </div>
  );
}

function PluginDetail({ plugin, run }: { plugin: InstalledPlugin; run: Run }) {
  // Local draft of the approval selection, seeded from currently-approved grants.
  const [caps, setCaps] = useState<Set<ToolCapability>>(
    () => new Set(plugin.approvedGrants.capabilities),
  );
  const [apis, setApis] = useState<Set<PluginApiName>>(
    () => new Set(plugin.approvedGrants.apis),
  );
  const [busy, setBusy] = useState(false);

  const requestedApis = plugin.requestedGrants.apis;
  const requestedCaps = plugin.requestedGrants.capabilities;

  // Enabling is blocked until every requested API scope is approved — mirror
  // the host's rule so the button state is honest.
  const allApisApproved = requestedApis.every((a) => apis.has(a));
  const dirty =
    !setEquals(caps, new Set(plugin.approvedGrants.capabilities)) ||
    !setEquals(apis, new Set(plugin.approvedGrants.apis));

  const saveGrants = async () => {
    setBusy(true);
    const result = await run("approve_plugin_grants", {
      pluginId: plugin.id,
      capabilities: [...caps],
      apis: [...apis],
    });
    setBusy(false);
    if (result.ok) toast.success("Permissions updated");
  };

  const toggleEnabled = async () => {
    setBusy(true);
    const result = await run("set_plugin_enabled", {
      pluginId: plugin.id,
      enabled: !plugin.enabled,
    });
    setBusy(false);
    if (result.ok) toast.success(plugin.enabled ? "Plugin disabled" : "Plugin enabled");
  };

  const openPlugin = async () => {
    setBusy(true);
    const result = await run("open_plugin_tab", { pluginId: plugin.id });
    setBusy(false);
    if (result.ok) toast.success(`Opened ${plugin.name}`);
  };

  const uninstall = async () => {
    if (
      !window.confirm(`Uninstall "${plugin.name}"? Open plugin tabs will stop working.`)
    ) {
      return;
    }
    setBusy(true);
    const result = await run("uninstall_plugin", { pluginId: plugin.id });
    setBusy(false);
    if (result.ok) toast.success(`Uninstalled ${plugin.name}`);
  };

  return (
    <ScrollArea className="h-80 pr-3">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{plugin.name}</h3>
            <span className="text-xs text-muted-foreground">v{plugin.version}</span>
          </div>
          {plugin.manifest.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {plugin.manifest.description}
            </p>
          )}
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={sourceLabel(plugin)}
          >
            {sourceLabel(plugin)}
          </p>
        </div>

        {!allApisApproved && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              This plugin can&apos;t be enabled until you approve all of its requested API
              scopes.
            </span>
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            API access
          </h4>
          {requestedApis.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API access requested.</p>
          ) : (
            requestedApis.map((api) => (
              <PermissionRow
                key={api}
                label={api}
                description={API_COPY[api]}
                checked={apis.has(api)}
                onToggle={() => setApis((prev) => toggle(prev, api as PluginApiName))}
              />
            ))
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Tool capabilities
          </h4>
          {requestedCaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tool capabilities requested.
            </p>
          ) : (
            requestedCaps.map((cap) => (
              <PermissionRow
                key={cap}
                label={cap}
                description={CAPABILITY_COPY[cap]}
                checked={caps.has(cap)}
                onToggle={() => setCaps((prev) => toggle(prev, cap as ToolCapability))}
              />
            ))
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={saveGrants} disabled={busy || !dirty}>
            <Check data-icon="inline-start" />
            Save permissions
          </Button>
          <Button
            size="sm"
            variant={plugin.enabled ? "outline" : "secondary"}
            onClick={toggleEnabled}
            disabled={busy || (!plugin.enabled && !allApisApproved)}
          >
            {plugin.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={openPlugin}
            disabled={busy || !plugin.enabled}
          >
            <ExternalLink data-icon="inline-start" />
            Open
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="destructive" onClick={uninstall} disabled={busy}>
            <Trash2 data-icon="inline-start" />
            Uninstall
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

function PermissionRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function optionLabel(kind: InstallKind): string {
  if (kind === "devUrl") return "Dev URL";
  return kind === "archive" ? "Archive" : "Folder";
}

function placeholder(kind: InstallKind): string {
  if (kind === "devUrl") return "http://localhost:5173/";
  if (kind === "archive") return "/path/to/plugin.tgz";
  return "/path/to/plugin-folder";
}

function sourceLabel(plugin: InstalledPlugin): string {
  if (plugin.source.kind === "dev-url") return `Dev URL: ${plugin.source.url}`;
  if (plugin.source.kind === "package") return `Package: ${plugin.source.path}`;
  return `Local: ${plugin.source.path}`;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
