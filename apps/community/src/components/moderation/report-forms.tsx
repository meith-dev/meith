'use client'

import { useActionState } from 'react'

import { Card, CardContent, Field, Textarea } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { assignReportAction, closeReportAction, fileReportAction } from '@/server/report-actions'

import { FormError, SubmitButton } from '../auth/form-controls'

export function ReportForm({ kind, targetId }: { kind: string; targetId: number }) {
  const [state, action] = useActionState(fileReportAction, EMPTY_STATE)

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4" noValidate>
          <FormError message={state.error} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="targetId" value={targetId} />

          <Field
            name="reason"
            label="What is wrong with it?"
            description="Say what a moderator should look at. The member you are reporting never sees this."
          >
            {(control) => (
              <Textarea {...control} required defaultValue={state.values?.reason ?? ''} />
            )}
          </Field>

          <div>
            <SubmitButton className="w-full sm:w-auto sm:px-8">Send report</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function AssignReportForm({ reportId, mine }: { reportId: number; mine: boolean }) {
  const [state, action] = useActionState(assignReportAction, EMPTY_STATE)

  return (
    <form action={action} className="inline">
      <FormError message={state.error} />
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="take" value={mine ? '0' : '1'} />
      <button
        type="submit"
        className="text-xs font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {mine ? 'Put back' : 'Take this'}
      </button>
    </form>
  )
}

export function CloseReportForm({ reportId }: { reportId: number }) {
  const [state, action] = useActionState(closeReportAction, EMPTY_STATE)

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <FormError message={state.error} />
      <input type="hidden" name="reportId" value={reportId} />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">
          Note for moderators (optional, never shown to the reporter)
        </span>
        <input
          type="text"
          name="note"
          maxLength={1000}
          defaultValue={state.values?.note ?? ''}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="status"
          value="resolved"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Resolve
        </button>
        <button
          type="submit"
          name="status"
          value="rejected"
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Dismiss
        </button>
      </div>
    </form>
  )
}
