import { memberByNameHref, type QuoteAttribution, quoteAttribution } from './attribution'
import { escapeAttribute, escapeHtml, unescapeHtml } from './escape'
import { type CompiledSmilies, renderSmilies } from './extensions'
import type { Alignment, Block, Inline, ListItem, MarkdownDocument } from './nodes'
import { safeImageUrl, safeUrl } from './url'

export interface RenderContext {
  readonly smilies?: CompiledSmilies | undefined
  readonly headingOffset?: number
  readonly quoteAttribution?: ((author: string) => string) | undefined
  readonly spoilerLabel?: string | undefined
}

const LANGUAGE = /^[a-z0-9][a-z0-9+#._-]{0,23}$/i

function alignmentClass(alignment: Alignment): string {
  if (alignment === null) return ''
  return ` class="md-align-${alignment}"`
}

function anchor(href: string, title: string | null, inner: string, className?: string): string {
  const titleAttribute = title === null || title === '' ? '' : ` title="${escapeAttribute(title)}"`
  const classAttribute = className === undefined ? '' : ` class="${className}"`
  return `<a${classAttribute} href="${escapeAttribute(href)}" rel="nofollow ugc noopener noreferrer"${titleAttribute}>${inner}</a>`
}

export function renderInline(nodes: readonly Inline[], context: RenderContext = {}): string {
  let html = ''
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        html += renderSmilies(node.value, context.smilies)
        break
      case 'code':
        html += `<code class="md-code-span">${escapeHtml(node.value)}</code>`
        break
      case 'emphasis':
        html += `<em>${renderInline(node.children, context)}</em>`
        break
      case 'strong':
        html += `<strong>${renderInline(node.children, context)}</strong>`
        break
      case 'strike':
        html += `<s>${renderInline(node.children, context)}</s>`
        break
      case 'break':
        html += '<br>\n'
        break
      case 'link': {
        const href = safeUrl(node.href, { allowMailto: true })
        const inner = renderInline(node.children, context)
        html += href === null ? inner : anchor(href, node.title, inner)
        break
      }
      case 'image': {
        const src = safeImageUrl(node.src)
        html +=
          src === null
            ? escapeHtml(node.alt)
            : `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(node.alt)}" loading="lazy" class="md-image">`
        break
      }
      case 'directive':
        html += `<span class="md-directive md-directive-${escapeAttribute(node.name)}">${renderInline(node.children, context)}</span>`
        break
      case 'mention': {
        const href = memberByNameHref(node.name)
        html += `<a class="md-mention" href="${escapeAttribute(href)}">@${escapeHtml(node.name)}</a>`
        break
      }
      case 'attachment':
        // A placeholder only: which attachment ids a viewer may actually see resolved is a
        // permission question this package has no way to answer, so it names the id and leaves
        // resolving it to the async post-processing step that does (see apps/community's
        // attachment-embed.ts). An id nobody resolves — the board has no attachments package
        // configured, say — just disappears; it was never guaranteed to render as anything.
        html += `<span class="md-attachment" data-attachment-id="${node.id}"></span>`
        break
    }
  }
  return html
}

function renderSpoiler(children: readonly Block[], context: RenderContext): string {
  const label = escapeHtml(context.spoilerLabel ?? 'Spoiler')
  return `<details class="md-spoiler"><summary>${label}</summary>${renderBlocks(children, context)}</details>\n`
}

function renderAttribution(attribution: QuoteAttribution, context: RenderContext): string {
  const name = escapeHtml(attribution.name)
  const profile = attribution.href === null ? null : safeUrl(attribution.href)
  const author = profile === null ? name : anchor(profile, null, name, 'md-quote-author')

  const source = attribution.sourceHref === null ? null : safeUrl(attribution.sourceHref)
  const citation =
    source === null
      ? ''
      : anchor(source, null, escapeHtml(attribution.sourceLabel), 'md-quote-source')

  const label = context.quoteAttribution?.(author) ?? `${author} wrote:`
  return `<p class="md-quote-attribution"><strong data-quote-author="${escapeAttribute(author)}">${label}</strong>${citation}</p>\n`
}

