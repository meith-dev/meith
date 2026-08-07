'use client'

/**
 * F83 — the install form.
 *
 * A client component for exactly one reason: `useActionState`, which is how
 * every form on this board reports a validation error. It is otherwise a plain
 * `<form>` with named inputs posting to a Server Action, so it works with
 * scripting disabled — the field errors arrive on the re-rendered page rather
 * than beside the input, which is the documented no-JS trade (R5).
 *
 * That matters more here than anywhere else: this is the first page a new
 * operator loads, on a fresh deployment, possibly from a phone on a bad
 * connection. An installer that needs JavaScript to submit is an installer that
 * sometimes cannot.
 *
 * ## Why a failure is summarised beside the button rather than only at the field
 *
 * React empties both password boxes after every submit, because they are the
 * two values this form deliberately never renders back. On a failed submit that
 * is the *only* change an operator standing at the bottom of a long form can
 * see: the message explaining why is beside a field that may be a screen and a
 * half above them, and — when the environment owns the field — may not be on the
 * page at all. That combination produced a form that appeared to clear the
 * password and do nothing.
 *
 * So every failure is also stated where the button is, as a list of what needs
 * changing, each item linking to its field. It lists whatever came back, not a
 * fixed set, which is what makes a message about a box this page does not render
 * impossible to lose.
 *
 * ## The mail section, and why the fiddly half is folded away
 *
 * With no scripting there is nothing to hide the SMTP fields when the operator
 * picks an API provider, so the questions everybody answers are on the page —
 * how mail is sent, who it comes from, and the one credential — and the boxes
 * that exist only to override what the chosen provider already knows are in a
 * `<details>`, which needs no scripting to open. It opens itself when something
 * inside it is wrong.
 *
 * The presets arrive as a prop rather than being imported here. They live in
 * `@meith/settings` next to the config they prefill, and importing that module
 * into a client component would pull the whole settings registry — zod included
 * — into the browser bundle for the sake of eight strings.
 */

import { useActionState } from 'react'

import { installAction, type InstallFormState } from '@/server/install-actions'

const EMPTY: InstallFormState = {}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** The subset of `MailPreset` the form needs. Kept structural to avoid the import. */
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

/** Mirrors `MAIL_SKIP`. A literal here so the client bundle imports nothing. */
const SKIP = 'skip'

/**
 * What each field is called in the summary beside the button.
 *
 * The label the field carries, so the list names the box the operator is being
 * sent to. Anything not on this list is shown under its own name rather than
 * dropped — an error with no label is still an error, and losing it is the
 * failure this summary exists to prevent.
 */
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

/** The boxes behind the “server details” fold, so an error can open it. */
const FOLDED_FIELDS = ['mailHost', 'mailPort', 'mailSecurity', 'mailEndpoint']

