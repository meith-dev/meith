const HTML_UNESCAPES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

// The exact inverse of packages/markdown/src/escape.ts's escapeHtml — for
// post-processing steps that need the original text back out of already
// html-rendered output (see code-highlighting.ts, embeds.ts).
export function unescapeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => HTML_UNESCAPES[entity] ?? entity)
}
