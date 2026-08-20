'use client'

import { useActionState } from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Disclosure,
  NativeSelect,
  Field as UiFieldGroup,
} from '@meith/ui'
import { Button } from '@meith/ui/button'

import { Field, useFocusOnFail } from '@/components/auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '@/components/shell/copy'

type FieldControl = Parameters<React.ComponentProps<typeof UiFieldGroup>['children']>[0]

import { type InstallFormState, installAction } from '@/server/install-actions'

const EMPTY: InstallFormState = {}

export interface InstallMailPreset {
  readonly id: string
  readonly label: string
  readonly transport: 'http' | 'smtp'
  readonly note: string
  readonly host?: string | undefined
  readonly port?: number | undefined
  readonly endpoint?: string | undefined
  readonly username?: string | undefined
}

export interface InstallStepView {
  readonly id: string
  readonly title: string
  readonly detail: string
}

export interface InstallStepOutcome {
  readonly id: string
  readonly status: 'pending' | 'done' | 'failed'
}

const SKIP = 'skip'

const FIELD_LABEL_KEYS: Record<string, string> = {
  boardName: 'install.field.boardName',
  boardUrl: 'install.field.boardUrl',
  username: 'install.field.username',
  email: 'install.field.email',
  password: 'install.field.password',
  mailPreset: 'install.field.mailPreset',
  mailFrom: 'install.field.mailFrom',
  mailUsername: 'install.field.mailUsername',
  mailSecret: 'install.field.mailSecret',
  mailHost: 'install.field.mailHost',
  mailPort: 'install.field.mailPort',
  mailSecurity: 'install.field.mailSecurity',
  mailEndpoint: 'install.field.mailEndpoint',
}

const FOLDED_FIELDS = ['mailHost', 'mailPort', 'mailSecurity', 'mailEndpoint']

