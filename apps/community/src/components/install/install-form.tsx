'use client'

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
  Field as UiFieldGroup,
  NativeSelect,
} from '@meith/ui'
import { Button } from '@meith/ui/button'
import { useActionState } from 'react'

import { Field } from '@/components/auth/form-controls'

type FieldControl = Parameters<React.ComponentProps<typeof UiFieldGroup>['children']>[0]
import { installAction, type InstallFormState } from '@/server/install-actions'

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

const FIELD_LABELS: Record<string, string> = {
  boardName: 'Board name',
  boardUrl: 'Board address',
  username: 'Administrator’s name',
  email: 'Administrator’s e-mail',
  password: 'Administrator’s password',
  mailPreset: 'How mail is sent',
  mailFrom: 'Sender address',
  mailUsername: 'Mail username',
  mailSecret: 'Mail password or API key',
  mailHost: 'SMTP host',
  mailPort: 'Port',
  mailSecurity: 'Security',
  mailEndpoint: 'API endpoint',
}

const FOLDED_FIELDS = ['mailHost', 'mailPort', 'mailSecurity', 'mailEndpoint']

export function InstallForm({
  presets,
  steps,
  initialReport,
  reservedUsernames,
  mailIsFromEnvironment,
  suggestedBoardUrl,
  boardUrlIsFromEnvironment,
}: {
  presets: readonly InstallMailPreset[]
  steps: readonly InstallStepView[]
  initialReport: readonly InstallStepOutcome[]
  reservedUsernames: readonly string[]
  suggestedBoardUrl: string
  boardUrlIsFromEnvironment: boolean
  mailIsFromEnvironment: boolean
}) {
  const [state, submit, pending] = useActionState(installAction, EMPTY)

  const failed = state.failedStep !== undefined

  return (
    <form action={submit} className="flex flex-col gap-6">
      <FormSection n={1} title="Your board" hint="What it is called, and where it lives.">
        <Field
          name="boardName"
          id="boardName"
          label="Board name"
          defaultValue={state.values?.boardName ?? ''}
          error={state.errors?.boardName}
          autoComplete="organization"
          hint="Shown in the header, in the page title, and on every message it sends."
        />
        {boardUrlIsFromEnvironment ? (
          <Alert tone="info">
            <AlertDescription>
              The board’s address comes from <code>APP_URL</code> in this deployment’s
              environment, which overrides anything stored on the board.
            </AlertDescription>
          </Alert>
        ) : (
          <Field
            name="boardUrl"
            id="boardUrl"
            label="Board address"
            type="url"
            defaultValue={state.values?.boardUrl ?? suggestedBoardUrl}
            error={state.errors?.boardUrl}
            hint="Every link the board sends is built from this. Filled in from the address you are reading — check it."
          />
        )}
      </FormSection>

      <FormSection
        n={2}
        title="Your account"
        hint="The first account on the board, and the only one that can reach the control panel."
      >
        <Field
          name="username"
          id="username"
          label="Your name on the board"
          defaultValue={state.values?.username ?? ''}
          error={state.errors?.username}
          autoComplete="username"
          hint={`This is what you post under. Reserved, so nothing can impersonate the board: ${reservedUsernames.join(', ')}.`}
        />
        <Field
          name="email"
          id="email"
          label="Your e-mail"
          type="email"
          defaultValue={state.values?.email ?? ''}
          error={state.errors?.email}
          autoComplete="email"
          hint="Where the test message goes, so use an address you can read now."
        />
        <Field
          name="password"
          id="password"
          label="Your password"
          type="password"
          defaultValue=""
          error={state.errors?.password}
          autoComplete="new-password"
          hint="At least 12 characters. Nothing on this board can reset it until mail works."
        />
      </FormSection>

      {mailIsFromEnvironment ? (
        <FormSection n={3} title="Sending mail" hint="Decided by this deployment’s environment.">
          <Alert tone="info">
            <AlertDescription>
              <code>MAIL_DRIVER</code> is set in this deployment’s environment, which
              overrides anything stored on the board. Mail is configured there and cannot
              be changed from this form or from the settings screen — unset it if you
              would rather configure mail on the board.
            </AlertDescription>
          </Alert>
        </FormSection>
      ) : (
        <MailSection presets={presets} state={state} />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Outcome state={state} />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              {pending ? 'Installing…' : failed ? 'Try again' : 'Install'}
            </Button>
            <p className="text-xs text-muted-foreground">
              {pending
                ? 'Applying migrations. This can take a few seconds — do not reload.'
                : 'Takes a few seconds. When it finishes, this page stops existing.'}
            </p>
          </div>

          <StepReport steps={steps} report={state.report ?? initialReport} />
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
}: {
  steps: readonly InstallStepView[]
  report: readonly InstallStepOutcome[]
}) {
  const statusOf = (id: string) =>
    report.find((outcome) => outcome.id === id)?.status ?? 'pending'
  const anyFailed = report.some((outcome) => outcome.status === 'failed')

  return (
    <Disclosure
      open={anyFailed}
      summary={anyFailed ? 'How far it got' : 'What installing does'}
      aside={anyFailed ? undefined : `${steps.length} steps`}
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
                    done
                  </span>
                )}
                {status === 'failed' && (
                  <span className="ml-2 font-mono text-xs uppercase text-destructive">
                    {' '}
                    failed
                  </span>
                )}
                {status === 'pending' && anyFailed && (
                  <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">
                    {' '}
                    not run
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

function Outcome({ state }: { state: InstallFormState }) {
  const fieldErrors = Object.entries(state.errors ?? {}).filter(([name]) => name !== 'form')
  const formError = state.errors?.form
  const failed = state.failedStep

  if (formError === undefined && failed === undefined && fieldErrors.length === 0) return null

  return (
    <Alert tone="error" className="flex-col items-stretch gap-2">
      <AlertDescription>
        {failed !== undefined ? (
          <>
            <AlertTitle>“{failed.title}” did not finish.</AlertTitle>{' '}
            {fieldErrors.length > 0 ? 'One answer needs changing:' : failed.error}
          </>
        ) : (
          <AlertTitle>
            {formError ??
              (fieldErrors.length === 1
                ? 'Nothing has been installed — one answer needs changing.'
                : `Nothing has been installed — ${fieldErrors.length} answers need changing.`)}
          </AlertTitle>
        )}

        {fieldErrors.length > 0 && (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {fieldErrors.map(([name, message]) => (
              <li key={name}>
                <a href={`#${name}`} className="font-medium underline">
                  {FIELD_LABELS[name] ?? name}
                </a>
                {' — '}
                {message}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Passwords are never sent back to this page, so any you typed are empty
          again — retype them.
        </p>
      </AlertDescription>
    </Alert>
  )
}

function MailSection({
  presets,
  state,
}: {
  presets: readonly InstallMailPreset[]
  state: InstallFormState
}) {
  const chosen = state.values?.mailPreset ?? SKIP
  const foldedError = FOLDED_FIELDS.some((name) => state.errors?.[name] !== undefined)

  return (
    <FormSection
      n={3}
      title="Sending mail"
      hint="Optional, and the one thing that is harder to add later than now."
    >
      <p className="text-sm text-muted-foreground">
        A test message is sent to the address above <em>before</em> anything is
        written, so a wrong key costs a retry rather than a board that cannot mail
        anybody.
      </p>

      {state.errors?.mailPreset !== undefined && (
        <Alert tone="error">
          <AlertDescription>{state.errors.mailPreset}</AlertDescription>
        </Alert>
      )}

      <UiFieldGroup
        name="mailPreset"
        id="mailPreset"
        label="How mail is sent"
        error={state.errors?.mailPreset ?? null}
      >
        {(control: FieldControl) => (
          <NativeSelect {...control} defaultValue={chosen}>
            <option value={SKIP}>Skip for now — this board sends no mail</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </UiFieldGroup>

      <Disclosure summary="What each of these needs before it will send">
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
        label="Sender address"
        type="email"
        required={false}
        defaultValue={state.values?.mailFrom ?? ''}
        error={state.errors?.mailFrom}
        hint="Must be on a domain the provider has verified. Not needed if you are skipping."
      />

      <Field
        name="mailUsername"
        id="mailUsername"
        label="Username"
        required={false}
        autoComplete="off"
        defaultValue={state.values?.mailUsername ?? ''}
        error={state.errors?.mailUsername}
        hint="For the SMTP choices. Leave blank when the choice above already knows it, and for the API choices."
      />

      <Field
        name="mailSecret"
        id="mailSecret"
        label="Password or API key"
        type="password"
        required={false}
        autoComplete="new-password"
        defaultValue=""
        error={state.errors?.mailSecret}
        hint="Whichever the choice above uses — an app password for SMTP, or the provider’s API key."
      />

      <Disclosure
        open={foldedError}
        summary="Server details — only if yours differ from the choice above"
      >
        <div className="flex flex-col gap-4">
          <Field
            name="mailHost"
            id="mailHost"
            label="SMTP host"
            required={false}
            defaultValue={state.values?.mailHost ?? ''}
            error={state.errors?.mailHost}
            hint="Leave blank to use the host the choice above already knows."
          />

          <div className="flex flex-wrap gap-4">
            <div className="w-28">
              <Field
                name="mailPort"
                id="mailPort"
                label="Port"
                required={false}
                defaultValue={state.values?.mailPort ?? ''}
                error={state.errors?.mailPort}
              />
            </div>
            <UiFieldGroup
              name="mailSecurity"
              id="mailSecurity"
              label="Security"
              className="min-w-56 flex-1"
              error={state.errors?.mailSecurity ?? null}
            >
              {(control: FieldControl) => (
                <NativeSelect {...control} defaultValue={state.values?.mailSecurity ?? ''}>
                  <option value="">Whatever the choice above uses</option>
                  <option value="starttls">STARTTLS, required (port 587)</option>
                  <option value="tls">Implicit TLS (port 465)</option>
                  <option value="none">None — local relay only</option>
                </NativeSelect>
              )}
            </UiFieldGroup>
          </div>

          <Field
            name="mailEndpoint"
            id="mailEndpoint"
            label="API endpoint"
            required={false}
            defaultValue={state.values?.mailEndpoint ?? ''}
            error={state.errors?.mailEndpoint}
            hint="For the API choices. Leave blank to use the endpoint the choice above already knows."
          />
        </div>
      </Disclosure>
    </FormSection>
  )
}