export function InstallForm({
  presets,
  mailIsFromEnvironment,
  suggestedBoardUrl,
  boardUrlIsFromEnvironment,
}: {
  presets: readonly InstallMailPreset[]
  /**
   * The origin this page was served from, as a *suggestion*.
   *
   * It comes from the request's `Host`, which is attacker-controlled, so it is
   * prefilled into a visible box the operator submits rather than stored
   * unread — see `board-url.ts`. Confirming it is the whole safety property.
   */
  suggestedBoardUrl: string
  /**
   * `APP_URL` is set, so the box below would be ignored — and is not rendered.
   *
   * The action substitutes the environment's value server-side rather than
   * asking the browser to post it back in a hidden input, which is both safer
   * and the reason a hidden field is not the fix here: see
   * `withEnvironmentAnswers`.
   */
  boardUrlIsFromEnvironment: boolean
  /**
   * `MAIL_DRIVER` is set, so the environment decides and these boxes would be
   * ignored. The section is replaced by a statement of that rather than being
   * rendered and discarded — a form whose values go nowhere is worse than no
   * form, because the operator believes they have configured something.
   */
  mailIsFromEnvironment: boolean
}) {
  const [state, submit, pending] = useActionState(installAction, EMPTY)

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="text-xl font-semibold tracking-tight">Your board</h2>

      <Field
        name="boardName"
        label="Board name"
        defaultValue={state.values?.boardName ?? ''}
        error={state.errors?.boardName}
        autoComplete="organization"
      />
      {boardUrlIsFromEnvironment ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          The board’s address comes from <code>APP_URL</code> in this deployment’s
          environment, which overrides anything stored on the board.
        </p>
      ) : (
        <Field
          name="boardUrl"
          label="Board address"
          type="url"
          defaultValue={state.values?.boardUrl ?? suggestedBoardUrl}
          error={state.errors?.boardUrl}
          hint="Every link the board sends is built from this. Filled in from the address you are reading — check it."
        />
      )}

      <Field
        name="username"
        label="Administrator’s name"
        defaultValue={state.values?.username ?? ''}
        error={state.errors?.username}
        autoComplete="username"
      />
      <Field
        name="email"
        label="Administrator’s e-mail"
        type="email"
        defaultValue={state.values?.email ?? ''}
        error={state.errors?.email}
        autoComplete="email"
        hint="The test message below goes here, so use an address you can read now."
      />
      <Field
        name="password"
        label="Administrator’s password"
        type="password"
        /*
         * Never echoed back on a failed submit — unlike the three fields above,
         * which are. A password re-rendered into HTML is a password in a proxy
         * log and in the browser's back-forward cache.
         */
        defaultValue=""
        error={state.errors?.password}
        autoComplete="new-password"
        hint="At least 12 characters. This account can reconfigure the board."
      />

      {mailIsFromEnvironment ? (
        <section className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
          <h3 className="text-base font-semibold tracking-tight">Sending mail</h3>
          <p className="text-sm text-muted-foreground">
            <code>MAIL_DRIVER</code> is set in this deployment’s environment, which
            overrides anything stored on the board. Mail is configured there and cannot be
            changed from this form or from the settings screen — unset it if you would
            rather configure mail on the board.
          </p>
        </section>
      ) : (
        <MailSection presets={presets} state={state} />
      )}

      <Outcome state={state} />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Installing…' : 'Install'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pressing this applies every migration and creates the account above. When
        it finishes, this page stops existing.
      </p>
    </form>
  )
}

/**
 * What happened, next to the button that made it happen.
 *
 * Renders nothing at all when there is nothing to say, so a first visit is not
 * greeted by an empty box. The failed *step* takes the headline when there is
 * one, because "which step" tells the operator how far the board got and
 * therefore whether trying again is safe — the steps are listed above this form.
 */
