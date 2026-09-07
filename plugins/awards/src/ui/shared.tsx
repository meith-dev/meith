import type { PluginPageContext } from '@meith/plugin-kit'
import { buttonVariants, controlVariants } from '@meith/ui'

import { type AwardDraft, ICON_PATHS } from '../awards'
import en from '../messages/en.json'

export type TextContext = Pick<PluginPageContext, 't' | 'locale'>
export function translated(context: TextContext, key: keyof typeof en): string {
  return context.t.has(key) ? context.t.t(key) : en[key]
}
export function date(context: TextContext, value: Date | string): string {
  return new Intl.DateTimeFormat(context.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  )
}
export function icon(award: Pick<AwardDraft, 'icon' | 'icon_kind'>) {
  if (award.icon_kind === 'image')
    return (
      <img
        src={award.icon}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        className="inline-block size-6 object-contain"
      />
    )
  if (award.icon_kind === 'svg')
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={ICON_PATHS[award.icon as keyof typeof ICON_PATHS]} />
      </svg>
    )
  return (
    <span aria-hidden="true" className="text-xl">
      {award.icon}
    </span>
  )
}
export function field(
  context: TextContext,
  name: string,
  key: keyof typeof en,
  value: string | number = '',
  type = 'text',
  required = false,
) {
  return (
    <label className="flex flex-col gap-1">
      {translated(context, key)}
      <input
        className={controlVariants()}
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        {...(type === 'number' ? { min: 0, max: 2147483647, step: 1 } : {})}
      />
    </label>
  )
}
export function checkbox(
  context: TextContext,
  name: string,
  key: keyof typeof en,
  checked: boolean,
) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} />
      {translated(context, key)}
    </label>
  )
}
export function button(context: TextContext, key: keyof typeof en) {
  return (
    <button type="submit" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
      {translated(context, key)}
    </button>
  )
}
export function action(
  context: TextContext,
  route: string,
  id: number,
  value: string,
  key: keyof typeof en,
) {
  return (
    <form method="post" action={`/admin/api/plugins/awards/${route}`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={value} />
      {button(context, key)}
    </form>
  )
}
export function notice(context: TextContext, value: string | undefined) {
  const notices = {
    evaluated: 'awards.notice.evaluated',
    reset: 'awards.notice.reset',
    'rule-invalid': 'awards.notice.rule-invalid',
    'rule-empty': 'awards.notice.rule-empty',
    'rule-missing': 'awards.notice.rule-missing',
    'rule-saved': 'awards.notice.rule-saved',
    already: 'awards.notice.already',
    deleted: 'awards.notice.deleted',
    granted: 'awards.notice.granted',
    held: 'awards.notice.held',
    icon: 'awards.notice.icon',
    invalid: 'awards.notice.invalid',
    missing: 'awards.notice.missing',
    multiple: 'awards.notice.multiple',
    partial: 'awards.notice.partial',
    revoked: 'awards.notice.revoked',
    saved: 'awards.notice.saved',
    unknown: 'awards.notice.unknown',
  } as const
  const key = notices[value as keyof typeof notices]
  return key !== undefined ? (
    <p role="status" className="rounded border p-3">
      {translated(context, key as keyof typeof en)}
    </p>
  ) : null
}
