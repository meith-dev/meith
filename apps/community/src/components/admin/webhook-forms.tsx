'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  createWebhookAction,
  deleteWebhookAction,
  toggleWebhookAction,
} from '@/server/webhook-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

export function CreateWebhookForm({
  topics,
  formats,
  copy,
}: {
  topics: readonly string[]
  formats: readonly string[]
  copy: Copy
}) {
  const [state, action] = useActionState(createWebhookAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />

      {state.notice === 'created' && state.values?.secret !== undefined && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-accent bg-post-highlight px-3 py-3"
        >
          <p className="text-sm font-semibold">{fromCopy(copy, 'adminPanel.webhook.copyNow')}</p>
          <code className="block overflow-x-auto rounded-sm bg-card px-2 py-1 font-mono text-sm">
            {state.values.secret}
          </code>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminPanel.webhook.url')}</span>
        <input
          name="url"
          type="url"
          required
          placeholder={fromCopy(copy, 'adminPanel.webhook.urlPlaceholder')}
          className="rounded-sm border border-input bg-card px-2 py-1"
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.webhook.urlHint')}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          {fromCopy(copy, 'adminPanel.webhook.topics')}
        </legend>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.webhook.topicsHint')}
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {topics.map((topic) => (
            <label key={topic} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="topics" value={topic} />
              <code className="font-mono text-xs">{topic}</code>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          {fromCopy(copy, 'adminPanel.webhook.format')}
        </legend>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.webhook.formatHint')}
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {formats.map((format, index) => (
            <label key={format} className="flex items-center gap-2 text-sm">
              <input type="radio" name="format" value={format} defaultChecked={index === 0} />
              <span>{fromCopy(copy, `adminPanel.webhook.format.${format}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="true" defaultChecked />
        <span className="font-medium">{fromCopy(copy, 'adminPanel.webhook.active')}</span>
      </label>

      <SubmitButton>{fromCopy(copy, 'adminPanel.webhook.create')}</SubmitButton>
    </form>
  )
}

export function ToggleWebhookForm({
  webhookId,
  active,
  copy,
}: {
  webhookId: number
  active: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(toggleWebhookAction, EMPTY_STATE)

  return (
    <form action={action}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <SubmitButton>
        {fromCopy(copy, active ? 'adminPanel.webhook.disable' : 'adminPanel.webhook.enable')}
      </SubmitButton>
      {state.error !== undefined && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
    </form>
  )
}

export function DeleteWebhookForm({ webhookId, copy }: { webhookId: number; copy: Copy }) {
  const [state, action] = useActionState(deleteWebhookAction, EMPTY_STATE)

  return (
    <form action={action}>
      <input type="hidden" name="webhookId" value={webhookId} />
      <SubmitButton>{fromCopy(copy, 'adminPanel.webhook.delete')}</SubmitButton>
      {state.error !== undefined && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
    </form>
  )
}