const QUOTE_ATTRIBUTION_STRONG = /<strong data-quote-author="([^"]*)">[\s\S]*?<\/strong>/g

/**
 * Swaps a rendered post's quote-attribution text for a translated one without
 * re-parsing or re-rendering anything else — so a translator doesn't force a
 * cached post's stored HTML (see postBodyHtml in body.ts) to be recomputed,
 * which would also re-run the much more expensive async pipeline steps
 * (syntax highlighting, embeds, inline attachments) on every view.
 */
export function localizeQuoteAttribution(
  html: string,
  quoteAttribution: (author: string) => string,
): string {
  if (!html.includes('data-quote-author')) return html
  return html.replace(
    QUOTE_ATTRIBUTION_STRONG,
    (_whole, escapedAuthor: string) =>
      `<strong>${quoteAttribution(unescapeHtml(escapedAuthor))}</strong>`,
  )
}

function renderItem(item: ListItem, tight: boolean, context: RenderContext): string {
  const inner = renderBlocks(item.children, context, tight)
  if (item.checked === null) return `<li>${inner}</li>`
  const checked = item.checked ? ' checked' : ''
  return `<li class="md-task"><input type="checkbox" disabled${checked}> ${inner}</li>`
}

function renderBlocks(blocks: readonly Block[], context: RenderContext, tight = false): string {
  let html = ''
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
        html += tight
          ? renderInline(block.inline, context)
          : `<p>${renderInline(block.inline, context)}</p>\n`
        break
      case 'heading': {
        const level = Math.min(6, block.level + (context.headingOffset ?? 1))
        html += `<h${level}>${renderInline(block.inline, context)}</h${level}>\n`
        break
      }
      case 'quote': {
        const attribution = quoteAttribution(block.children[0])
        const body = attribution === null ? block.children : block.children.slice(1)
        html += `<blockquote class="md-quote">${attribution === null ? '' : renderAttribution(attribution, context)}${renderBlocks(body, context)}</blockquote>\n`
        break
      }
      case 'list': {
        const items = block.items.map((item) => renderItem(item, block.tight, context)).join('')
        html += block.ordered
          ? `<ol class="md-list"${block.start === 1 ? '' : ` start="${block.start}"`}>${items}</ol>\n`
          : `<ul class="md-list">${items}</ul>\n`
        break
      }
      case 'code': {
        const language =
          block.language !== null && LANGUAGE.test(block.language) ? block.language : null
        const languageClass =
          language === null
            ? ''
            : ` class="md-code-lang-${escapeAttribute(language.toLowerCase())}"`
        html += `<pre class="md-code"><code${languageClass}>${escapeHtml(block.value)}\n</code></pre>\n`
        break
      }
      case 'rule':
        html += '<hr class="md-rule">\n'
        break
      case 'table': {
        const head = block.head
          .map(
            (cell, column) =>
              `<th${alignmentClass(block.align[column] ?? null)}>${renderInline(cell.inline, context)}</th>`,
          )
          .join('')
        const rows = block.rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell, column) =>
                    `<td${alignmentClass(block.align[column] ?? null)}>${renderInline(cell.inline, context)}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')
        html += `<div class="md-table-scroll"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
        break
      }
      case 'directive':
        html +=
          block.name === 'spoiler'
            ? renderSpoiler(block.children, context)
            : `<div class="md-directive md-directive-${escapeAttribute(block.name)}">${renderBlocks(block.children, context)}</div>\n`
        break
    }
  }
  return html
}

export function renderDocument(document: MarkdownDocument, context: RenderContext = {}): string {
  return renderBlocks(document.blocks, context).trimEnd()
}