export function InstallForm({
  presets,
  steps,
  initialReport,
  mailIsFromEnvironment,
  suggestedBoardUrl,
  boardUrlIsFromEnvironment,
  copy,
}: {
  presets: readonly InstallMailPreset[]
  steps: readonly InstallStepView[]
  initialReport: readonly InstallStepOutcome[]
  suggestedBoardUrl: string
  boardUrlIsFromEnvironment: boolean
  mailIsFromEnvironment: boolean
  copy: Copy
}) {
  const [state, submit, pending] = useActionState(installAction, EMPTY)

  const failed = state.failedStep !== undefined

  return (
    <form action={submit} className="flex flex-col gap-6">
      <FormSection
        n={1}
        title={fromCopy(copy, 'install.board.title')}
        hint={fromCopy(copy, 'install.board.hint')}
      >
        <Field
          name="boardName"
          id="boardName"
          label={fromCopy(copy, 'install.boardName.label')}
          defaultValue={state.values?.boardName ?? ''}
          error={state.errors?.boardName}
          autoComplete="organization"
          hint={fromCopy(copy, 'install.boardName.hint')}
        />
        {boardUrlIsFromEnvironment ? (
          <Alert tone="info">
            <AlertDescription>
              {copy['install.urlFromEnvLead']}
              <code>APP_URL</code>
              {copy['install.urlFromEnvTail']}
            </AlertDescription>
          </Alert>
        ) : (
          <Field
            name="boardUrl"
            id="boardUrl"
            label={fromCopy(copy, 'install.boardUrl.label')}
            type="url"
            defaultValue={state.values?.boardUrl ?? suggestedBoardUrl}
            error={state.errors?.boardUrl}
            hint={fromCopy(copy, 'install.boardUrl.hint')}
          />
        )}
      </FormSection>

      <FormSection
        n={2}
        title={fromCopy(copy, 'install.account.title')}
        hint={fromCopy(copy, 'install.account.hint')}
      >
        <Field
          name="username"
          id="username"
          label={fromCopy(copy, 'install.username.label')}
          defaultValue={state.values?.username ?? ''}
          error={state.errors?.username}
          autoComplete="username"
          hint={fromCopy(copy, 'install.username.hint')}
        />
        <Field
          name="email"
          id="email"
          label={fromCopy(copy, 'install.email.label')}
          type="email"
          defaultValue={state.values?.email ?? ''}
          error={state.errors?.email}
          autoComplete="email"
          hint={fromCopy(copy, 'install.email.hint')}
        />
        <Field
          name="password"
          id="password"
          label={fromCopy(copy, 'install.password.label')}
          type="password"
          defaultValue=""
          error={state.errors?.password}
          autoComplete="new-password"
          hint={fromCopy(copy, 'install.password.hint')}
        />
      </FormSection>

      {mailIsFromEnvironment ? (
        <FormSection
          n={3}
          title={fromCopy(copy, 'install.mail.title')}
          hint={fromCopy(copy, 'install.mail.envHint')}
        >
          <Alert tone="info">
            <AlertDescription>
              {copy['install.mailFromEnvLead']}
              <code>MAIL_DRIVER</code>
              {copy['install.mailFromEnvTail']}
            </AlertDescription>
          </Alert>
        </FormSection>
      ) : (
        <MailSection presets={presets} state={state} copy={copy} />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Outcome state={state} copy={copy} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              {pending
                ? fromCopy(copy, 'install.submit.installing')
                : failed
                  ? fromCopy(copy, 'install.submit.tryAgain')
                  : fromCopy(copy, 'install.submit.install')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pending
                ? fromCopy(copy, 'install.submit.pendingNote')
                : fromCopy(copy, 'install.submit.idleNote')}
            </p>
          </div>

          <StepReport steps={steps} report={state.report ?? initialReport} copy={copy} />
        </CardContent>
      </Card>
    </form>
  )
}

function FormSection({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint: string
  children: React.ReactNode
}) {
  const id = `install-section-${n}`
  return (
    <Card aria-labelledby={id}>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle id={id}>{title}</CardTitle>
          <CardDescription>{hint}</CardDescription>
        </div>
        <CardAction>
          <Badge aria-hidden tone="outline" className="font-mono">
            {n}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

function StepReport({
  steps,
  report,
  copy,
}: {
  steps: readonly InstallStepView[]
  report: readonly InstallStepOutcome[]
  copy: Copy
}) {
  const statusOf = (id: string) => report.find((outcome) => outcome.id === id)?.status ?? 'pending'
  const anyFailed = report.some((outcome) => outcome.status === 'failed')

  return (
    <Disclosure
      open={anyFailed}
      summary={
        anyFailed ? fromCopy(copy, 'install.steps.howFar') : fromCopy(copy, 'install.steps.what')
      }
      aside={
        anyFailed ? undefined : formatFromCopy(copy, 'install.steps.count', { count: steps.length })
      }
      contentClassName="p-4"
    >
      <ol className="flex flex-col gap-2 text-sm">
        {steps.map((step, index) => {
          const status = statusOf(step.id)
          return (
            <li key={step.id} className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
              <span className="flex-1">
                <span className="font-medium">{step.title}</span>
                {status === 'done' && (
                  <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">
                    {' '}
                    {fromCopy(copy, 'install.steps.done')}
                  </span>
                )}
                {status === 'failed' && (
                  <span className="ml-2 font-mono text-xs uppercase text-destructive">
                    {' '}
                    {fromCopy(copy, 'install.steps.failed')}
                  </span>
                )}
                {status === 'pending' && anyFailed && (
                  <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">
                    {' '}
                    {fromCopy(copy, 'install.steps.notRun')}
                  </span>
                )}
                <span className="block text-muted-foreground">{step.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </Disclosure>
  )
}

function Outcome({ state, copy }: { state: InstallFormState; copy: Copy }) {
  const fieldErrors = Object.entries(state.errors ?? {}).filter(([name]) => name !== 'form')
  const formError = state.errors?.form
  const failed = state.failedStep
  const hasError = formError !== undefined || failed !== undefined || fieldErrors.length > 0
  const ref = useFocusOnFail<HTMLDivElement>(hasError)

  if (!hasError) return null

  return (
    <Alert tone="error" ref={ref} tabIndex={-1} className="flex-col items-stretch gap-2">
      <AlertDescription>
        {failed !== undefined ? (
          <>
            <AlertTitle>
              {formatFromCopy(copy, 'install.outcome.didNotFinish', { title: failed.title })}
            </AlertTitle>{' '}
            {fieldErrors.length > 0 ? fromCopy(copy, 'install.outcome.oneAnswer') : failed.error}
          </>
        ) : (
          <AlertTitle>
            {formError ??
              formatFromCopy(copy, 'install.outcome.answers', { count: fieldErrors.length })}
          </AlertTitle>
        )}

        {fieldErrors.length > 0 && (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {fieldErrors.map(([name, message]) => (
              <li key={name}>
                <a href={`#${name}`} className="font-medium underline">
                  {fromCopy(copy, FIELD_LABEL_KEYS[name] ?? name)}
                </a>
                {' — '}
                {message}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          {fromCopy(copy, 'install.outcome.passwords')}
        </p>
      </AlertDescription>
    </Alert>
  )
}

function MailSection({
  presets,
  state,
  copy,
}: {
  presets: readonly InstallMailPreset[]
  state: InstallFormState
  copy: Copy
}) {
  const chosen = state.values?.mailPreset ?? SKIP
  const foldedError = FOLDED_FIELDS.some((name) => state.errors?.[name] !== undefined)

  return (
    <FormSection
      n={3}
      title={fromCopy(copy, 'install.mail.title')}
      hint={fromCopy(copy, 'install.mail.optionalHint')}
    >
      <p className="text-sm text-muted-foreground">
        {copy['install.mail.testNoteLead']}
        <em>{fromCopy(copy, 'install.mail.testNoteBefore')}</em>
        {copy['install.mail.testNoteTail']}
      </p>

      {state.errors?.mailPreset !== undefined && (
        <Alert tone="error">
          <AlertDescription>{state.errors.mailPreset}</AlertDescription>
        </Alert>
      )}

      <UiFieldGroup
        name="mailPreset"
        id="mailPreset"
        label={fromCopy(copy, 'install.mail.how')}
        error={state.errors?.mailPreset ?? null}
      >
        {(control: FieldControl) => (
          <NativeSelect {...control} defaultValue={chosen}>
            <option value={SKIP}>{fromCopy(copy, 'install.mail.skip')}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </UiFieldGroup>

      <Disclosure summary={fromCopy(copy, 'install.mail.needs')}>
        <ul className="flex flex-col gap-2 text-sm">
          {presets.map((preset) => (
            <li key={preset.id}>
              <span className="font-medium">{preset.label}</span>
              <span className="text-muted-foreground"> — {preset.note}</span>
            </li>
          ))}
        </ul>
      </Disclosure>

      <Field
        name="mailFrom"
        id="mailFrom"
        label={fromCopy(copy, 'install.mailFrom.label')}
        type="email"
        required={false}
        defaultValue={state.values?.mailFrom ?? ''}
        error={state.errors?.mailFrom}
        hint={fromCopy(copy, 'install.mailFrom.hint')}
      />

      <Field
        name="mailUsername"
        id="mailUsername"
        label={fromCopy(copy, 'install.mailUsername.label')}
        required={false}
        autoComplete="off"
        defaultValue={state.values?.mailUsername ?? ''}
        error={state.errors?.mailUsername}
        hint={fromCopy(copy, 'install.mailUsername.hint')}
      />

      <Field
        name="mailSecret"
        id="mailSecret"
        label={fromCopy(copy, 'install.mailSecret.label')}
        type="password"
        required={false}
        autoComplete="new-password"
        defaultValue=""
        error={state.errors?.mailSecret}
        hint={fromCopy(copy, 'install.mailSecret.hint')}
      />

      <Disclosure open={foldedError} summary={fromCopy(copy, 'install.mail.serverDetails')}>
        <div className="flex flex-col gap-4">
          <Field
            name="mailHost"
            id="mailHost"
            label={fromCopy(copy, 'install.mailHost.label')}
            required={false}
            defaultValue={state.values?.mailHost ?? ''}
            error={state.errors?.mailHost}
            hint={fromCopy(copy, 'install.mailHost.hint')}
          />

          <div className="flex flex-wrap gap-4">
            <div className="w-28">
              <Field
                name="mailPort"
                id="mailPort"
                label={fromCopy(copy, 'install.mailPort.label')}
                required={false}
                defaultValue={state.values?.mailPort ?? ''}
                error={state.errors?.mailPort}
              />
            </div>
            <UiFieldGroup
              name="mailSecurity"
              id="mailSecurity"
              label={fromCopy(copy, 'install.mailSecurity.label')}
              className="min-w-56 flex-1"
              error={state.errors?.mailSecurity ?? null}
            >
              {(control: FieldControl) => (
                <NativeSelect {...control} defaultValue={state.values?.mailSecurity ?? ''}>
                  <option value="">{fromCopy(copy, 'install.mailSecurity.default')}</option>
                  <option value="starttls">
                    {fromCopy(copy, 'install.mailSecurity.starttls')}
                  </option>
                  <option value="tls">{fromCopy(copy, 'install.mailSecurity.tls')}</option>
                  <option value="none">{fromCopy(copy, 'install.mailSecurity.none')}</option>
                </NativeSelect>
              )}
            </UiFieldGroup>
          </div>

          <Field
            name="mailEndpoint"
            id="mailEndpoint"
            label={fromCopy(copy, 'install.mailEndpoint.label')}
            required={false}
            defaultValue={state.values?.mailEndpoint ?? ''}
            error={state.errors?.mailEndpoint}
            hint={fromCopy(copy, 'install.mailEndpoint.hint')}
          />
        </div>
      </Disclosure>
    </FormSection>
  )
}
