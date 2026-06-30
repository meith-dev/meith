import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { AgentMessage, AgentSession, AgentToolCall } from "@meith/shared";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareDashedIcon,
  WrenchIcon,
} from "lucide-react";
import { type ReactNode, memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNowTick } from "../hooks/useNowTick";
import { cn } from "../lib/utils";

const MARKDOWN_MAX_CHARS = 12_000;
const MARKDOWN_MAX_LINES = 350;
const PLAIN_TEXT_MAX_CHARS = 16_000;
const TOOL_OUTPUT_COLLAPSE_CHARS = 1_200;
const TOOL_OUTPUT_COLLAPSE_LINES = 24;
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

interface AgentMessageListProps {
  session: AgentSession;
  /** In-flight assistant text streamed for the current turn. */
  streaming: string;
}

/** Renders the transcript: user/assistant bubbles, tool-call cards, errors. */
export const AgentMessageList = memo(function AgentMessageList({
  session,
  streaming,
}: AgentMessageListProps) {
  const now = useNowTick(30_000);
  const running = session.status === "running";
  const liveAssistant = running ? latestAssistantForCurrentTurn(session) : undefined;
  const liveAssistantId = liveAssistant?.id;

  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollEdgeThreshold={64}
    >
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="gap-5 px-4 py-4">
            {session.messages.length === 0 && !running ? (
              <MessageScrollerItem messageId={`empty-${session.id}`}>
                <Empty className="h-full border border-dashed border-border/50">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="text-muted-foreground/60">
                      <MessageSquareDashedIcon className="size-4" aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm font-medium text-foreground/70">
                      No messages yet
                    </EmptyTitle>
                    <EmptyDescription className="text-xs text-muted-foreground/70">
                      Send a prompt to start this conversation.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </MessageScrollerItem>
            ) : (
              <MessageGroup className="gap-5">
                {session.messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <MessageRow
                      message={message}
                      now={now}
                      live={message.id === liveAssistantId}
                      liveContent={
                        message.id === liveAssistantId ? streaming || message.content : ""
                      }
                    />
                  </MessageScrollerItem>
                ))}
                {running && !liveAssistant && (
                  <MessageScrollerItem messageId={`live-${session.id}`} scrollAnchor>
                    <LiveAssistantActivity content={streaming} calls={[]} />
                  </MessageScrollerItem>
                )}
              </MessageGroup>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
});

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

