'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { MemberSuggestion } from '@meith/accounts'
import { ATTACHMENT_FIELD } from '@meith/attachments/types'
import { applyEditorEdit, applyEditorTag, type EditorTag } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import {
  type AttachmentTarget,
  uploadInlineAttachmentAction,
} from '@/server/attachment-upload-actions'
import { type PreviewScope, renderPreviewAction } from '@/server/content-actions'
import { searchMentionCandidatesAction } from '@/server/mention-actions'

import { type Copy, formatFromCopy, fromCopy, useCopy } from '../shell/copy'
import { attachmentFieldId, MESSAGE_TEXTAREA_ID } from './composer-ids'
import { listContinuation, pasteAsLink } from './markdown-syntax'
import { activeMentionToken, type MentionToken } from './mention-token'

const MENTION_DEBOUNCE_MS = 150

interface Tool {
  readonly tag: EditorTag
  readonly labelKey: string
  readonly glyph: string
  readonly shortcut?: string
  readonly placeholderKey?: string
}

const TOOLS: readonly Tool[] = [
  {
    tag: 'bold',
    labelKey: 'composer.tool.bold',
    glyph: 'B',
    shortcut: 'b',
    placeholderKey: 'composer.placeholder.bold',
  },
  {
    tag: 'italic',
    labelKey: 'composer.tool.italic',
    glyph: 'I',
    shortcut: 'i',
    placeholderKey: 'composer.placeholder.italic',
  },
  {
    tag: 'strikethrough',
    labelKey: 'composer.tool.strikethrough',
    glyph: 'S',
    placeholderKey: 'composer.placeholder.struck',
  },
  { tag: 'link', labelKey: 'composer.tool.link', glyph: 'Link', shortcut: 'k' },
  { tag: 'quote', labelKey: 'composer.tool.quote', glyph: '“”' },
  { tag: 'code', labelKey: 'composer.tool.code', glyph: '</>' },
  {
    tag: 'spoiler',
    labelKey: 'composer.tool.spoiler',
    glyph: 'Spoiler',
    placeholderKey: 'composer.placeholder.spoiler',
  },
  { tag: 'bulletedList', labelKey: 'composer.tool.bulletedList', glyph: '•' },
  { tag: 'numberedList', labelKey: 'composer.tool.numberedList', glyph: '1.' },
  { tag: 'heading', labelKey: 'composer.tool.heading', glyph: 'H' },
]

function runTool(field: HTMLTextAreaElement, tool: Tool, copy: Copy): void {
  applyEditorTag(
    field,
    tool.tag,
    tool.placeholderKey === undefined ? null : fromCopy(copy, tool.placeholderKey),
  )
}

export interface MarkdownEditorProps {
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly label?: string | undefined
  readonly rows?: number | undefined
  readonly required?: boolean | undefined
  readonly defaultValue?: string | undefined
  readonly maxLength?: number | undefined
  readonly preview?: string | undefined
  readonly hint?: React.ReactNode
  readonly scope?: PreviewScope
  readonly attachTo?: AttachmentTarget | undefined
  /**
   * Whether the formatting buttons render inside this component (`'inline'`,
   * the default — every composer outside the post/reply/edit pages) or are
   * left to the page's `EditorToolbar` slot (`'external'`), which addresses
   * this textarea by `id` from a different part of the tree. Either way the
   * textarea works with none of them: the buttons are the enhancement.
   */
  readonly toolbar?: 'inline' | 'external' | undefined
}

