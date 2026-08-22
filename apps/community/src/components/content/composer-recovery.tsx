'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@meith/ui'

import { autosaveComposerAction, type ComposerAutosaveInput } from '@/server/content-actions'

import { type Copy, fromCopy } from '../shell/copy'

const BACKUP_VERSION = 1
const AUTOSAVE_DELAY_MS = 1_500

interface Backup extends ComposerAutosaveInput {
  readonly version: typeof BACKUP_VERSION
  readonly savedAt: number
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

function readPayload(form: HTMLFormElement, scope: ComposerAutosaveInput): ComposerAutosaveInput {
  const data = new FormData(form)
  const prefix = data.get('prefixId')
  return {
    ...scope,
    title: typeof data.get('title') === 'string' ? String(data.get('title')) : '',
    message: typeof data.get('message') === 'string' ? String(data.get('message')) : '',
    prefixId:
      typeof prefix === 'string' && prefix !== '' && Number.isSafeInteger(Number(prefix))
        ? Number(prefix)
        : null,
  }
}

function signature(payload: ComposerAutosaveInput): string {
  return JSON.stringify({
    forumId: payload.forumId,
    threadId: payload.threadId,
    title: payload.title,
    message: payload.message,
    prefixId: payload.prefixId,
  })
}

function storedBackup(key: string): Backup | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Backup> | null
    if (
      parsed === null ||
      parsed.version !== BACKUP_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.message !== 'string'
    ) {
      return null
    }
    return parsed as Backup
  } catch {
    return null
  }
}

function setField(form: HTMLFormElement, name: string, value: string): void {
  const control = form.elements.namedItem(name)
  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    )
  )
    return
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

export function ComposerRecovery({
  storageKey,
  scope,
  serverUpdatedAt,
  copy,
}: {
  storageKey: string
  scope: Pick<ComposerAutosaveInput, 'forumId' | 'threadId'>
  serverUpdatedAt: number
  copy: Copy
}) {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef('')
  const saved = useRef('')
  const submitting = useRef(false)
  const [recovery, setRecovery] = useState<Backup | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const persist = useCallback(async () => {
    const form = root.current?.closest('form')
    if (form === null || form === undefined) return
    const payload = readPayload(form, { ...scope, title: '', message: '', prefixId: null })
    const next = signature(payload)
    latest.current = next
    if (next === saved.current || (payload.title.trim() === '' && payload.message.trim() === ''))
      return

    setSaveState('saving')
    try {
      const result = await autosaveComposerAction(payload)
      saved.current = next
      setSaveState('saved')
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...payload, version: BACKUP_VERSION, savedAt: result.savedAt }),
      )
    } catch {
      setSaveState('failed')
    }
  }, [scope, storageKey])

  useEffect(() => {
    const form = root.current?.closest('form')
    if (form === null || form === undefined) return

    const initial = readPayload(form, { ...scope, title: '', message: '', prefixId: null })
    latest.current = signature(initial)
    saved.current = latest.current
    const backup = storedBackup(storageKey)
    if (
      backup !== null &&
      backup.savedAt > serverUpdatedAt &&
      signature(backup) !== latest.current
    ) {
      setRecovery(backup)
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const onInput = () => {
      const payload = readPayload(form, { ...scope, title: '', message: '', prefixId: null })
      latest.current = signature(payload)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...payload, version: BACKUP_VERSION, savedAt: Date.now() }),
        )
      } catch {}
      clearTimeout(timer)
      timer = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS)
    }
    const onBlur = () => void persist()
    const onSubmit = (event: SubmitEvent) => {
      const submitter = event.submitter
      submitting.current =
        !(submitter instanceof HTMLButtonElement) ||
        (submitter.name !== 'intent' && submitter.value !== 'preview')
    }
    const onPageHide = () => {
      if (submitting.current) localStorage.removeItem(storageKey)
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (latest.current === saved.current) return
      event.preventDefault()
      event.returnValue = ''
    }

    form.addEventListener('input', onInput)
    form.addEventListener('blur', onBlur, true)
    form.addEventListener('submit', onSubmit)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearTimeout(timer)
      form.removeEventListener('input', onInput)
      form.removeEventListener('blur', onBlur, true)
      form.removeEventListener('submit', onSubmit)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [persist, scope, serverUpdatedAt, storageKey])

  function restore(): void {
    const form = root.current?.closest('form')
    if (form === null || form === undefined || recovery === null) return
    setField(form, 'title', recovery.title)
    setField(form, 'message', recovery.message)
    setField(form, 'prefixId', recovery.prefixId?.toString() ?? '')
    setRecovery(null)
  }

  function discard(): void {
    localStorage.removeItem(storageKey)
    setRecovery(null)
  }

  return (
    <div ref={root} className="flex flex-col gap-2" aria-live="polite">
      {recovery !== null && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{fromCopy(copy, 'composer.recovery.available')}</span>
            <button type="button" className="font-medium underline" onClick={restore}>
              {fromCopy(copy, 'composer.recovery.restore')}
            </button>
            <button type="button" className="font-medium underline" onClick={discard}>
              {fromCopy(copy, 'composer.recovery.discard')}
            </button>
          </AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">
        {saveState === 'saving' && fromCopy(copy, 'composer.autosave.saving')}
        {saveState === 'saved' && fromCopy(copy, 'composer.autosave.saved')}
        {saveState === 'failed' && fromCopy(copy, 'composer.autosave.failed')}
      </p>
    </div>
  )
}
