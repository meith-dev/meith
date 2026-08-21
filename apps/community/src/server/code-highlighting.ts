import 'server-only'

import { codeHighlighter } from '@meith/drivers/highlighting'
import { escapeAttribute, unescapeHtml } from '@meith/markdown'

const CODE_BLOCK =
  /<pre class="md-code"><code(?: class="md-code-lang-([a-z0-9+#._-]+)")?>([\s\S]*?)\n<\/code><\/pre>/g

export async function highlightCodeBlocks(html: string): Promise<string> {
  if (!html.includes('md-code')) return html

  const matches = [...html.matchAll(CODE_BLOCK)]
  if (matches.length === 0) return html

  const replacements = new Map<string, string>()

  for (const match of matches) {
    const whole = match[0]
    if (replacements.has(whole)) continue

    const code = unescapeHtml(match[2] ?? '')
    const highlighted = await codeHighlighter.highlight(code, match[1])
    if (highlighted === null) continue

    replacements.set(
      whole,
      `<pre class="md-code" data-lang="${escapeAttribute(match[1]!)}"><code class="md-code-lang-${escapeAttribute(match[1]!)}">${highlighted}</code></pre>`,
    )
  }

  if (replacements.size === 0) return html
  return html.replace(CODE_BLOCK, (whole) => replacements.get(whole) ?? whole)
}
