import { ACP_PRESETS, isModelConfigOption, isReasoningConfigOption } from "@meith/shared";
import type {
  AcpPreset,
  AgentAttachment,
  AgentConfigOption,
  WorkspaceTab,
} from "@meith/shared";
import {
  BotIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
  SendHorizontalIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeithBridge } from "../../../bridge.js";
import { useAgent } from "../hooks/useAgent";
import { useNowTick } from "../hooks/useNowTick";
import { useResizable } from "../hooks/useResizable";
import { AgentAccessSwitcher } from "./AgentAccessSwitcher";
import { AgentMessageList } from "./AgentMessageList";
import { AgentPermissionCard } from "./AgentPermissionCard";
import { AgentSelector } from "./AgentSelector";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./ui/attachment";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface AgentViewProps {
  tab: WorkspaceTab;
  bridge: MeithBridge;
  sessionsCollapsed: boolean;
}

/** The agent chat workspace tab: session list, transcript, composer. */
export function AgentView({ tab, bridge, sessionsCollapsed }: AgentViewProps) {
  const defaults = useMemo(
    () => ({ cwd: tab.cwd, spaceId: tab.spaceId ?? null }),
    [tab.cwd, tab.spaceId],
  );
  const agent = useAgent(bridge, defaults);
  const now = useNowTick(30_000);
  const sidebar = useResizable({
    initial: 280,
    min: 220,
    max: 420,
    axis: "x",
    storageKey: "meith.agentSessionsWidth",
  });

  const running = agent.session?.status === "running";
  const hasSession = Boolean(agent.session);

  const handleAgentChange = useCallback(
    async (preset: AcpPreset) => {
      // Clear model/reasoning overrides so the next preset starts from its own defaults.
      if (hasSession) await agent.setSessionModel({ model: "", reasoning: "" });
      await agent.saveConfig({ adapter: "acp", acpPreset: preset });
    },
    [agent.saveConfig, agent.setSessionModel, hasSession],
  );

  const handleAutoAcceptChange = useCallback(
    (autoAccept: boolean) => void agent.saveConfig({ autoAccept }),
    [agent.saveConfig],
  );

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-background">
      {!sessionsCollapsed && (
        <>
          <aside
            className="flex min-h-0 shrink-0 flex-col border-r border-border/80"
            style={{ width: sidebar.size }}
          >
            <div className="px-3 py-2">
              <div>
                <p className="text-sm font-semibold">Sessions</p>
                <p className="text-xs text-muted-foreground">
                  {agent.sessions.length === 1
                    ? "1 conversation"
                    : `${agent.sessions.length} conversations`}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {agent.sessions.length === 0 ? (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  No sessions yet.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-1">
                  {agent.sessions.map((s) => {
                    const active = s.id === agent.activeId;
                    const unseenFinished = hasUnseenFinishedSession(s);
                    return (
                      <div
                        key={s.id}
                        className={`group flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors ${
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void agent.selectSession(s.id)}
                          className="flex min-w-0 flex-1 items-start gap-2 text-left"
                        >
                          <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                            <BotIcon
                              className="size-3.5 text-muted-foreground"
                              aria-hidden
                            />
                            {(s.status === "running" || unseenFinished) && (
                              <span
                                role="status"
                                aria-label={
                                  s.status === "running"
                                    ? "Running session"
                                    : "Finished session not viewed"
                                }
                                className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background ${
                                  s.status === "running" ? "bg-emerald-500" : "bg-sky-500"
                                }`}
                              />
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {s.title}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {formatRelativeTime(s.updatedAt, now)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label="Delete session"
                          onClick={() => void agent.deleteSession(s.id)}
                          className="rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2Icon className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
          <button
            type="button"
            aria-label="Resize sessions sidebar"
            onPointerDown={sidebar.onPointerDown}
            className="w-1 shrink-0 cursor-col-resize border-r border-border bg-transparent transition-colors hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-none"
          />
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {agent.session?.title ?? "Session"}
              </p>
              <p className="text-xs text-muted-foreground">
                {agent.session
                  ? `${agent.session.messages.length} messages`
                  : "Start a new conversation"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {agent.session && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  agent.session.status === "error"
                    ? "border-destructive/50 text-destructive"
                    : agent.session.status === "running"
                      ? "border-emerald-500/50 text-emerald-400"
                      : "border-border text-muted-foreground"
                }`}
              >
                {sessionStatusLabel(agent.session.status)}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void agent.createSession()}
            >
              <PlusIcon className="size-4" aria-hidden />
              New session
            </Button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {agent.session ? (
            <AgentMessageList session={agent.session} streaming={agent.streaming} />
          ) : agent.sessionLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              <span>Loading session…</span>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>Create a session to start chatting.</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-muted/20 p-3">
          {agent.permissions.length > 0 && (
            <div className="flex flex-col gap-2">
              {agent.permissions.map((req) => (
                <AgentPermissionCard
                  key={req.toolCallId}
                  request={req}
                  onDecide={(r, decision, remember) =>
                    void agent.decide(r, decision, remember)
                  }
                />
              ))}
            </div>
          )}

          <AgentComposer
            sessionId={agent.session?.id}
            hasSession={hasSession}
            running={running}
            preset={agent.config?.acpPreset ?? "custom"}
            modelOptions={agent.modelOptions}
            modelOptionsLoading={agent.modelOptionsLoading}
            model={agent.session?.model ?? agent.config?.model ?? ""}
            reasoning={agent.session?.reasoning ?? agent.config?.reasoning ?? ""}
            autoAccept={agent.config?.autoAccept ?? false}
            onSend={agent.send}
            onStageAttachment={agent.stageAttachment}
            onCancel={agent.cancel}
            onAgentChange={handleAgentChange}
            onModelChange={agent.setSessionModel}
            onAutoAcceptChange={handleAutoAcceptChange}
          />
        </div>
      </div>
    </div>
  );
}

interface AgentComposerProps {
  sessionId?: string;
  hasSession: boolean;
  running: boolean;
  preset: AcpPreset;
  modelOptions: AgentConfigOption[];
  modelOptionsLoading: boolean;
  model: string;
  reasoning: string;
  autoAccept: boolean;
  onSend: (input: { text?: string; attachments?: AgentAttachment[] }) => Promise<void>;
  onStageAttachment: (
    input: Parameters<MeithBridge["agent"]["stageAttachment"]>[1],
  ) => Promise<AgentAttachment>;
  onCancel: () => Promise<void>;
  onAgentChange: (preset: AcpPreset) => Promise<void>;
  onModelChange: (patch: { model?: string; reasoning?: string }) => Promise<void>;
  onAutoAcceptChange: (autoAccept: boolean) => void;
}

const AgentComposer = memo(function AgentComposer({
  sessionId,
  hasSession,
  running,
  preset,
  modelOptions,
  modelOptionsLoading,
  model,
  reasoning,
  autoAccept,
  onSend,
  onStageAttachment,
  onCancel,
  onAgentChange,
  onModelChange,
  onAutoAcceptChange,
}: AgentComposerProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<
    Array<AgentAttachment & { previewUrl?: string }>
  >([]);
  const [dragActive, setDragActive] = useState(false);
  const [staging, setStaging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentsRef = useRef<Array<AgentAttachment & { previewUrl?: string }>>([]);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const canSend =
    hasSession &&
    !running &&
    !staging &&
    (Boolean(draft.trim()) || attachments.length > 0);
  const modelOption = useMemo(
    () => modelOptions.find((option) => isModelConfigOption(option)),
    [modelOptions],
  );
  const reasoningOption = useMemo(
    () => modelOptions.find((option) => isReasoningConfigOption(option)),
    [modelOptions],
  );
  const selectedModel = model || modelOption?.currentValue || "";
  const selectedReasoning = reasoning || reasoningOption?.currentValue || "";
  const selectedModelLabel =
    resolveConfigOptionLabel(modelOption, selectedModel) || "Default";
  const selectedReasoningLabel =
    resolveConfigOptionLabel(reasoningOption, selectedReasoning) || "Default";
  const agentTooltip = `${ACP_PRESETS[preset].label} · ${selectedModelLabel} · ${selectedReasoningLabel}`;

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      revokeAttachmentPreviews(attachmentsRef.current);
    },
    [],
  );

  useEffect(() => {
    setDraft("");
    setAttachmentError(null);
    setAttachments((prev) => {
      revokeAttachmentPreviews(prev);
      return [];
    });
  }, [sessionId]);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (!hasSession || incoming.length === 0) return;
      setAttachmentError(null);
      setStaging(true);
      const staged: Array<AgentAttachment & { previewUrl?: string }> = [];
      try {
        for (const file of incoming) {
          if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
            setAttachmentError(
              `Skipped "${file.name}": max attachment size is ${formatAttachmentBytes(
                MAX_CHAT_ATTACHMENT_BYTES,
              )}.`,
            );
            continue;
          }
          const sourcePath = filePathFromDropFile(file);
          const stagedAttachment = sourcePath
            ? await onStageAttachment({
                name: file.name || undefined,
                mimeType: file.type || undefined,
                sourcePath,
              })
            : await onStageAttachment({
                name: file.name || "pasted-image.png",
                mimeType: file.type || "image/png",
                dataBase64: await fileToBase64(file),
              });
          staged.push({
            ...stagedAttachment,
            previewUrl: file.type.startsWith("image/")
              ? URL.createObjectURL(file)
              : undefined,
          });
        }
      } catch (err) {
        setAttachmentError(err instanceof Error ? err.message : String(err));
      } finally {
        setStaging(false);
      }

      if (staged.length > 0) {
        setAttachments((prev) => [...prev, ...staged]);
      }
    },
    [hasSession, onStageAttachment],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const next = prev.filter((attachment) => attachment.id !== id);
      const removed = prev.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!canSend) return;
    const sentDraft = draft;
    const sentAttachments = attachments;
    const payloadAttachments = sentAttachments.map(
      ({ previewUrl: _previewUrl, ...attachment }) => attachment,
    );

    // Clear optimistically so the composer resets immediately after send.
    setDraft("");
    setAttachmentError(null);
    setAttachments([]);

    try {
      await onSend({
        text,
        attachments: payloadAttachments,
      });
      revokeAttachmentPreviews(sentAttachments);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
      setDraft((current) => (current.length > 0 ? current : sentDraft));
      setAttachments((current) => (current.length > 0 ? current : sentAttachments));
    }
  }, [attachments, canSend, draft, onSend]);

  const openAttachmentPicker = useCallback(() => {
    if (!hasSession || running || staging) return;
    const input = filePickerRef.current;
    if (!input) return;
    try {
      if ("showPicker" in input && typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Chromium can throw if showPicker is unavailable in this context.
    }
    input.click();
  }, [hasSession, running, staging]);

  return (
    <form
      className={`flex min-w-0 flex-col gap-2 rounded-md border bg-transparent px-1 pt-1 transition-colors ${
        dragActive ? "border-primary/70 ring-1 ring-primary/40" : "border-input"
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSend();
      }}
      onDragOver={(e) => {
        if (!hasDraggedFiles(e)) return;
        e.preventDefault();
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (!hasDraggedFiles(e)) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={(e) => {
        if (!hasDraggedFiles(e)) return;
        e.preventDefault();
        setDragActive(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          void addFiles(files);
          e.currentTarget.value = "";
        }}
      />

      {attachments.length > 0 && (
        <AttachmentGroup className="px-1">
          {attachments.map((attachment) => (
            <Attachment key={attachment.id} size="sm">
              <AttachmentMedia
                variant={attachment.kind === "image" ? "image" : "icon"}
                className="size-10"
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="size-full object-cover"
                  />
                ) : attachment.kind === "image" ? (
                  <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                ) : (
                  <FileIcon className="size-4 text-muted-foreground" aria-hidden />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{attachment.name}</AttachmentTitle>
                <AttachmentDescription>
                  {formatAttachmentBytes(attachment.sizeBytes)}
                </AttachmentDescription>
              </AttachmentContent>
              <button
                type="button"
                className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => removeAttachment(attachment.id)}
                aria-label={`Remove ${attachment.name}`}
              >
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          const files = clipboardFiles(e);
          if (files.length === 0) return;
          e.preventDefault();
          void addFiles(files);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void handleSend();
          }
        }}
        rows={1}
        placeholder={
          hasSession ? "Message the agent…" : "Create a session to start chatting…"
        }
        aria-label="Message the agent"
        disabled={!hasSession || staging}
        className="max-h-56 min-h-[2.25rem] w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed focus-visible:outline-none disabled:opacity-50"
      />

      {attachmentError && (
        <p className="px-2 text-xs text-destructive">{attachmentError}</p>
      )}

      <div className="flex items-center gap-1 border-t border-border/70 px-1 py-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-accent-foreground"
                onClick={openAttachmentPicker}
                disabled={!hasSession || running || staging}
                aria-label="Attach files"
              >
                {staging ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : (
                  <PaperclipIcon className="size-4" aria-hidden />
                )}
              </Button>
            }
          />
          <TooltipContent>{staging ? "Attaching…" : "Attach files"}</TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <div className="shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex">
                    <AgentSelector
                      preset={preset}
                      options={modelOptions}
                      loading={modelOptionsLoading}
                      model={model}
                      reasoning={reasoning}
                      disabled={!hasSession || running}
                      onChange={(nextPreset) => void onAgentChange(nextPreset)}
                      onModelChange={(patch) => void onModelChange(patch)}
                    />
                  </span>
                }
              />
              <TooltipContent>{agentTooltip}</TooltipContent>
            </Tooltip>
          </div>
          <div className="shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex">
                    <AgentAccessSwitcher
                      autoAccept={autoAccept}
                      disabled={!hasSession || running}
                      onChange={onAutoAcceptChange}
                    />
                  </span>
                }
              />
              <TooltipContent>
                {autoAccept
                  ? "Access mode: Full access"
                  : "Access mode: Ask for approval"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {attachments.length} attached
          </span>
        )}

        {running ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => void onCancel()}
                  aria-label="Stop"
                >
                  <SquareIcon className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent>Stop run</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <SendHorizontalIcon className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        )}
      </div>
    </form>
  );
});

const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

function revokeAttachmentPreviews(attachments: Array<{ previewUrl?: string }>) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

function clipboardFiles(event: React.ClipboardEvent<HTMLTextAreaElement>): File[] {
  const fromFiles = Array.from(event.clipboardData.files);
  // Some Chromium/Electron clipboard payloads expose the same pasted image in
  // both `files` and `items` with slightly different metadata, which causes
  // duplicate attachments. Prefer `files` and only fall back to `items`.
  if (fromFiles.length > 0) return dedupeFiles(fromFiles);

  const fromItems = Array.from(event.clipboardData.items)
    .map((item) => (item.kind === "file" ? item.getAsFile() : null))
    .filter((file): file is File => file !== null);
  return dedupeFiles(fromItems);
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasDraggedFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function filePathFromDropFile(file: File): string | undefined {
  const withPath = file as File & { path?: string };
  return withPath.path?.trim() || undefined;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
}

function formatAttachmentBytes(bytes?: number): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveConfigOptionLabel(
  option: AgentConfigOption | undefined,
  value: string,
): string {
  if (!value) return "";
  const match = option?.values.find((entry) => entry.value === value);
  return match?.name ?? value;
}

function hasUnseenFinishedSession(session: {
  status: string;
  lastViewedAt?: number;
  updatedAt: number;
}) {
  return (
    session.status !== "running" &&
    session.lastViewedAt !== undefined &&
    session.updatedAt > session.lastViewedAt
  );
}

function formatRelativeTime(timestamp: number, now: number): string {
  const deltaSeconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(deltaSeconds) < 45) return "just now";
  if (Math.abs(deltaSeconds) < 3600) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  }
  if (Math.abs(deltaSeconds) < 86_400) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 3600), "hour");
  }
  return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 86_400), "day");
}

function sessionStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    default:
      return "Idle";
  }
}
