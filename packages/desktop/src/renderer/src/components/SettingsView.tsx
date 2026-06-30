import {
  ACP_PRESETS,
  type AcpPreset,
  type AgentConfig,
  type AgentProbeResult,
  type AppSettings,
  type GitIdentityProfile,
  type InstalledPlugin,
  type PackageManager,
  type Project,
  type ProjectRunConfig,
  type RunCommand,
  type ToolResult,
  createId,
  isModelConfigOption,
  isReasoningConfigOption,
  newRunCommandId,
} from "@meith/shared";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  GitBranchIcon,
  HardDriveIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import type { MeithBridge } from "../../../bridge";
import { cn } from "../lib/utils";
import { PluginsPanel } from "./PluginsPanel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export type SettingsTab =
  | "general"
  | "run"
  | "git"
  | "agent"
  | "plugins"
  | "storage"
  | "about";

type Run = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Full-height tab matching the workbench TabStrip / diagnostics tabs: a flat,
 * content-width cell with a right divider, a `bg-background` fill when active,
 * and a top accent strip rendered via a `before` pseudo-element.
 */
const settingsTabClass = cn(
  "relative h-full flex-none gap-1.5 rounded-none border-0 border-r border-border px-4 text-sm font-normal text-muted-foreground shadow-none transition-colors",
  "hover:bg-accent/40 hover:text-foreground",
  "data-active:bg-background data-active:text-foreground data-active:shadow-none",
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-transparent data-active:before:bg-primary",
);

interface SettingsViewProps {
  /** Tab to focus when the view opens. */
  initialTab?: SettingsTab;
  /** Global app settings (from AppState). */
  settings: AppSettings | null;
  /** The active workspace's project, if any (drives the Run tab). */
  project: Project | null;
  /** Persist a patch to global settings via the `set_app_settings` tool. */
  onSaveSettings: (patch: Partial<AppSettings>) => unknown;
  /** Persist a workspace's run configuration via `project_set_run_config`. */
  onSaveRunConfig: (projectId: string, runConfig: ProjectRunConfig) => unknown;
  /** Bridge for reading/writing the (global) agent config. */
  bridge: MeithBridge;
  isMock: boolean;
  /** Installed plugins (drives the Plugins tab). */
  plugins: InstalledPlugin[];
  /** Run a plugin tool (approve grants, enable/disable, uninstall, ...). */
  run: Run;
  /** Close the settings view and return to the workbench. */
  onClose: () => void;
}

const PACKAGE_MANAGERS: PackageManager[] = ["unknown", "npm", "pnpm", "yarn", "bun"];

/**
 * The single global settings surface. Consolidates app-wide preferences, the
 * active workspace's run configuration, and the agent runtime config into one
 * tabbed dialog so there is one place to configure meith.
 */
export function SettingsView({
  initialTab = "general",
  settings,
  project,
  onSaveSettings,
  onSaveRunConfig,
  bridge,
  isMock,
  plugins,
  run,
  onClose,
}: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // Focus the requested tab whenever the view (re)mounts with a new target.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Close on Escape, matching the previous dialog behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section aria-label="Settings" className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3.5">
        <SettingsIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
          <p className="truncate text-xs text-muted-foreground">
            App preferences, the active workspace&apos;s run commands, and the agent
            runtime.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-7 shrink-0"
                onClick={onClose}
                aria-label="Close settings"
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            }
          />
          <TooltipContent>Close settings (Esc)</TooltipContent>
        </Tooltip>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SettingsTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="flex h-10 w-full shrink-0 items-stretch justify-start gap-0 rounded-none border-b border-border bg-card/40 p-0">
          <TabsTrigger value="general" className={settingsTabClass}>
            General
          </TabsTrigger>
          <TabsTrigger value="run" className={settingsTabClass}>
            Run
          </TabsTrigger>
          <TabsTrigger value="git" className={settingsTabClass}>
            Git
          </TabsTrigger>
          <TabsTrigger value="agent" className={settingsTabClass}>
            Agent
          </TabsTrigger>
          <TabsTrigger value="plugins" className={settingsTabClass}>
            Plugins
          </TabsTrigger>
          <TabsTrigger value="storage" className={settingsTabClass}>
            Storage
          </TabsTrigger>
          <TabsTrigger value="about" className={settingsTabClass}>
            About
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-2xl p-6">
            <TabsContent value="general" className="mt-0">
              <GeneralTab settings={settings} onSave={onSaveSettings} />
            </TabsContent>
            <TabsContent value="run" className="mt-0">
              <RunTab project={project} onSave={onSaveRunConfig} />
            </TabsContent>
            <TabsContent value="git" className="mt-0">
              <GitTab
                settings={settings}
                cwd={project?.cwd ?? null}
                run={run}
                onSave={onSaveSettings}
              />
            </TabsContent>
            <TabsContent value="agent" className="mt-0">
              <AgentTab bridge={bridge} open={tab === "agent"} />
            </TabsContent>
            <TabsContent value="plugins" className="mt-0">
              <PluginsPanel plugins={plugins} run={run} isMock={isMock} />
            </TabsContent>
            <TabsContent value="storage" className="mt-0">
              <StorageTab run={run} open={tab === "storage"} />
            </TabsContent>
            <TabsContent value="about" className="mt-0">
              <AboutTab isMock={isMock} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </section>
  );
}