function MessageRow({
  message,
  now,
  live = false,
  liveContent = "",
}: {
  message: AgentMessage;
  now: number;
  live?: boolean;
  liveContent?: string;
}) {
  if (message.role === "user") {
    const attachments = message.attachments ?? [];
    return (
      <Message align="end">
        <MessageContent>
          <MessageHeader className="justify-end">
            <span>You</span>
            <span className="ml-2 text-[11px]">
              {formatMessageTime(message.createdAt, now)}
            </span>
          </MessageHeader>
          <Bubble align="end" variant="secondary">
            <BubbleContent>
              {attachments.length > 0 && (
                <AttachmentGroup className="mb-2">
                  {attachments.map((attachment) => (
                    <Attachment key={attachment.id} size="sm">
                      <AttachmentMedia
                        variant={attachment.kind === "image" ? "image" : "icon"}
                        className="size-10"
                      >
                        {attachment.kind === "image" ? (
                          <ImageIcon
                            className="size-4 text-muted-foreground"
                            aria-hidden
                          />
                        ) : (
                          <FileIcon
                            className="size-4 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{attachment.name}</AttachmentTitle>
                        <AttachmentDescription>
                          {attachment.kind}
                          {attachment.mimeType ? ` • ${attachment.mimeType}` : ""}
                        </AttachmentDescription>
                      </AttachmentContent>
                    </Attachment>
                  ))}
                </AttachmentGroup>
              )}
              {message.content.trim() ? (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sent attachments</p>
              )}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  if (message.role === "assistant") {
    const hasExpandableSections = hasExpandableAssistantSections(message);
    if (live) {
      return (
        <LiveAssistantActivity
          content={liveContent || message.content}
          calls={message.toolCalls ?? []}
        />
      );
    }
    return (
      <Message align="start">
        <MessageContent>
          <MessageHeader>
            <span>Agent</span>
            <span className="ml-2 text-[11px]">
              {formatMessageTime(message.createdAt, now)}
            </span>
          </MessageHeader>
          <Bubble
            variant="muted"
            className={hasExpandableSections ? "w-full max-w-[80%]" : undefined}
          >
            <BubbleContent className={hasExpandableSections ? "w-full" : undefined}>
              <AssistantTranscript message={message} />
              {message.error && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{message.error}</span>
                </div>
              )}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  return null;
}

function LiveAssistantActivity({
  content,
  calls,
}: {
  content: string;
  calls: AgentToolCall[];
}) {
  const events = liveActivityEvents(content, calls);
  const groupedEvents = groupLiveActivityEvents(events);
  const latestThinkingIndex = useMemo(() => {
    for (let index = groupedEvents.length - 1; index >= 0; index -= 1) {
      if (groupedEvents[index]?.type === "thinking") return index;
    }
    return -1;
  }, [groupedEvents]);
  return (
    <Message align="start">
      <MessageContent>
        <MessageHeader>
          <span>Agent</span>
          <span className="ml-2 flex items-center gap-1 text-[11px]">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            <span>now</span>
          </span>
        </MessageHeader>
        <Bubble variant="muted" className="w-full max-w-[80%]">
          <BubbleContent className="w-full">
            <div className="flex min-w-0 flex-col gap-2">
              {groupedEvents.map((event, index) =>
                event.type === "thinking" ? (
                  <ThinkingBlock
                    key={event.id}
                    entries={event.entries}
                    isLatest={index === latestThinkingIndex}
                  />
                ) : (
                  <ToolCallStack key={event.id} calls={event.calls} compact isLive />
                ),
              )}
            </div>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function formatMessageTime(timestamp: number, now: number): string {
  const deltaSeconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(deltaSeconds) < 45) return "just now";
  return MESSAGE_TIME_FORMATTER.format(new Date(timestamp));
}

function hasExpandableAssistantSections(message: AgentMessage): boolean {
  if ((message.toolCalls?.length ?? 0) > 0) return true;
  return (
    message.textSegments?.some(
      (segment) => segment.kind === "thought" && segment.text.trim().length > 0,
    ) ?? false
  );
}

type LiveActivityEvent =
  | { type: "thinking"; id: string; content: string; live: boolean }
  | { type: "tools"; id: string; calls: AgentToolCall[] };

type GroupedLiveActivityEvent =
  | {
      type: "thinking";
      id: string;
      entries: ThinkingEntry[];
    }
  | {
      type: "tools";
      id: string;
      calls: AgentToolCall[];
    };

type TranscriptTextSegment = {
  start: number;
  end: number;
  text: string;
  kind?: "thought" | "message";
};

type ThinkingEntry = {
  id: string;
  content: string;
  live: boolean;
};

function liveActivityEvents(
  content: string,
  calls: AgentToolCall[],
): LiveActivityEvent[] {
  if (calls.length === 0) {
    return [{ type: "thinking", id: "thinking-live", content, live: true }];
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

  if (inlineCalls.length === 0) {
    return [
      ...calls.map((call) => ({
        type: "tools" as const,
        id: `tool-${call.id}`,
        calls: [call],
      })),
      { type: "thinking", id: "thinking-live", content, live: true },
    ];
  }

  const inlineIds = new Set(inlineCalls.map((call) => call.id));
  const events: LiveActivityEvent[] = [];
  let cursor = 0;

  for (let index = 0; index < inlineCalls.length; index += 1) {
    const call = inlineCalls[index];
    const offset = call.contentOffset ?? content.length;
    const text = content.slice(cursor, offset);
    if (text.trim()) {
      events.push({
        type: "thinking",
        id: `thinking-${cursor}-${offset}`,
        content: text,
        live: false,
      });
    }

    const group = [call];
    while (index + 1 < inlineCalls.length) {
      const next = inlineCalls[index + 1];
      if (next.contentOffset !== offset) break;
      group.push(next);
      index += 1;
    }
    events.push({
      type: "tools",
      id: `tools-${offset}-${group.map((item) => item.id).join("-")}`,
      calls: group,
    });
    cursor = offset;
  }

  const trailingCalls = calls.filter((call) => !inlineIds.has(call.id));
  for (const call of trailingCalls) {
    events.push({ type: "tools", id: `tool-${call.id}`, calls: [call] });
  }

  const trailingText = content.slice(cursor);
  events.push({
    type: "thinking",
    id: `thinking-${cursor}-live`,
    content: trailingText,
    live: true,
  });

  return events;
}

function groupLiveActivityEvents(
  events: LiveActivityEvent[],
): GroupedLiveActivityEvent[] {
  const grouped: GroupedLiveActivityEvent[] = [];
  let pendingThinking: ThinkingEntry[] = [];

  const flushThinking = () => {
    if (pendingThinking.length === 0) return;
    const first = pendingThinking[0];
    const last = pendingThinking[pendingThinking.length - 1];
    grouped.push({
      type: "thinking",
      id: `${first.id}-${last.id}`,
      entries: pendingThinking,
    });
    pendingThinking = [];
  };

  for (const event of events) {
    if (event.type === "thinking") {
      pendingThinking.push({
        id: event.id,
        content: event.content,
        live: event.live,
      });
      continue;
    }
    flushThinking();
    grouped.push(event);
  }

  flushThinking();
  return grouped;
}

function ThinkingBlock({
  entries,
  isLatest = false,
}: {
  entries: ThinkingEntry[];
  /** When true the block starts open and is only collapsed once a newer
   *  thought block arrives. When false (a prior thought) it starts closed. */
  isLatest?: boolean;
}) {
  const visibleEntries = entries.filter((entry) => entry.content.trim());
  const fallbackEntry = entries.at(-1);
  const latestEntry = visibleEntries.at(-1) ?? fallbackEntry;
  const live = Boolean(latestEntry?.live);
  const label = live ? "Thinking" : "Thoughts";

  // Join all tokens into one continuous string for rendering and summary
  const detailContent = visibleEntries.map((entry) => entry.content).join("");
  const normalizedContent = normalizeThoughtText(detailContent);
  const hasDetails = normalizedContent.length > 0;

  // Summarise the full normalised content (not just the last token)
  const summaryText = summarizeThought(normalizedContent);

  const wordCount = hasDetails
    ? normalizedContent.split(/\s+/).filter(Boolean).length
    : 0;
  const countLabel = wordCount > 10 ? `${wordCount} words` : undefined;

  const summary = (
    <div className="flex min-w-0 items-center gap-1.5 py-0.5 text-sm text-muted-foreground">
      {live && (
        <span
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
      )}
      <Marker
        className="min-w-0 flex-1 py-0"
        role={live ? "status" : undefined}
        aria-live={live ? "polite" : undefined}
        aria-atomic={live ? "true" : undefined}
      >
        <MarkerContent className="min-w-0 truncate text-muted-foreground">
          <span className="font-medium">{label}</span>
          {summaryText && (
            <span className="ml-1 inline align-middle text-muted-foreground/80">
              <ReactMarkdown
                allowedElements={["strong", "em", "code"]}
                unwrapDisallowed
              >
                {summaryText}
              </ReactMarkdown>
            </span>
          )}
        </MarkerContent>
      </Marker>
      {countLabel && (
        <span className="shrink-0 text-[11px] text-muted-foreground/70">{countLabel}</span>
      )}
      {hasDetails && (
        <ChevronRightIcon
          className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-open/thinking:rotate-90"
          aria-hidden
        />
      )}
    </div>
  );

  if (!hasDetails) {
    return <div className="group/thinking min-w-0">{summary}</div>;
  }

  return (
    <details
      className="group/thinking min-w-0 overflow-hidden"
      open={isLatest || undefined}
    >
      <summary className="min-w-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-1 pl-4 text-xs text-muted-foreground">
        <MarkdownMessage content={normalizedContent} />
      </div>
    </details>
  );
}

/** Normalise streaming thought text.
 *  Tokens arrive one-per-line so collapse all whitespace runs into a single
 *  space, then fix tokenizer artifacts (spaces before punctuation, spaced
 *  contractions). Paragraph-level structure is intentionally flattened —
 *  thought entries are a continuous internal stream, not formatted prose.
 */
function normalizeThoughtText(text: string): string {
  return text
    // Collapse all whitespace (newlines, tabs, multiple spaces) into one space
    .replace(/\s+/g, " ")
    // Remove space before punctuation: "word ." → "word."
    .replace(/ ([.,:;!?])/g, "$1")
    // Fix spaced contractions: "won 't" → "won't", "I 'll" → "I'll"
    .replace(/(\w) ('(?:t|s|re|ve|ll|d|m))\b/gi, "$1$2")
    .trim();
}

function summarizeThought(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const withPrefix = `· ${normalized}`;
  if (withPrefix.length <= 96) return withPrefix;
  return `${withPrefix.slice(0, 93)}...`;
}

function thinkingEntriesFromSegments(
  segments: TranscriptTextSegment[],
  live = false,
): ThinkingEntry[] {
  return segments.map((segment) => ({
    id: `text-${segment.start}-${segment.end}`,
    content: segment.text,
    live,
  }));
}

function AssistantTranscript({ message }: { message: AgentMessage }) {
  const content = message.content ?? "";
  const calls = message.toolCalls ?? [];
  const segments = normalizedTextSegments(message, calls);
  const { thinkingSegments, finalSegments } = transcriptTextParts(segments, calls);
  const finalContent = finalSegments.map((segment) => segment.text).join("");
  if (calls.length === 0) {
    if (thinkingSegments.length === 0) {
      return finalContent ? <MarkdownMessage content={finalContent} /> : null;
    }
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <ThinkingBlock entries={thinkingEntriesFromSegments(thinkingSegments)} />
        {finalContent && (
          <div className="mt-1">
            <MarkdownMessage content={finalContent} />
          </div>
        )}
      </div>
    );
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
        {thinkingSegments.length > 0 && (
          <ThinkingBlock entries={thinkingEntriesFromSegments(thinkingSegments)} />
        )}
        <ToolCallStack calls={calls} compact className={content ? "mt-2" : ""} />
        {finalContent && (
          <div className="mt-3">
            <MarkdownMessage content={finalContent} />
          </div>
        )}
      </>
    );
  }

  const events: TranscriptEvent[] = [
    ...thinkingSegments.map((segment) => ({
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
      const group = [event.segment];
      while (index + 1 < events.length) {
        const next = events[index + 1];
        if (next.type !== "text") break;
        group.push(next.segment);
        index += 1;
      }
      parts.push(
        <ThinkingBlock
          key={`text-${group[0].start}-${group[group.length - 1].end}`}
          entries={thinkingEntriesFromSegments(group)}
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
    parts.push(
      <ToolCallStack key={`tools-${event.at}-${index}`} calls={group} compact />,
    );
  }
  if (trailingCalls.length > 0) {
    parts.push(<ToolCallStack key="trailing-tools" calls={trailingCalls} compact />);
  }
  if (finalContent) {
    parts.push(
      <div key="final-answer" className="mt-1">
        <MarkdownMessage content={finalContent} />
      </div>,
    );
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
  segments: TranscriptTextSegment[],
  offsets: number[],
): TranscriptTextSegment[] {
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
        return { start, end, text: content.slice(start, end), kind: segment.kind };
      })
      .filter((part) => part.text);
  });
}

function transcriptTextParts(
  segments: TranscriptTextSegment[],
  calls: AgentToolCall[],
): {
  thinkingSegments: TranscriptTextSegment[];
  finalSegments: TranscriptTextSegment[];
} {
  const explicitCompletion = splitExplicitCompletionBlock(segments);
  if (explicitCompletion) return explicitCompletion;

  if (calls.length === 0) {
    return splitCompletionTail(segments);
  }

  const lastToolOffset = calls.reduce(
    (max, call) =>
      typeof call.contentOffset === "number" ? Math.max(max, call.contentOffset) : max,
    0,
  );
  const thinkingSegments: TranscriptTextSegment[] = [];
  const tailSegments: TranscriptTextSegment[] = [];

  for (const segment of segments) {
    if (segment.start < lastToolOffset) {
      thinkingSegments.push(segment);
    } else {
      tailSegments.push(segment);
    }
  }

  const splitTail = splitCompletionTail(tailSegments);
  return {
    thinkingSegments: [...thinkingSegments, ...splitTail.thinkingSegments],
    finalSegments: splitTail.finalSegments,
  };
}

function splitCompletionTail(segments: TranscriptTextSegment[]): {
  thinkingSegments: TranscriptTextSegment[];
  finalSegments: TranscriptTextSegment[];
} {
  const explicitCompletion = splitExplicitCompletionBlock(segments);
  if (explicitCompletion) return explicitCompletion;

  return {
    thinkingSegments: segments.filter((segment) => segment.kind === "thought"),
    finalSegments: segments.filter((segment) => segment.kind !== "thought"),
  };
}

function splitExplicitCompletionBlock(segments: TranscriptTextSegment[]): {
  thinkingSegments: TranscriptTextSegment[];
  finalSegments: TranscriptTextSegment[];
} | null {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const finalStart = completionBlockStart(segment.text);
    if (finalStart < 0) continue;
    if (finalStart === 0) {
      return {
        thinkingSegments: segments.slice(0, index),
        finalSegments: segments.slice(index),
      };
    }
    const thinkingPrefix: TranscriptTextSegment = {
      ...segment,
      end: segment.start + finalStart,
      text: segment.text.slice(0, finalStart),
      kind: "thought",
    };
    const finalRemainder: TranscriptTextSegment = {
      ...segment,
      start: segment.start + finalStart,
      text: segment.text.slice(finalStart),
      kind: "message",
    };
    return {
      thinkingSegments: [...segments.slice(0, index), thinkingPrefix].filter((part) =>
        part.text.trim(),
      ),
      finalSegments: [finalRemainder, ...segments.slice(index + 1)],
    };
  }
  return null;
}

function completionBlockStart(text: string): number {
  const match = text.match(
    /(?:^|\n{2,})(?:Done\b|Implemented\b|Completed\b|Changed\b|Updated\b|Fixed\b|Checked\b|What changed:|Storage now works like this:|Current storage shape:|Validation(?: passed)?\b|Checks? passed\b)/,
  );
  if (!match || match.index === undefined) return -1;
  return match[0].startsWith("\n") ? match.index + match[0].search(/\S/) : match.index;
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
  compact = false,
  isLive = false,
}: {
  calls: AgentToolCall[];
  className?: string;
  compact?: boolean;
  isLive?: boolean;
}) {
  const visibleCalls = calls.filter((call) => !isImageInspectionToolCall(call));
  if (visibleCalls.length === 0) return null;

  // Only collapse into a group when there are 3+ tools.
  // 1–2 tools always render as individual cards.
  if (compact && visibleCalls.length >= 3) {
    return (
      <details
        className={cn(
          "group min-w-0 overflow-hidden rounded-md border border-border bg-card/60 text-xs",
          className,
        )}
      >
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
          <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate font-medium text-foreground">
            {toolCallStackTitle(visibleCalls)}
          </span>
          <ChevronRightIcon
            className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            aria-hidden
          />
        </summary>
        <div className="flex min-w-0 flex-col gap-2 border-t border-border/70 p-2">
          {visibleCalls.map((call) => (
            <ToolCallCard key={call.id} call={call} />
          ))}
        </div>
      </details>
    );
  }

  // For 1–2 tools (or non-compact), render individual cards.
  // In a live turn, the last card starts open so the user can see what's happening.
  const lastIndex = visibleCalls.length - 1;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {visibleCalls.map((call, index) => (
        <ToolCallCard
          key={call.id}
          call={call}
          defaultOpen={isLive && index === lastIndex}
        />
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
  const tooLarge =
    content.length > MARKDOWN_MAX_CHARS ||
    content.split("\n", MARKDOWN_MAX_LINES + 1).length > MARKDOWN_MAX_LINES;
  if (tooLarge) {
    return <PlainTextMessage content={content} />;
  }
  return (
    <div className="min-w-0 space-y-2 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {redactLocalImagePaths(content)}
      </ReactMarkdown>
    </div>
  );
}

function PlainTextMessage({ content }: { content: string }) {
  const text = useMemo(() => {
    const redacted = redactLocalImagePaths(content);
    if (redacted.length <= PLAIN_TEXT_MAX_CHARS) return redacted;
    return `[Earlier content omitted]\n\n${redacted.slice(-PLAIN_TEXT_MAX_CHARS)}`;
  }, [content]);
  return (
    <pre className="min-w-0 whitespace-pre-wrap break-words font-sans leading-relaxed">
      {text}
    </pre>
  );
}

function ToolCallCard({
  call,
  className,
  defaultOpen = false,
}: {
  call: AgentToolCall;
  className?: string;
  defaultOpen?: boolean;
}) {
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
  const screenshot = screenshotArtifact(call);
  const resultText = screenshot ? "" : redactLocalImagePaths(formatToolResult(call));
  const title = toolCallTitle(call);
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group/tool min-w-0 overflow-hidden rounded-md border border-border bg-card/60 text-xs",
        className,
      )}
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <StatusIcon
          className={`size-3.5 shrink-0 ${tone} ${spin ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 truncate font-mono font-medium text-foreground">
          {title}
        </span>
        <ChevronRightIcon
          className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform group-open/tool:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="min-w-0 border-t border-border/70 px-2 py-2">
        {argText !== "{}" && (
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Input
            </p>
            <code className="block min-w-0 max-w-full whitespace-pre-wrap break-words rounded border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
              {argText}
            </code>
          </div>
        )}
        {resultText && (
          <ToolResultBlock
            className={cn("min-w-0", argText !== "{}" && "mt-2")}
            label={call.result?.ok === false ? "Error" : "Output"}
            content={resultText}
          />
        )}
        {screenshot && (
          <ScreenshotAttachment
            path={screenshot.path}
            width={screenshot.width}
            height={screenshot.height}
          />
        )}
        {call.error && (
          <p className="mt-1.5 text-xs text-destructive">{call.error}</p>
        )}
        {!resultText && !screenshot && !call.error && argText === "{}" && (
          <p className="text-[11px] text-muted-foreground/60">No details.</p>
        )}
      </div>
    </details>
  );
}

function ToolResultBlock({
  label,
  content,
  className,
}: {
  label: string;
  content: string;
  className?: string;
}) {
  const lineCount = content.split("\n").length;
  const verbose =
    content.length > TOOL_OUTPUT_COLLAPSE_CHARS || lineCount > TOOL_OUTPUT_COLLAPSE_LINES;
  if (!verbose) {
    return (
      <div className={className}>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          {label}
        </p>
        <pre className="max-h-48 min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
          {content}
        </pre>
      </div>
    );
  }

  const preview = compactActivityUpdate(content) || `${lineCount} lines`;
  return (
    <details className={cn("group/tool-output min-w-0 overflow-hidden", className)}>
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Marker className="min-w-0 flex-1 py-0 text-xs">
          <MarkerContent className="min-w-0 truncate text-muted-foreground/80" title={`${label}: ${preview}`}>
            <span className="font-medium">{label}:</span>
            {" "}{preview}
          </MarkerContent>
        </Marker>
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {lineCount} lines
        </span>
        <ChevronRightIcon
          className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-open/tool-output:rotate-90"
          aria-hidden
        />
      </summary>
      <pre className="mt-1.5 max-h-64 min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
        {content}
      </pre>
    </details>
  );
}

function toolCallTitle(call: AgentToolCall): string {
  if (call.status === "running" || call.status === "pending") {
    return displayToolName(call);
  }
  const displayName = displayToolName(call);
  if (call.status === "error" || call.status === "denied") {
    return `Command failed: ${displayName}`;
  }
  return `Ran ${displayName}`;
}

function toolCallStackTitle(calls: AgentToolCall[]): string {
  const commandLabel = calls.length === 1 ? "command" : "commands";
  const running = calls.some(
    (call) => call.status === "running" || call.status === "pending",
  );
  if (running) return `Running ${calls.length} ${commandLabel}`;

  const failed = calls.filter(
    (call) => call.status === "error" || call.status === "denied",
  ).length;
  if (failed === calls.length) {
    return `${calls.length} ${commandLabel} failed`;
  }
  if (failed > 0) {
    return `Ran ${calls.length} ${commandLabel}, ${failed} failed`;
  }
  return `Ran ${calls.length} ${commandLabel}`;
}

function compactActivityUpdate(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const chunks = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const candidate = [...chunks].reverse().find((chunk) => chunk.length >= 18) ?? cleaned;
  return truncateActivityUpdate(candidate);
}

function truncateActivityUpdate(value: string): string {
  const max = 96;
  if (value.length <= max) return value;
  const trimmed = value.slice(0, max - 1);
  const lastSpace = trimmed.lastIndexOf(" ");
  return `${trimmed.slice(0, lastSpace > 48 ? lastSpace : max - 1)}…`;
}

function ScreenshotAttachment({
  path,
  width,
  height,
}: {
  path: string;
  width?: number;
  height?: number;
}) {
  const dimensions = width && height ? `${width}x${height}` : "Open preview";
  return (
    <Attachment size="sm" className="mt-2 min-w-0 max-w-md overflow-hidden">
      <AttachmentMedia variant="image" className="size-14 self-stretch">
        <img
          src={artifactUrl(path)}
          alt="Browser screenshot"
          className="size-full object-cover"
          loading="lazy"
        />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>Browser screenshot</AttachmentTitle>
        <AttachmentDescription>{dimensions}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentTrigger
        render={
          <a href={artifactUrl(path)} target="_blank" rel="noreferrer" aria-label={path}>
            <span className="sr-only">Open screenshot</span>
          </a>
        }
      />
    </Attachment>
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
