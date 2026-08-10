import { escapeAttribute, escapeHtml } from './escape'
import { renderSmilies, type CompiledSmilies } from './extensions'
import type { Alignment, Block, Inline, ListItem, MarkdownDocument } from './nodes'
import { safeImageUrl, safeUrl } from './url'

export interface RenderContext {
  readonly smilies?: CompiledSmilies | undefined
  readonly headingOffset?: number
}

const LANGUAGE = /^[a-z0-9][a-z0-9+#._-]{0,23}$/i

function alignmentClass(alignment: Alignment): string {
  if (alignment === null) return ''
  return ` class="md-align-${alignment}"`
}

function anchor(href: string, title: string | null, inner: string): string {
  const titleAttribute = title === null || title === '' ? '' : ` title="${escapeAttribute(title)}"`
  return `<a href="${escapeAttribute(href)}" rel="nofollow ugc noopener noreferrer"${titleAttribute}>${inner}</a>`
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
        const href = `/member/by-name/${encodeURIComponent(node.name)}`
        html += `<a class="md-mention" href="${escapeAttribute(href)}">@${escapeHtml(node.name)}</a>`
        break
      }
    }
  }
  return html
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
      case 'quote':
        html += `<blockquote class="md-quote">${renderBlocks(block.children, context)}</blockquote>\n`
        break
      case 'list': {
        const items = block.items.map((item) => renderItem(item, block.tight, context)).join('')
        html += block.ordered
          ? `<ol class="md-list"${block.start === 1 ? '' : ` start="${block.start}"`}>${items}</ol>\n`
          : `<ul class="md-list">${items}</ul>\n`
        break
      }
      case 'code': {
        const language = block.language !== null && LANGUAGE.test(block.language) ? block.language : null
        const languageClass = language === null ? '' : ` class="md-code-lang-${escapeAttribute(language.toLowerCase())}"`
        html += `<pre class="md-code"><code${languageClass}>${escapeHtml(block.value)}\n</code></pre>\n`
        break
      }
      case 'rule':
        html += '<hr class="md-rule">\n'
        break
      case 'table': {
        const head = block.head
          .map((cell, column) => `<th${alignmentClass(block.align[column] ?? null)}>${renderInline(cell.inline, context)}</th>`)
          .join('')
        const rows = block.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, column) => `<td${alignmentClass(block.align[column] ?? null)}>${renderInline(cell.inline, context)}</td>`)
                .join('')}</tr>`,
          )
          .join('')
        html += `<div class="md-table-scroll"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
        break
      }
      case 'directive':
        html += `<div class="md-directive md-directive-${escapeAttribute(block.name)}">${renderBlocks(block.children, context)}</div>\n`
        break
    }
  }
  return html
}

export function renderDocument(document: MarkdownDocument, context: RenderContext = {}): string {
  return renderBlocks(document.blocks, context).trimEnd()
}
