export const DEFAULT_AGENT_SESSION_TITLE = "New session";

const MAX_SESSION_TITLE_WORDS = 3;
const MAX_SESSION_TITLE_CHARS = 28;

const STOP_WORDS = new Set([
  "a",
  "about",
  "add",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "build",
  "can",
  "could",
  "create",
  "do",
  "fix",
  "for",
  "from",
  "help",
  "i",
  "implement",
  "in",
  "into",
  "is",
  "it",
  "make",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "that",
  "the",
  "this",
  "to",
  "update",
  "when",
  "with",
  "working",
  "you",
  "your",
]);

export function isDefaultAgentSessionTitle(title: string): boolean {
  return title.trim().toLowerCase() === DEFAULT_AGENT_SESSION_TITLE.toLowerCase();
}

export function summarizeAgentSessionTitle(text: string): string {
  const tokens = tokenizeTitleWords(text);
  const words = tokens.filter((word) => !STOP_WORDS.has(word));
  const selected = (words.length > 0 ? words : tokens).slice(0, MAX_SESSION_TITLE_WORDS);
  while (
    selected.length > 1 &&
    titleCaseWords(selected).join(" ").length > MAX_SESSION_TITLE_CHARS
  ) {
    selected.pop();
  }
  const title = titleCaseWords(selected).join(" ");
  return title.length <= MAX_SESSION_TITLE_CHARS
    ? title
    : title.slice(0, MAX_SESSION_TITLE_CHARS).trim();
}

function tokenizeTitleWords(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[-']+|[-']+$/g, "").toLowerCase())
    .filter((word) => word.length > 1);
}

function titleCaseWords(words: string[]): string[] {
  return words.map((word) =>
    word
      .split("-")
      .map((part) =>
        /^[a-z0-9]+$/.test(part)
          ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
          : part,
      )
      .join("-"),
  );
}