// --- Git -------------------------------------------------------------------

const GIT_REFRESH_INTERVALS = [
  { label: "1 second", value: 1000 },
  { label: "2.5 seconds", value: 2500 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

interface GitIdentitySuggestion {
  source: "repo" | "global" | "github-cli" | "gitlab-cli";
  label: string;
  name: string;
  email: string;
  username?: string;
  host?: string;
  detail: string;
}

function GitTab({
  settings,
  cwd,
  run,
  onSave,
}: {
  settings: AppSettings | null;
  cwd: string | null;
  run: Run;
  onSave: (patch: Partial<AppSettings>) => unknown;
}) {
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GitIdentitySuggestion[]>([]);

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  const git = settings.git;
  const patchGit = (next: Partial<AppSettings["git"]>) => {
    void onSave({ git: { ...git, ...next } });
  };
  const profiles = git.identityProfiles;
  const activeProfile = profiles.find(
    (profile) => profile.id === git.activeIdentityProfileId,
  );
  const addProfile = () => {
    const profile: GitIdentityProfile = {
      id: createId("gitacct"),
      label: "New account",
      name: "",
      email: "",
    };
    patchGit({
      identityProfiles: [...profiles, profile],
      activeIdentityProfileId: profile.id,
    });
  };
  const updateProfile = (id: string, next: Partial<GitIdentityProfile>) => {
    patchGit({
      identityProfiles: profiles.map((profile) =>
        profile.id === id ? { ...profile, ...next } : profile,
      ),
    });
  };
  const removeProfile = (id: string) => {
    patchGit({
      identityProfiles: profiles.filter((profile) => profile.id !== id),
      activeIdentityProfileId:
        git.activeIdentityProfileId === id ? null : git.activeIdentityProfileId,
    });
  };
  const detectAccounts = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const result = await run("git_identity_detect", cwd ? { cwd } : {});
      if (!result.ok) {
        throw new Error(result.error?.message ?? "Failed to detect git accounts");
      }
      const content = result.content as { suggestions?: GitIdentitySuggestion[] };
      setSuggestions(content.suggestions ?? []);
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  };
  const addSuggestion = (suggestion: GitIdentitySuggestion) => {
    const existing = profiles.find(
      (profile) =>
        profile.name.trim().toLowerCase() === suggestion.name.trim().toLowerCase() &&
        profile.email.trim().toLowerCase() === suggestion.email.trim().toLowerCase(),
    );
    if (existing) {
      patchGit({ activeIdentityProfileId: existing.id });
      return;
    }
    const profile: GitIdentityProfile = {
      id: createId("gitacct"),
      label: suggestion.label,
      name: suggestion.name,
      email: suggestion.email,
    };
    patchGit({
      identityProfiles: [...profiles, profile],
      activeIdentityProfileId: profile.id,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-2 flex items-center gap-2">
        <GitBranchIcon className="size-4 text-muted-foreground" aria-hidden />
        <SectionLabel className="mt-0">Git panel</SectionLabel>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md px-1 py-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">Refresh interval</span>
          <span className="text-xs text-muted-foreground">
            How often the visible Git panel refreshes status and patch summaries.
          </span>
        </div>
        <select
          aria-label="Git refresh interval"
          value={git.refreshIntervalMs}
          onChange={(e) => patchGit({ refreshIntervalMs: Number(e.target.value) })}
          className="h-9 shrink-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {GIT_REFRESH_INTERVALS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <ToggleRow
        label="Show untracked files"
        description="Include new, untracked files in the unstaged section."
        checked={git.showUntrackedFiles}
        onChange={(v) => patchGit({ showUntrackedFiles: v })}
      />
      <ToggleRow
        label="Confirm before restore"
        description="Ask before discarding file changes from the Git panel."
        checked={git.confirmBeforeRestore}
        onChange={(v) => patchGit({ confirmBeforeRestore: v })}
      />
      <ToggleRow
        label="Checkpoint before agent runs"
        description="Create a git-backed snapshot before an agent starts changing a workspace."
        checked={git.checkpointBeforeAgentRun}
        onChange={(v) => patchGit({ checkpointBeforeAgentRun: v })}
      />

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRoundIcon className="size-4 text-muted-foreground" aria-hidden />
          <SectionLabel className="mt-0">Commit identity</SectionLabel>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={detecting}
            onClick={detectAccounts}
          >
            {detecting ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <UserRoundIcon data-icon="inline-start" />
            )}
            Detect accounts
          </Button>
          <Button variant="outline" size="sm" onClick={addProfile}>
            <PlusIcon data-icon="inline-start" />
            Add account
          </Button>
        </div>
      </div>

      {detectError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {detectError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Detected accounts
            </span>
            <span className="text-[11px] text-muted-foreground">
              {suggestions.length} found
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <li
                key={`${suggestion.source}:${suggestion.name}:${suggestion.email}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {suggestion.label}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {suggestion.name} &lt;{suggestion.email}&gt;
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {suggestion.detail}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => addSuggestion(suggestion)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-md px-1 py-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">Active account</span>
          <span className="text-xs text-muted-foreground">
            Commits made from Meith use this name and email.
          </span>
        </div>
        <select
          aria-label="Active git commit account"
          value={git.activeIdentityProfileId ?? ""}
          onChange={(e) => patchGit({ activeIdentityProfileId: e.target.value || null })}
          className="h-9 max-w-64 shrink-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Use Git config</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label.trim() || profile.email.trim() || "Untitled account"}
            </option>
          ))}
        </select>
      </div>

      {activeProfile && (
        <p className="px-1 text-xs text-muted-foreground">
          Active commits use {activeProfile.name.trim() || "unnamed user"}
          {activeProfile.email.trim() ? ` <${activeProfile.email.trim()}>` : ""}.
        </p>
      )}

      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
          No saved accounts. Meith will use each repository&apos;s Git config.
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-card/50 p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Account label"
                  value={profile.label}
                  placeholder="Work"
                  className="h-8 w-36 shrink-0"
                  onChange={(e) => updateProfile(profile.id, { label: e.target.value })}
                />
                <Input
                  aria-label="Commit author name"
                  value={profile.name}
                  placeholder="Name"
                  className="h-8 flex-1"
                  onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${profile.label || "account"}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeProfile(profile.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
              <Input
                aria-label="Commit email"
                type="email"
                value={profile.email}
                placeholder="name@example.com"
                className="h-8 font-mono text-xs"
                onChange={(e) => updateProfile(profile.id, { email: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- General ---------------------------------------------------------------

function GeneralTab({
  settings,
  onSave,
}: {
  settings: AppSettings | null;
  onSave: (patch: Partial<AppSettings>) => unknown;
}) {
  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Workspaces</SectionLabel>
      <ToggleRow
        label="Auto-run on open"
        description="Start the workspace's default run command when it becomes active."
        checked={settings.autoRunOnOpen}
        onChange={(v) => void onSave({ autoRunOnOpen: v })}
      />
      <ToggleRow
        label="Confirm before closing"
        description="Ask for confirmation before closing a workspace and its tabs."
        checked={settings.confirmOnClose}
        onChange={(v) => void onSave({ confirmOnClose: v })}
      />
      <ToggleRow
        label="Stop servers on close"
        description="Stop a workspace's running processes when it is closed."
        checked={settings.stopServersOnClose}
        onChange={(v) => void onSave({ stopServersOnClose: v })}
      />

      <SectionLabel className="mt-4">Run</SectionLabel>
      <ToggleRow
        label="Show output on run"
        description="Open the Output panel automatically when a run starts."
        checked={settings.showOutputOnRun}
        onChange={(v) => void onSave({ showOutputOnRun: v })}
      />
      <ToggleRow
        label="Debug mode"
        description="Expose app-target diagnostics and verbose debugging surfaces."
        checked={settings.debugMode}
        onChange={(v) => void onSave({ debugMode: v })}
      />
      <div className="flex items-center justify-between gap-4 rounded-md px-1 py-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">
            Default package manager
          </span>
          <span className="text-xs text-muted-foreground">
            Used when suggesting run commands for new workspaces.
          </span>
        </div>
        <select
          aria-label="Default package manager"
          value={settings.defaultPackageManager}
          onChange={(e) =>
            void onSave({ defaultPackageManager: e.target.value as PackageManager })
          }
          className="h-9 shrink-0 rounded-md border border-input bg-transparent px-3 text-sm capitalize shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {PACKAGE_MANAGERS.map((pm) => (
            <option key={pm} value={pm} className="capitalize">
              {pm === "unknown" ? "Auto-detect" : pm}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// --- Run -------------------------------------------------------------------

function RunTab({
  project,
  onSave,
}: {
  project: Project | null;
  onSave: (projectId: string, runConfig: ProjectRunConfig) => unknown;
}) {
  const [draft, setDraft] = useState<ProjectRunConfig>(
    project?.runConfig ?? { commands: [], defaultCommandId: null, env: {} },
  );
  const [dirty, setDirty] = useState(false);

  // Reseed the editor whenever the active workspace changes.
  useEffect(() => {
    setDraft(project?.runConfig ?? { commands: [], defaultCommandId: null, env: {} });
    setDirty(false);
  }, [project?.id, project?.runConfig]);

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <TerminalIcon className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Open a workspace with a project to configure run commands.
        </p>
      </div>
    );
  }

  const patch = (next: Partial<ProjectRunConfig>) => {
    setDraft((d) => ({ ...d, ...next }));
    setDirty(true);
  };

  const updateCommand = (id: string, next: Partial<RunCommand>) => {
    patch({
      commands: draft.commands.map((c) => (c.id === id ? { ...c, ...next } : c)),
    });
  };

  const addCommand = () => {
    const cmd: RunCommand = {
      id: newRunCommandId(),
      label: "Run",
      command: "",
      isDevServer: true,
    };
    patch({
      commands: [...draft.commands, cmd],
      defaultCommandId: draft.defaultCommandId ?? cmd.id,
    });
  };

  const removeCommand = (id: string) => {
    const commands = draft.commands.filter((c) => c.id !== id);
    patch({
      commands,
      defaultCommandId:
        draft.defaultCommandId === id
          ? (commands[0]?.id ?? null)
          : draft.defaultCommandId,
    });
  };

  const envRows = Object.entries(draft.env);

  const setEnv = (entries: [string, string][]) => {
    patch({ env: Object.fromEntries(entries.filter(([k]) => k.trim())) });
  };

  const save = async () => {
    // Drop empty commands so we never persist a blank run target.
    const cleaned: ProjectRunConfig = {
      ...draft,
      commands: draft.commands.filter((c) => c.command.trim()),
    };
    await onSave(project.id, cleaned);
    setDraft(cleaned);
    setDirty(false);
    toast.success("Run configuration saved");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="mt-0">
          Run commands · <span className="text-foreground">{project.name}</span>
        </SectionLabel>
        <Button variant="outline" size="sm" onClick={addCommand}>
          <PlusIcon data-icon="inline-start" />
          Add command
        </Button>
      </div>

      {draft.commands.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No run commands yet. The detected dev/start script is used until you add one.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {draft.commands.map((cmd) => {
            const isDefault = draft.defaultCommandId === cmd.id;
            return (
              <li
                key={cmd.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-card/50 p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Command label"
                    value={cmd.label}
                    placeholder="Label"
                    className="h-8 w-32 shrink-0"
                    onChange={(e) => updateCommand(cmd.id, { label: e.target.value })}
                  />
                  <Input
                    aria-label="Shell command"
                    value={cmd.command}
                    placeholder="pnpm dev"
                    className="h-8 flex-1 font-mono text-xs"
                    onChange={(e) => updateCommand(cmd.id, { command: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${cmd.label}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCommand(cmd.id)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 pl-0.5">
                  <button
                    type="button"
                    onClick={() => patch({ defaultCommandId: cmd.id })}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span
                      className={cn(
                        "flex size-3.5 items-center justify-center rounded-full border",
                        isDefault ? "border-primary" : "border-border",
                      )}
                    >
                      {isDefault && <span className="size-1.5 rounded-full bg-primary" />}
                    </span>
                    Default
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={cmd.isDevServer}
                      onChange={(e) =>
                        updateCommand(cmd.id, { isDevServer: e.target.checked })
                      }
                      className="size-3.5 accent-primary"
                    />
                    Dev server (watch for a port)
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SectionLabel>Environment variables</SectionLabel>
      <EnvEditor rows={envRows} onChange={setEnv} />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty}
          onClick={() => {
            setDraft(project.runConfig);
            setDirty(false);
          }}
        >
          Reset
        </Button>
        <Button size="sm" disabled={!dirty} onClick={() => void save()}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function EnvEditor({
  rows,
  onChange,
}: {
  rows: [string, string][];
  onChange: (entries: [string, string][]) => void;
}) {
  const display = rows.length > 0 ? rows : [];
  return (
    <div className="flex flex-col gap-2">
      {display.map(([key, value], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: env rows are edited positionally and may share empty/duplicate keys while typing
        <div key={`${key}-${i}`} className="flex items-center gap-2">
          <Input
            aria-label="Variable name"
            value={key}
            placeholder="KEY"
            className="h-8 w-44 font-mono text-xs"
            onChange={(e) => {
              const next = [...display];
              next[i] = [e.target.value, value];
              onChange(next);
            }}
          />
          <span className="text-muted-foreground">=</span>
          <Input
            aria-label="Variable value"
            value={value}
            placeholder="value"
            className="h-8 flex-1 font-mono text-xs"
            onChange={(e) => {
              const next = [...display];
              next[i] = [key, e.target.value];
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove variable"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(display.filter((_, j) => j !== i))}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...display, ["", ""]])}
      >
        <PlusIcon data-icon="inline-start" />
        Add variable
      </Button>
    </div>
  );
}

// --- Agent -----------------------------------------------------------------

/**
 * Inline install/availability status for the configured ACP agent. Shows a
 * spinner while probing, a success line when the agent handshakes, and an
 * error block (with the agent's stderr tail) when it can't be launched.
 */
function AgentInstallStatus({
  label,
  probing,
  probe,
}: {
  label: string;
  probing: boolean;
  probe: AgentProbeResult | null;
}) {
  if (probing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        <span>{`Checking ${label}…`}</span>
      </div>
    );
  }
  if (!probe) return null;
  if (probe.installed) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2Icon className="size-3.5" />
        <span>{`${label} is installed and ready.`}</span>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangleIcon className="size-3.5" />
        <span>{`${label} isn't available`}</span>
      </div>
      {probe.error && (
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed opacity-90">
          {probe.error}
        </pre>
      )}
      <span className="opacity-80">
        Make sure the agent CLI is installed and on your PATH, then reopen settings to
        re-check.
      </span>
    </div>
  );
}

function AgentTab({ bridge, open }: { bridge: MeithBridge; open: boolean }) {
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [probe, setProbe] = useState<AgentProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void bridge.agent.getConfig().then((cfg) => {
      if (!cancelled) setDraft(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bridge]);

  const isAcp = draft?.adapter === "acp";
  const preset = draft?.acpPreset ?? "custom";
  const command = draft?.command ?? "";
  const argsKey = draft?.args.join(" ") ?? "";

  // Probe the configured agent (debounced) whenever the ACP target changes, so
  // we can detect whether it's installed and list its model/reasoning options.
  useEffect(() => {
    if (!open || !isAcp) {
      setProbe(null);
      setProbing(false);
      return;
    }
    let cancelled = false;
    setProbing(true);
    const handle = setTimeout(() => {
      void bridge.agent
        .probe({ acpPreset: preset, command, args: argsKey.split(/\s+/).filter(Boolean) })
        .then((result) => {
          if (!cancelled) setProbe(result);
        })
        .finally(() => {
          if (!cancelled) setProbing(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, bridge, isAcp, preset, command, argsKey]);

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading agent config…</p>;
  }

  const isCustomPreset = preset === "custom";
  const presetLabel = isCustomPreset
    ? command.trim() || "custom agent"
    : ACP_PRESETS[preset].label;
  const modelOption = probe?.options.find((o) => isModelConfigOption(o));
  const reasoningOption = probe?.options.find((o) => isReasoningConfigOption(o));

  const save = async (next: AgentConfig) => {
    setDraft(next);
    await bridge.agent.setConfig(next);
    // Let any live agent view refresh its cached config.
    window.dispatchEvent(new CustomEvent("meith:agent-config-changed"));
  };

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="agent-adapter" className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Adapter</span>
        <select
          id="agent-adapter"
          value={draft.adapter}
          onChange={(e) =>
            void save({ ...draft, adapter: e.target.value as AgentConfig["adapter"] })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="mock">Mock (built-in, no setup)</option>
          <option value="acp">ACP subprocess (external agent)</option>
        </select>
      </label>

      {isAcp && (
        <>
          <label htmlFor="agent-preset" className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Agent</span>
            <select
              id="agent-preset"
              value={preset}
              onChange={(e) =>
                void save({ ...draft, acpPreset: e.target.value as AcpPreset })
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="claude">{ACP_PRESETS.claude.label}</option>
              <option value="codex">{ACP_PRESETS.codex.label}</option>
              <option value="custom">{ACP_PRESETS.custom.label}</option>
            </select>
            <span className="text-xs text-muted-foreground">
              {ACP_PRESETS[preset].description}
            </span>
          </label>

          {!isCustomPreset && (
            <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
              {ACP_PRESETS[preset].command} {ACP_PRESETS[preset].args.join(" ")}
            </p>
          )}

          {isCustomPreset && (
            <>
              <label htmlFor="agent-command" className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Command</span>
                <Input
                  id="agent-command"
                  value={draft.command}
                  placeholder="e.g. my-agent-acp"
                  onChange={(e) => void save({ ...draft, command: e.target.value })}
                />
              </label>
              <label htmlFor="agent-args" className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Arguments (space-separated)
                </span>
                <Input
                  id="agent-args"
                  value={draft.args.join(" ")}
                  placeholder="--acp"
                  onChange={(e) =>
                    void save({
                      ...draft,
                      args: e.target.value.split(/\s+/).filter(Boolean),
                    })
                  }
                />
              </label>
            </>
          )}

          <AgentInstallStatus label={presetLabel} probing={probing} probe={probe} />
        </>
      )}

      {/* Model: a dropdown of the agent's advertised models when available,
          otherwise a free-text fallback (mock adapter / custom agents). */}
      {isAcp && modelOption && modelOption.values.length > 0 ? (
        <label htmlFor="agent-model-select" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Model</span>
          <select
            id="agent-model-select"
            value={draft.model || modelOption.currentValue || ""}
            onChange={(e) => void save({ ...draft, model: e.target.value })}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {modelOption.values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label htmlFor="agent-model" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Model (optional)
          </span>
          <Input
            id="agent-model"
            value={draft.model}
            placeholder="provider/model"
            onChange={(e) => void save({ ...draft, model: e.target.value })}
          />
        </label>
      )}

      {/* Reasoning effort: only shown when the agent advertises one. */}
      {isAcp && reasoningOption && reasoningOption.values.length > 0 && (
        <label htmlFor="agent-reasoning" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {reasoningOption.name || "Reasoning"}
          </span>
          <select
            id="agent-reasoning"
            value={draft.reasoning || reasoningOption.currentValue || ""}
            onChange={(e) => void save({ ...draft, reasoning: e.target.value })}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {reasoningOption.values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="rounded-md border border-border p-3">
        <label htmlFor="agent-auto" className="flex items-start gap-2">
          <input
            id="agent-auto"
            type="checkbox"
            checked={draft.autoAccept}
            onChange={(e) => void save({ ...draft, autoAccept: e.target.checked })}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              Auto-accept tool permissions
            </span>
            <span className="text-xs text-muted-foreground">
              Gated tools (write files, run processes, control the browser) run without
              prompting.
            </span>
          </span>
        </label>
        {draft.autoAccept && (
          <div className="mt-2 flex items-start gap-2 rounded bg-primary/10 p-2 text-xs text-primary">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              The agent can modify files and run commands without asking. Only enable this
              if you trust the agent and the workspace.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Storage ---------------------------------------------------------------

interface StorageCollectionInfo {
  name: string;
  kind: "json" | "jsonl" | "directory";
  path: string;
  description: string;
  exists: boolean;
  sizeBytes: number;
}

interface StorageListContent {
  dataDirectory: string;
  collections: StorageCollectionInfo[];
}

type StorageAction =
  | "export"
  | "clear-logs"
  | "clear-audit"
  | "clear-artifacts"
  | "screenshots"
  | "sessions"
  | "refresh";

function StorageTab({ run, open }: { run: Run; open: boolean }) {
  const [storage, setStorage] = useState<StorageListContent | null>(null);
  const [busy, setBusy] = useState<StorageAction | null>(null);
  const [screenshotDays, setScreenshotDays] = useState(30);
  const [sessionDays, setSessionDays] = useState(30);

  const refresh = useCallback(
    async (action: StorageAction = "refresh") => {
      setBusy(action);
      try {
        const result = await run("storage_list_collections", {});
        if (!result.ok)
          throw new Error(result.error?.message ?? "Failed to load storage");
        setStorage(result.content as StorageListContent);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [run],
  );

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const runStorageAction = async (
    action: StorageAction,
    tool: string,
    args: Record<string, unknown>,
    success: (result: ToolResult) => string,
  ) => {
    setBusy(action);
    try {
      const result = await run(tool, args);
      if (!result.ok) throw new Error(result.error?.message ?? "Storage action failed");
      toast.success(success(result));
      await refresh(action);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  const clearCollection = (name: "logs" | "audit" | "artifacts") => {
    if (!window.confirm(`Clear ${name}? This cannot be undone.`)) return;
    void runStorageAction(
      `clear-${name}` as StorageAction,
      "storage_clear_collection",
      { name, confirm: true },
      (result) => {
        const content = result.content as {
          deletedBytes?: number;
          deletedFiles?: number;
        };
        return `Cleared ${formatBytes(content.deletedBytes ?? 0)} from ${name}`;
      },
    );
  };

  const exportBundle = () => {
    void runStorageAction(
      "export",
      "storage_export_support_bundle",
      { logsLimit: 500 },
      (result) => {
        const content = result.content as { path?: string; bytes?: number };
        return content.path
          ? `Support bundle exported (${formatBytes(content.bytes ?? 0)})`
          : "Support bundle prepared";
      },
    );
  };

  const deleteScreenshots = () => {
    if (
      !window.confirm(
        `Delete screenshot artifacts older than ${screenshotDays} days? This cannot be undone.`,
      )
    ) {
      return;
    }
    void runStorageAction(
      "screenshots",
      "storage_delete_old_screenshots",
      { olderThanDays: screenshotDays, confirm: true },
      (result) => {
        const content = result.content as { deletedFiles?: number };
        return `Deleted ${content.deletedFiles ?? 0} old screenshots`;
      },
    );
  };

  const pruneSessions = () => {
    if (
      !window.confirm(
        `Prune agent sessions idle for ${sessionDays} days? This cannot be undone.`,
      )
    ) {
      return;
    }
    void runStorageAction(
      "sessions",
      "storage_prune_stale_agent_sessions",
      { olderThanDays: sessionDays, confirm: true },
      (result) => {
        const content = result.content as { deletedSessions?: number };
        return `Pruned ${content.deletedSessions ?? 0} stale sessions`;
      },
    );
  };

  const collections = storage?.collections ?? [];
  const totalBytes = collections.reduce(
    (sum, collection) => sum + collection.sizeBytes,
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <HardDriveIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <SectionLabel className="mt-0">Storage usage</SectionLabel>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={exportBundle}>
            <DownloadIcon data-icon="inline-start" />
            Export bundle
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {storage?.dataDirectory ?? "Loading storage directory…"}
          </span>
          <Badge variant="secondary">{formatBytes(totalBytes)}</Badge>
        </div>
        <ul className="divide-y divide-border">
          {collections.map((collection) => (
            <li key={collection.name} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatCollectionName(collection.name)}
                  </span>
                  <Badge variant="outline">{collection.kind}</Badge>
                  {!collection.exists && <Badge variant="secondary">missing</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {collection.description}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatBytes(collection.sizeBytes)}
              </span>
            </li>
          ))}
          {collections.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {busy ? "Loading storage collections…" : "No storage collections found."}
            </li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel className="mt-0">Maintenance</SectionLabel>
        <StorageActionRow
          label="Logs"
          description="Clear append-only application logs."
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => clearCollection("logs")}
            >
              <Trash2Icon data-icon="inline-start" />
              Clear
            </Button>
          }
        />
        <StorageActionRow
          label="Audit"
          description="Clear redacted tool-call audit entries."
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => clearCollection("audit")}
            >
              <Trash2Icon data-icon="inline-start" />
              Clear
            </Button>
          }
        />
        <StorageActionRow
          label="Artifacts"
          description="Clear screenshots, support bundles, and generated artifacts."
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => clearCollection("artifacts")}
            >
              <Trash2Icon data-icon="inline-start" />
              Clear
            </Button>
          }
        />
        <StorageNumberAction
          label="Screenshots"
          description="Delete screenshot PNGs older than the selected age."
          value={screenshotDays}
          onValueChange={setScreenshotDays}
          disabled={busy !== null}
          buttonLabel="Delete old"
          onClick={deleteScreenshots}
        />
        <StorageNumberAction
          label="Agent sessions"
          description="Prune non-running sessions idle longer than the selected age."
          value={sessionDays}
          onValueChange={setSessionDays}
          disabled={busy !== null}
          buttonLabel="Prune"
          onClick={pruneSessions}
        />
      </div>
    </div>
  );
}

function StorageActionRow({
  label,
  description,
  action,
}: {
  label: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-1 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function StorageNumberAction({
  label,
  description,
  value,
  onValueChange,
  disabled,
  buttonLabel,
  onClick,
}: {
  label: string;
  description: string;
  value: number;
  onValueChange: (value: number) => void;
  disabled: boolean;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <StorageActionRow
      label={label}
      description={description}
      action={
        <div className="flex items-center gap-2">
          <Input
            aria-label={`${label} age in days`}
            type="number"
            min={1}
            max={3650}
            value={value}
            disabled={disabled}
            className="h-8 w-20"
            onChange={(e) => onValueChange(Number(e.target.value))}
          />
          <Button variant="outline" size="sm" disabled={disabled} onClick={onClick}>
            <Trash2Icon data-icon="inline-start" />
            {buttonLabel}
          </Button>
        </div>
      }
    />
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatCollectionName(name: string): string {
  return name
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

// --- About -----------------------------------------------------------------

function AboutTab({ isMock }: { isMock: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel className="mt-0">About</SectionLabel>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">meith</span> is a warm, focused
        workbench for building web apps with AI — the renderer, CLI, and agent cooperate
        around one shared tool registry, editing your code, running dev servers, and
        previewing localhost side by side.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Runtime</span>
        <Badge variant={isMock ? "secondary" : "default"}>
          {isMock ? "Mock bridge" : "Connected"}
        </Badge>
      </div>
    </div>
  );
}

// --- Shared bits -----------------------------------------------------------

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </h3>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-1 py-2.5">
      <label htmlFor={id} className="flex min-w-0 cursor-pointer flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
