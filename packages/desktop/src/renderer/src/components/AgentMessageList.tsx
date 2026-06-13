import type { AgentMessage, AgentSession, AgentToolCall } from "@meith/shared";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/utils";

interface AgentMessageListProps {
  session: AgentSession;
  /** In-flight assistant text streamed for the current turn. */
  streaming: string;
}

/** Renders the transcript: user/assistant bubbles, tool-call cards, errors. */
export function AgentMessageList({ session, streaming }: AgentMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the view pinned to the latest content while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session.messages, session.status, streaming]);

  const running = session.status === "running";
  const streamingRemainder = running
    ? streamingAfterLatestAssistant(session, streaming)
    : "";

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4">
      {session.messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {streamingRemainder && (
        <Bubble variant="assistant">
          <MarkdownMessage content={streamingRemainder} />
        </Bubble>
      )}
      {running && !streamingRemainder && !hasRunningAssistantContent(session) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          <span>Thinking…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function streamingAfterLatestAssistant(session: AgentSession, streaming: string): string {
  if (!streaming) return "";
  const latestAssistant = latestAssistantForCurrentTurn(session);
  const saved = latestAssistant?.content ?? "";
  if (!saved) return streaming;
  if (streaming.startsWith(saved)) return streaming.slice(saved.length);
  if (saved.startsWith(streaming)) return "";
  return streaming;
}

function hasRunningAssistantContent(session: AgentSession): boolean {
  const latestAssistant = latestAssistantForCurrentTurn(session);
  return Boolean(
    latestAssistant &&
      (latestAssistant.content ||
        latestAssistant.toolCalls?.length ||
        latestAssistant.error),
  );
}

function latestAssistantForCurrentTurn(session: AgentSession): AgentMessage | undefined {
  let latestUserIndex = -1;
  for (let i = session.messages.length - 1; i >= 0; i -= 1) {
    if (session.messages[i].role === "user") {
      latestUserIndex = i;
      break;
    }
  }
  const currentTurnMessages =
    latestUserIndex >= 0 ? session.messages.slice(latestUserIndex + 1) : session.messages;
  return currentTurnMessages.filter((message) => message.role === "assistant").at(-1);
}

function MessageRow({ message }: { message: AgentMessage }) {
  if (message.role === "user") {
    return (
      <Bubble variant="user">
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </Bubble>
    );
  }
  if (message.role === "assistant") {
    return (
      <Bubble variant="assistant">
        <AssistantTranscript message={message} />
        {message.error && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{message.error}</span>
          </div>
        )}
      </Bubble>
    );
  }
  return null;
}

function Bubble({
  variant,
  children,
}: {
  variant: "user" | "assistant";
  children: ReactNode;
}) {
  const isUser = variant === "user";
  return (
    <div className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[85%] overflow-hidden rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function AssistantTranscript({ message }: { message: AgentMessage }) {
  const content = message.content ?? "";
  const calls = message.toolCalls ?? [];
  const segments = normalizedTextSegments(message, calls);
  if (calls.length === 0) {
    return segments.length > 0 ? (
      <div className="flex min-w-0 flex-col gap-3">
        {segments.map((segment) => (
          <MarkdownMessage
            key={`text-${segment.start}-${segment.end}`}
            content={segment.text}
          />
        ))}
      </div>
    ) : null;
  }

  const inlineCalls = calls
    .filter(
      (call) =>
        typeof call.contentOffset === "number" &&
        call.contentOffset >= 0 &&
        call.contentOffset <= content.length,
    )
    .sort(
      (a, b) =>
        (a.contentOffset ?? 0) - (b.contentOffset ?? 0) || a.startedAt - b.startedAt,
    );
  const inlineIds = new Set(inlineCalls.map((call) => call.id));
  const trailingCalls = calls.filter((call) => !inlineIds.has(call.id));

  if (inlineCalls.length === 0) {
    return (
      <>
        {segments.length > 0 && (
          <div className="flex min-w-0 flex-col gap-3">
            {segments.map((segment) => (
              <MarkdownMessage
                key={`text-${segment.start}-${segment.end}`}
                content={segment.text}
              />
            ))}
          </div>
        )}
        <ToolCallStack calls={calls} className={content ? "mt-2" : ""} />
      </>
    );
  }

  const events: TranscriptEvent[] = [
    ...segments.map((segment) => ({
      type: "text" as const,
      at: segment.start,
      segment,
    })),
    ...inlineCalls.map((call) => ({
      type: "tool" as const,
      at: call.contentOffset ?? content.length,
      call,
    })),
  ].sort((a, b) => a.at - b.at || (a.type === "tool" ? -1 : 1));

  const parts: ReactNode[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === "text") {
      parts.push(
        <MarkdownMessage
          key={`text-${event.segment.start}-${event.segment.end}`}
          content={event.segment.text}
        />,
      );
      continue;
    }

    const group = [event.call];
    while (index + 1 < events.length) {
      const next = events[index + 1];
      if (next.type !== "tool" || next.at !== event.at) break;
      group.push(next.call);
      index += 1;
    }
    parts.push(<ToolCallStack key={`tools-${event.at}-${index}`} calls={group} />);
  }
  if (trailingCalls.length > 0) {
    parts.push(<ToolCallStack key="trailing-tools" calls={trailingCalls} />);
  }

  return <div className="flex min-w-0 flex-col gap-2">{parts}</div>;
}

function normalizedTextSegments(message: AgentMessage, calls: AgentToolCall[]) {
  const content = message.content ?? "";
  const offsets = callOffsets(content, calls);
  if (message.textSegments?.length) {
    const segments = message.textSegments
      .filter((segment) => segment.text)
      .sort((a, b) => a.start - b.start);
    return offsets.length > 0
      ? splitSegmentsAtOffsets(content, segments, offsets)
      : segments;
  }
  if (offsets.length > 0) {
    const boundaries = [0, ...offsets, content.length];
    return boundaries
      .slice(0, -1)
      .map((start, index) => {
        const end = boundaries[index + 1];
        return { start, end, text: content.slice(start, end) };
      })
      .filter((segment) => segment.text);
  }
  return content ? [{ start: 0, end: content.length, text: content }] : [];
}

function callOffsets(content: string, calls: AgentToolCall[]): number[] {
  return [
    ...new Set(
      calls
        .map((call) => call.contentOffset)
        .filter(
          (offset): offset is number =>
            typeof offset === "number" && offset > 0 && offset < content.length,
        ),
    ),
  ].sort((a, b) => a - b);
}

function splitSegmentsAtOffsets(
  content: string,
  segments: Array<{ start: number; end: number; text: string }>,
  offsets: number[],
): Array<{ start: number; end: number; text: string }> {
  return segments.flatMap((segment) => {
    const innerOffsets = offsets.filter(
      (offset) => offset > segment.start && offset < segment.end,
    );
    if (innerOffsets.length === 0) return [segment];
    const boundaries = [segment.start, ...innerOffsets, segment.end];
    return boundaries
      .slice(0, -1)
      .map((start, index) => {
        const end = boundaries[index + 1];
        return { start, end, text: content.slice(start, end) };
      })
      .filter((part) => part.text);
  });
}

type TranscriptEvent =
  | {
      type: "text";
      at: number;
      segment: { start: number; end: number; text: string };
    }
  | { type: "tool"; at: number; call: AgentToolCall };

function ToolCallStack({
  calls,
  className,
}: {
  calls: AgentToolCall[];
  className?: string;
}) {
  const visibleCalls = calls.filter((call) => !isImageInspectionToolCall(call));
  if (visibleCalls.length === 0) return null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {visibleCalls.map((call) => (
        <ToolCallCard key={call.id} call={call} />
      ))}
    </div>
  );
}

const markdownComponents: Components = {
  p: ({ className, ...props }) => (
    <p className={cn("leading-relaxed", className)} {...props} />
  ),
  h1: ({ className, ...props }) => (
    <h1 className={cn("mt-3 text-lg font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-3 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-3 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-2 list-disc space-y-1 pl-5", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-2 list-decimal space-y-1 pl-5", className)} {...props} />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("pl-1 leading-relaxed", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "my-2 border-l-2 border-border pl-3 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("text-primary underline underline-offset-2", className)}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn(
        "rounded bg-background/80 px-1 py-0.5 font-mono text-[0.9em]",
        className,
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-2 overflow-x-auto rounded-md border border-border bg-background/80 p-3 text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-left text-xs", className)}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border border-border bg-background/60 px-2 py-1 font-medium",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn("border border-border px-2 py-1 align-top", className)}
      {...props}
    />
  ),
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 space-y-2 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {redactLocalImagePaths(content)}
      </ReactMarkdown>
    </div>
  );
}

function ToolCallCard({ call }: { call: AgentToolCall }) {
  const StatusIcon =
    call.status === "ok"
      ? CheckCircle2Icon
      : call.status === "error" || call.status === "denied"
        ? AlertCircleIcon
        : call.status === "running" || call.status === "pending"
          ? Loader2Icon
          : WrenchIcon;
  const spin = call.status === "running" || call.status === "pending";
  const tone =
    call.status === "error" || call.status === "denied"
      ? "text-destructive"
      : call.status === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";
  const argText = JSON.stringify(call.args ?? {});
  const displayName = displayToolName(call);
  const screenshot = screenshotArtifact(call);
  const resultText = screenshot ? "" : redactLocalImagePaths(formatToolResult(call));
  const resultPreview = truncate(resultText, 160);
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-card/60 p-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon
          className={`size-3.5 ${tone} ${spin ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 truncate font-mono font-medium text-foreground">
          {displayName}
        </span>
        <span className={`ml-auto shrink-0 ${tone}`}>{call.status}</span>
      </div>
      {argText !== "{}" && (
        <div className="mt-1 flex min-w-0 items-start gap-1 text-muted-foreground">
          <ChevronRightIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          <code className="min-w-0 max-w-full break-words font-mono [overflow-wrap:anywhere]">
            {argText}
          </code>
        </div>
      )}
      {resultText && (
        <details className="group mt-1 min-w-0 rounded border border-border/70 bg-background/50 text-muted-foreground">
          <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2 py-1 [&::-webkit-details-marker]:hidden">
            <span className="shrink-0 font-medium text-foreground">
              {call.result?.ok === false ? "Error" : "Result"}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono">{resultPreview}</code>
            <ChevronRightIcon
              className="size-3 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
          </summary>
          <pre className="max-h-48 min-w-0 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/70 px-2 py-1 font-mono [overflow-wrap:anywhere]">
            {resultText}
          </pre>
        </details>
      )}
      {screenshot && (
        <ScreenshotFigure
          path={screenshot.path}
          width={screenshot.width}
          height={screenshot.height}
        />
      )}
      {call.error && <p className="mt-1 text-destructive">{call.error}</p>}
    </div>
  );
}

function ScreenshotFigure({
  path,
  width,
  height,
}: {
  path: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure className="mt-2 overflow-hidden rounded-md border border-border/70 bg-background/50">
      <img
        src={artifactUrl(path)}
        alt="Browser screenshot"
        className="max-h-96 w-full object-contain"
        loading="lazy"
      />
      {(width || height) && (
        <figcaption className="border-t border-border/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {width && height ? `${width}x${height}` : path}
        </figcaption>
      )}
    </figure>
  );
}

function displayToolName(call: AgentToolCall): string {
  if (!isGenericToolName(call.name)) return call.name;
  const command = call.args?.command;
  if (typeof command === "string" && command.trim()) return command.trim();
  const name = call.args?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return "External action";
}

function isGenericToolName(name: string): boolean {
  return ["tool", "tool call"].includes(name.trim().toLowerCase());
}

function screenshotArtifact(
  call: AgentToolCall,
): { path: string; width?: number; height?: number } | null {
  if (call.result?.ok !== true) return null;
  if (!isScreenshotToolCall(call)) return null;
  return findScreenshotArtifact(call.result.content);
}

function isScreenshotToolCall(call: AgentToolCall): boolean {
  if (call.name === "take_screenshot") return true;
  if (call.args?.tool === "take_screenshot") return true;
  if (call.args?.name === "take_screenshot") return true;
  return false;
}

function isImageInspectionToolCall(call: AgentToolCall): boolean {
  const name = displayToolName(call).toLowerCase();
  if (name.startsWith("view image ")) return true;
  if (name === "view_image" || name === "view image") return true;
  if (call.args?.tool === "view_image" || call.args?.name === "view_image") return true;
  return false;
}

function findScreenshotArtifact(
  value: unknown,
  depth = 0,
): { path: string; width?: number; height?: number } | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    const parsed = parseJson(value);
    if (parsed !== undefined) return findScreenshotArtifact(parsed, depth + 1);
    const path = firstLocalImagePath(value);
    return path ? { path } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findScreenshotArtifact(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const direct = screenshotFromRecord(record);
  if (direct) return direct;
  for (const key of ["content", "result", "data", "artifact", "text", "output"]) {
    const found = findScreenshotArtifact(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function screenshotFromRecord(
  record: Record<string, unknown>,
): { path: string; width?: number; height?: number } | null {
  const path = record.path;
  if (typeof path !== "string" || !isLocalImagePath(path)) return null;
  const width = typeof record.width === "number" ? record.width : undefined;
  const height = typeof record.height === "number" ? record.height : undefined;
  return { path, width, height };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function artifactUrl(path: string): string {
  const name = path.split("/").pop() ?? path;
  return `meith-artifact://local/${encodeURIComponent(name)}`;
}

function localImagePaths(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(/\/[^\n\r"'`<>]+?\.(?:png|jpe?g|webp)/gi)) {
    const path = match[0].trim().replace(/[.,;:]+$/, "");
    if (isLocalImagePath(path)) paths.add(path);
  }
  return [...paths];
}

function firstLocalImagePath(text: string): string | null {
  return localImagePaths(text)[0] ?? null;
}

function redactLocalImagePaths(text: string): string {
  return text.replace(/\/[^\n\r"'`<>]+?\.(?:png|jpe?g|webp)/gi, "[screenshot]");
}

function isLocalImagePath(path: string): boolean {
  return path.startsWith("/") && /\.(png|jpe?g|webp)$/i.test(path);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function formatToolResult(call: AgentToolCall): string {
  if (!call.result) return "";
  if (call.result.error?.message) return call.result.error.message;
  if (call.result.content === undefined) return call.result.ok ? "completed" : "";
  return formatUnknown(call.result.content);
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