export function MarkdownEditor({
  id = MESSAGE_TEXTAREA_ID,
  name = 'message',
  label,
  rows = 12,
  required = false,
  defaultValue,
  maxLength,
  preview,
  hint,
  scope = 'post',
  attachTo,
  toolbar = 'inline',
}: MarkdownEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const copy = useCopy()

  const [claimedAttachments, setClaimedAttachments] = useState<
    readonly { readonly id: number; readonly filename: string }[]
  >([])
  const [attachmentUpload, setAttachmentUpload] = useState<'idle' | 'uploading'>('idle')
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => setEnhanced(true), [])

  const [tab, setTab] = useState<'write' | 'preview'>(preview === undefined ? 'write' : 'preview')
  const [rendered, setRendered] = useState<string | null>(preview ?? null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'failed'>('idle')

  const mentions = scope === 'post'
  const [mentionToken, setMentionToken] = useState<MentionToken | null>(null)
  const [mentionMatches, setMentionMatches] = useState<readonly MemberSuggestion[]>([])
  const [mentionActive, setMentionActive] = useState(0)
  const latestMentionToken = useRef(mentionToken)
  latestMentionToken.current = mentionToken

  const fit = useCallback(() => {
    const element = field.current
    if (element === null) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (enhanced) fit()
  }, [enhanced, fit])

  useEffect(() => {
    if (preview === undefined) return
    setRendered(preview)
    setTab('preview')
  }, [preview])

  async function showPreview(): Promise<void> {
    setTab('preview')
    const source = field.current?.value ?? ''
    setPreviewState('loading')
    try {
      setRendered(await renderPreviewAction(source, scope))
      setPreviewState('idle')
    } catch {
      setPreviewState('failed')
    }
  }

  useEffect(() => {
    if (mentionToken === null) {
      setMentionMatches([])
      return
    }

    const handle = setTimeout(() => {
      void searchMentionCandidatesAction(mentionToken.query).then((matches) => {
        if (latestMentionToken.current !== mentionToken) return
        setMentionMatches(matches)
        setMentionActive(0)
      })
    }, MENTION_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [mentionToken])

  function syncMentionToken(element: HTMLTextAreaElement): void {
    if (!mentions) return
    const found =
      element.selectionStart === element.selectionEnd
        ? activeMentionToken(element.value, element.selectionStart)
        : null

    setMentionToken((current) =>
      current !== null &&
      found !== null &&
      current.start === found.start &&
      current.query === found.query
        ? current
        : found,
    )
  }

  function applyMention(field: HTMLTextAreaElement, candidate: MemberSuggestion): void {
    if (mentionToken === null) return
    const inserted = `@${candidate.username} `
    applyEditorEdit(field, {
      from: mentionToken.start,
      to: mentionToken.start + 1 + mentionToken.query.length,
      text: inserted,
      selectionStart: mentionToken.start + inserted.length,
      selectionEnd: mentionToken.start + inserted.length,
    })
    setMentionToken(null)
  }

  async function insertAttachment(file: File): Promise<void> {
    if (attachTo === undefined || field.current === null) return

    const element = field.current
    const { selectionStart: start, selectionEnd: end } = element
    setAttachmentUpload('uploading')
    setAttachmentError(null)

    const body = new FormData()
    body.set(ATTACHMENT_FIELD, file)
    const result = await uploadInlineAttachmentAction(attachTo, body)

    if (!result.ok) {
      setAttachmentUpload('idle')
      setAttachmentError(result.error)
      return
    }

    setAttachmentUpload('idle')
    setClaimedAttachments((current) => [
      ...current,
      { id: result.attachment.id, filename: result.attachment.filename },
    ])

    const token = `[attachment=${result.attachment.id}]`
    applyEditorEdit(element, {
      from: start,
      to: end,
      text: token,
      selectionStart: start + token.length,
      selectionEnd: start + token.length,
    })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget

    if (mentionToken !== null && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionActive((index) => (index + 1) % mentionMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionActive((index) => (index - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionToken(null)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        applyMention(element, mentionMatches[mentionActive]!)
        return
      }
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      element.form?.requestSubmit()
      event.preventDefault()
      return
    }

    if (event.metaKey || event.ctrlKey) {
      const tool = TOOLS.find((candidate) => candidate.shortcut === event.key.toLowerCase())
      if (tool !== undefined) {
        event.preventDefault()
        runTool(element, tool, copy)
      }
      return
    }

    if (event.key !== 'Enter' || event.shiftKey) return

    const edit = listContinuation(element.value, element.selectionStart)
    if (edit === null) return

    event.preventDefault()
    applyEditorEdit(element, edit)
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget
    const edit = pasteAsLink(
      element.value,
      element.selectionStart,
      element.selectionEnd,
      event.clipboardData.getData('text/plain'),
    )
    if (edit === null) return

    event.preventDefault()
    applyEditorEdit(element, edit)
  }

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    if (tab === 'write') void showPreview()
    else setTab('write')
  }

  const writing = !enhanced || tab === 'write'

  const tabClass = (active: boolean): string =>
    cn(
      'rounded-t-md border border-b-0 px-3 py-1.5 text-sm font-medium',
      active
        ? 'border-border bg-card text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="font-medium">
          {label ?? fromCopy(copy, 'composer.message')}
        </label>

        {enhanced && (
          <div
            role="tablist"
            aria-label={fromCopy(copy, 'composer.tabs')}
            className="flex gap-1"
            onKeyDown={onTabKey}
          >
            <button
              type="button"
              role="tab"
              id={`${panelId}-write-tab`}
              aria-selected={tab === 'write'}
              aria-controls={`${panelId}-write`}
              tabIndex={tab === 'write' ? 0 : -1}
              onClick={() => setTab('write')}
              className={tabClass(tab === 'write')}
            >
              {fromCopy(copy, 'composer.write')}
            </button>
            <button
              type="button"
              role="tab"
              id={`${panelId}-preview-tab`}
              aria-selected={tab === 'preview'}
              aria-controls={`${panelId}-preview`}
              tabIndex={tab === 'preview' ? 0 : -1}
              onClick={() => void showPreview()}
              className={tabClass(tab === 'preview')}
            >
              {fromCopy(copy, 'composer.preview')}
            </button>
          </div>
        )}
      </div>

      {toolbar === 'inline' && enhanced && tab === 'write' && (
        <div
          role="group"
          aria-label={fromCopy(copy, 'composer.formatting')}
          aria-controls={id}
          className="flex flex-wrap gap-0.5 rounded-md border border-border bg-muted/40 p-1"
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.labelKey}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (field.current !== null) runTool(field.current, tool, copy)
              }}
              title={
                tool.shortcut === undefined
                  ? fromCopy(copy, tool.labelKey)
                  : formatFromCopy(copy, 'composer.toolShortcut', {
                      label: fromCopy(copy, tool.labelKey),
                      key: tool.shortcut.toUpperCase(),
                    })
              }
              aria-label={fromCopy(copy, tool.labelKey)}
              {...(tool.shortcut === undefined
                ? {}
                : { 'aria-keyshortcuts': `Control+${tool.shortcut}` })}
              className="min-w-8 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span aria-hidden="true">{tool.glyph}</span>
            </button>
          ))}

          {attachTo !== undefined && (
            <button
              type="button"
              disabled={attachmentUpload === 'uploading'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => attachmentInput.current?.click()}
              title={fromCopy(copy, 'composer.tool.attachment')}
              aria-label={fromCopy(copy, 'composer.tool.attachment')}
              className="min-w-8 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <span aria-hidden="true">Attach</span>
            </button>
          )}
        </div>
      )}

      <div
        {...(enhanced
          ? { role: 'tabpanel', id: `${panelId}-write`, 'aria-labelledby': `${panelId}-write-tab` }
          : {})}
        hidden={!writing}
        className="relative"
      >
        <textarea
          ref={field}
          id={id}
          name={name}
          rows={rows}
          required={required === true && writing}
          defaultValue={defaultValue}
          {...(maxLength === undefined ? {} : { maxLength })}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onInput={(event) => {
            fit()
            syncMentionToken(event.currentTarget)
          }}
          onSelect={(event) => syncMentionToken(event.currentTarget)}
          onBlur={() => setMentionToken(null)}
          {...(enhanced && mentionToken !== null && mentionMatches.length > 0
            ? {
                role: 'combobox',
                'aria-expanded': true,
                'aria-controls': `${panelId}-mentions`,
                'aria-activedescendant': `${panelId}-mention-${mentionActive}`,
                'aria-autocomplete': 'list' as const,
              }
            : {})}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-normal text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />

        {enhanced && mentionToken !== null && mentionMatches.length > 0 && (
          <div
            id={`${panelId}-mentions`}
            role="listbox"
            aria-label={fromCopy(copy, 'composer.mention.suggestions')}
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-card py-1 text-sm shadow-lg"
          >
            {mentionMatches.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                id={`${panelId}-mention-${index}`}
                role="option"
                aria-selected={index === mentionActive}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (field.current !== null) applyMention(field.current, candidate)
                }}
                onMouseEnter={() => setMentionActive(index)}
                className={cn(
                  'block w-full px-3 py-1.5 text-start',
                  index === mentionActive
                    ? 'bg-muted text-foreground'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                @{candidate.username}
              </button>
            ))}
          </div>
        )}
      </div>

      {attachTo !== undefined && (
        <>
          <input
            ref={attachmentInput}
            id={attachmentFieldId(id)}
            type="file"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file !== undefined) void insertAttachment(file)
            }}
          />
          {claimedAttachments.map((attachment) => (
            <input
              key={attachment.id}
              type="hidden"
              name="claimedAttachmentIds"
              value={attachment.id}
            />
          ))}
          {attachmentUpload === 'uploading' && (
            <p className="text-xs text-muted-foreground">
              {fromCopy(copy, 'composer.attachment.uploading')}
            </p>
          )}
          {attachmentError !== null && (
            <p className="text-xs text-destructive">{attachmentError}</p>
          )}
        </>
      )}

      {enhanced && tab === 'preview' && (
        <div
          role="tabpanel"
          id={`${panelId}-preview`}
          aria-labelledby={`${panelId}-preview-tab`}
          aria-live="polite"
          className="min-h-32 rounded-md border border-border bg-card px-3 py-2"
        >
          {previewState === 'loading' && (
            <p className="text-sm text-muted-foreground">{fromCopy(copy, 'composer.rendering')}</p>
          )}
          {previewState === 'failed' && (
            <p className="text-sm text-destructive">{fromCopy(copy, 'composer.previewFailed')}</p>
          )}
          {previewState === 'idle' &&
            (rendered === null || rendered === '' ? (
              <p className="text-sm text-muted-foreground">
                {fromCopy(copy, 'composer.previewEmpty')}
              </p>
            ) : (
              <div className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: rendered }} />
            ))}
        </div>
      )}

      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
      <FormattingHelp scope={scope} />
    </div>
  )
}

function FormattingHelp({ scope }: { scope: PreviewScope }) {
  const copy = useCopy()

  const inline: readonly (readonly [string, string])[] = [
    ['**bold**', 'composer.help.bold'],
    ['*italic*', 'composer.help.italic'],
    ['~~struck~~', 'composer.help.struck'],
    ['[text](https://…)', 'composer.help.link'],
    ['`code`', 'composer.help.codeInline'],
  ]
  const blocks: readonly (readonly [string, string])[] = [
    ['```', 'composer.help.codeBlock'],
    ['> quoted', 'composer.help.quote'],
    ['- item', 'composer.help.list'],
    ['## Heading', 'composer.help.heading'],
    [':::spoiler', 'composer.help.spoiler'],
    ['@name', 'composer.help.mention'],
    ['[attachment=id]', 'composer.help.attachment'],
  ]
  const rows = scope === 'signature' ? inline : [...inline, ...blocks]

  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {fromCopy(copy, 'composer.help.summary')}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([syntax, meaningKey]) => (
          <div key={syntax} className="contents">
            <dt>
              <code>{syntax}</code>
            </dt>
            <dd>{fromCopy(copy, meaningKey)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">{fromCopy(copy, 'composer.help.note')}</p>
    </details>
  )
}