function Outcome({ state }: { state: InstallFormState }) {
  const fieldErrors = Object.entries(state.errors ?? {}).filter(([name]) => name !== 'form')
  const formError = state.errors?.form
  const failed = state.failedStep

  if (formError === undefined && failed === undefined && fieldErrors.length === 0) return null

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm"
    >
      {failed !== undefined ? (
        <p>
          <span className="font-medium">The “{failed.id}” step failed.</span> {failed.error}
        </p>
      ) : (
        <p className="font-medium">
          {formError ??
            (fieldErrors.length === 1
              ? 'Nothing has been installed — one answer needs changing.'
              : `Nothing has been installed — ${fieldErrors.length} answers need changing.`)}
        </p>
      )}

      {fieldErrors.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {fieldErrors.map(([name, message]) => (
            <li key={name}>
              {/*
                An anchor rather than a scripted focus: it is a link to an id on
                the page, so it works with scripting off and it opens the
                `<details>` around a folded field in every browser that supports
                fragment navigation into one — which is also why that fold opens
                itself below when it contains an error.
              */}
              <a href={`#${name}`} className="font-medium underline">
                {FIELD_LABELS[name] ?? name}
              </a>
              {' — '}
              {message}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Passwords are never sent back to this page, so any you typed are empty
        again. Retype them before pressing Install.
      </p>
    </div>
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
  /* Folded away, but never folded over a message. */
  const foldedError = FOLDED_FIELDS.some((name) => state.errors?.[name] !== undefined)

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border p-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">Sending mail</h3>
        <p className="text-sm text-muted-foreground">
          Nothing is installed until a test message reaches the address above, so a wrong
          key here costs a retry rather than a broken board. You can skip this and set it
          up later — but until you do, nobody can reset a forgotten password, including
          you.
        </p>
      </div>

      {state.errors?.mailPreset !== undefined && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm"
        >
          {state.errors.mailPreset}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm" htmlFor="mailPreset">
        <span className="font-medium">How mail is sent</span>
        <select id="mailPreset" name="mailPreset" defaultValue={chosen} className={INPUT}>
          <option value={SKIP}>Skip for now — this board sends no mail</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      {/*
        Every provider's caveat, in one place, expanded by default for nobody.

        A `<details>` rather than the note for the current choice, because
        without scripting there is no "current choice" until the form is
        submitted. Collapsed so the section stays short for the operator who is
        skipping, and openable by the one who is not — and the thing it says
        about all of them is the thing that matters: the domain has to be
        verified with the provider first, and this board cannot do that step.
      */}
      <details className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">
          What each of these needs before it will send
        </summary>
        <ul className="mt-2 flex flex-col gap-2">
          {presets.map((preset) => (
            <li key={preset.id}>
              <span className="font-medium">{preset.label}</span>
              <span className="text-muted-foreground"> — {preset.note}</span>
            </li>
          ))}
        </ul>
      </details>

      <Field
        name="mailFrom"
        label="Sender address"
        type="email"
        optional
        defaultValue={state.values?.mailFrom ?? ''}
        error={state.errors?.mailFrom}
        hint="Must be on a domain the provider has verified. Not needed if you are skipping."
      />

      <Field
        name="mailUsername"
        label="Username"
        optional
        autoComplete="off"
        defaultValue={state.values?.mailUsername ?? ''}
        error={state.errors?.mailUsername}
        hint="For the SMTP choices. Leave blank when the choice above already knows it, and for the API choices."
      />

      <Field
        name="mailSecret"
        label="Password or API key"
        type="password"
        optional
        autoComplete="new-password"
        /* Retyped rather than echoed, on the administrator's password's reasoning. */
        defaultValue=""
        error={state.errors?.mailSecret}
        hint="Whichever the choice above uses — an app password for SMTP, or the provider’s API key."
      />

      {/*
        The overrides. Every box here has an answer the chosen provider already
        supplies, so the operator who picks a preset never opens this — and the
        one running their own relay, or working around a hostname a provider has
        moved since this release, finds all four together.
      */}
      <details
        open={foldedError}
        className="rounded-md border border-border px-3 py-2 text-sm"
      >
        <summary className="cursor-pointer font-medium">
          Server details — only if yours differ from the choice above
        </summary>

        <div className="mt-3 flex flex-col gap-4">
          <Field
            name="mailHost"
            label="SMTP host"
            optional
            defaultValue={state.values?.mailHost ?? ''}
            error={state.errors?.mailHost}
            hint="Leave blank to use the host the choice above already knows."
          />

          <div className="flex flex-wrap gap-4">
            <div className="w-28">
              <Field
                name="mailPort"
                label="Port"
                optional
                inputMode="numeric"
                defaultValue={state.values?.mailPort ?? ''}
                error={state.errors?.mailPort}
              />
            </div>
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm" htmlFor="mailSecurity">
              <span className="font-medium">Security</span>
              <select
                id="mailSecurity"
                name="mailSecurity"
                defaultValue={state.values?.mailSecurity ?? ''}
                className={INPUT}
              >
                <option value="">Whatever the choice above uses</option>
                <option value="starttls">STARTTLS, required (port 587)</option>
                <option value="tls">Implicit TLS (port 465)</option>
                <option value="none">None — local relay only</option>
              </select>
            </label>
          </div>

          <Field
            name="mailEndpoint"
            label="API endpoint"
            optional
            defaultValue={state.values?.mailEndpoint ?? ''}
            error={state.errors?.mailEndpoint}
            hint="For the API choices. Leave blank to use the endpoint the choice above already knows."
          />
        </div>
      </details>
    </section>
  )
}

function Field({
  name,
  label,
  error,
  hint,
  type = 'text',
  defaultValue,
  autoComplete,
  inputMode,
  optional = false,
}: {
  name: string
  label: string
  error?: string | undefined
  hint?: string | undefined
  type?: string
  defaultValue: string
  autoComplete?: string
  inputMode?: 'numeric'
  /**
   * Not required by the browser.
   *
   * Every mail field is optional at this level because which of them are needed
   * depends on a `<select>` this page cannot read without scripting. The server
   * asks for the right ones; `required` here would only ever be wrong.
   */
  optional?: boolean
}) {
  const describedBy = [error !== undefined ? `${name}-error` : null, hint !== undefined ? `${name}-hint` : null]
    .filter((id): id is string => id !== null)
    .join(' ')

  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={name}>
      <span className="font-medium">{label}</span>
      <input
        /* The id is what the failure summary's links point at. */
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={!optional}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={INPUT}
      />
      {hint !== undefined && (
        <span id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  )
}
