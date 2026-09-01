'use client'

import { useActionState } from 'react'

import { TextLink } from '@meith/ui'
import { Popover } from '@meith/ui/popover'
import { Tabs } from '@meith/ui/tabs'

import type { FormState } from '@/server/auth-form-state'
import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  markAllNotificationsSeenAction,
  markMessagesSeenAction,
  markNotificationSeenAction,
} from '@/server/notification-menu-actions'
import type {
  NotificationMenuModel,
  NotificationMenuRow,
  NotificationMenuTab,
  NotificationMenuTabKind,
} from '@/view/notification-menu'

import { type Copy, formatFromCopy, fromCopy } from './copy'

const UNREAD_KEY: Readonly<Record<NotificationMenuTabKind, string>> = {
  notifications: 'board.notificationMenu.unreadNotifications',
  messages: 'board.notificationMenu.unreadMessages',
  mod: 'board.notificationMenu.unreadMod',
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0 0 10 2.5Z" />
      <path d="M8.5 14.5a1.75 1.75 0 0 0 3 0" />
    </svg>
  )
}

function CountPill({ value }: { value: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground tabular-nums"
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}

function HiddenFields({
  fields,
}: {
  fields: readonly { readonly name: string; readonly value: number }[]
}) {
  return (
    <>
      {fields.map((field) => (
        <input
          key={`${field.name}-${field.value}`}
          type="hidden"
          name={field.name}
          value={field.value}
        />
      ))}
    </>
  )
}

function SeenIconForm({
  action,
  hidden,
  label,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>
  hidden: readonly { readonly name: string; readonly value: number }[]
  label: string
}) {
  const [, formAction, isPending] = useActionState(action, EMPTY_STATE)

  return (
    <form action={formAction} className="shrink-0">
      <HiddenFields fields={hidden} />
      <button
        type="submit"
        disabled={isPending}
        title={label}
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        <span className="sr-only">{label}</span>
        <CheckIcon />
      </button>
    </form>
  )
}

function SeenForm({
  action,
  hidden,
  label,
  working,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>
  hidden: readonly { readonly name: string; readonly value: number }[]
  label: string
  working: string
}) {
  const [, formAction, isPending] = useActionState(action, EMPTY_STATE)

  return (
    <form action={formAction}>
      <HiddenFields fields={hidden} />
      <button
        type="submit"
        disabled={isPending}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {isPending ? working : label}
      </button>
    </form>
  )
}

function Row({
  row,
  kind,
  copy,
}: {
  row: NotificationMenuRow
  kind: NotificationMenuTabKind
  copy: Copy
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {row.tag !== null && (
            <span className="mr-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.tag}
            </span>
          )}
          {row.subject}
        </span>
        <time dateTime={row.at.iso} className="shrink-0 text-[0.6875rem] text-muted-foreground">
          {row.at.label}
        </time>
      </span>
      {row.meta !== null && (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.meta}</span>
      )}
    </>
  )

  return (
    <li className="flex items-center gap-1 rounded-md pr-1">
      {row.href === null ? (
        <span className="min-w-0 flex-1 px-2 py-2">{body}</span>
      ) : (
        <a
          href={row.href}
          className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {body}
        </a>
      )}

      {row.isUnread && row.seenId !== null && (
        <SeenIconForm
          action={kind === 'messages' ? markMessagesSeenAction : markNotificationSeenAction}
          hidden={[
            kind === 'messages'
              ? { name: 'copyId', value: row.seenId }
              : { name: 'notificationId', value: row.seenId },
          ]}
          label={fromCopy(copy, 'board.notificationMenu.markSeen')}
        />
      )}
    </li>
  )
}

function Panel({ tab, copy }: { tab: NotificationMenuTab; copy: Copy }) {
  const unreadRows = tab.rows.filter((row) => row.isUnread && row.seenId !== null)

  return (
    <Tabs.Panel
      value={tab.kind}
      className="flex flex-col gap-1 px-1 pb-1 focus-visible:outline-none"
    >
      {tab.rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{tab.emptyLabel}</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {tab.rows.map((row) => (
            <Row key={row.key} row={row} kind={tab.kind} copy={copy} />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-2 pt-2">
        <TextLink
          href={tab.allHref}
          size="xs"
          className="rounded-md px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'board.notificationMenu.viewAll')}
        </TextLink>

        {unreadRows.length > 0 && (
          <SeenForm
            action={
              tab.kind === 'messages' ? markMessagesSeenAction : markAllNotificationsSeenAction
            }
            hidden={
              tab.kind === 'messages'
                ? unreadRows.flatMap((row) =>
                    row.seenId === null ? [] : [{ name: 'copyId', value: row.seenId }],
                  )
                : []
            }
            label={fromCopy(copy, 'board.notificationMenu.markAllSeen')}
            working={fromCopy(copy, 'form.working')}
          />
        )}
      </div>
    </Tabs.Panel>
  )
}

export function NotificationMenu({ model, copy }: { model: NotificationMenuModel; copy: Copy }) {
  const first = model.tabs[0]?.kind ?? 'notifications'

  return (
    <div className="flex items-center">
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-notif="menu"]{display:none}[data-notif="plain"]{display:flex!important}</style>',
        }}
      />

      <span data-notif="menu" className="flex items-center">
        <Popover.Root>
          <Popover.Trigger className="relative inline-flex size-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <BellIcon />
            {model.total > 0 && (
              <span className="absolute -right-0.5 -top-0.5">
                <CountPill value={model.total} />
              </span>
            )}
            <span className="sr-only">
              {model.total > 0
                ? formatFromCopy(copy, 'board.notificationMenu.totalUnread', { count: model.total })
                : fromCopy(copy, 'board.notificationMenu.trigger')}
            </span>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Positioner
              align="end"
              sideOffset={8}
              collisionPadding={8}
              className="z-50 outline-none"
            >
              <Popover.Popup className="w-[min(22rem,calc(100vw-1rem))] origin-[var(--transform-origin)] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg transition-[opacity,transform] duration-100 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <Popover.Title className="text-sm font-semibold">
                    {fromCopy(copy, 'board.notificationMenu.heading')}
                  </Popover.Title>
                  <Popover.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <span className="sr-only">
                      {fromCopy(copy, 'board.notificationMenu.close')}
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 14 14"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="m3.5 3.5 7 7m0-7-7 7" />
                    </svg>
                  </Popover.Close>
                </div>

                <Tabs.Root defaultValue={first}>
                  <Tabs.List className="flex gap-1 border-b border-border p-2">
                    {model.tabs.map((tab) => (
                      <Tabs.Tab
                        key={tab.kind}
                        value={tab.kind}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {tab.label}
                        {tab.unread > 0 && (
                          <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-current/20 px-1 text-[0.625rem] font-semibold leading-4 tabular-nums">
                            {tab.unread > 99 ? '99+' : tab.unread}
                          </span>
                        )}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>

                  {model.tabs.map((tab) => (
                    <Panel key={tab.kind} tab={tab} copy={copy} />
                  ))}
                </Tabs.Root>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </span>

      <nav
        data-notif="plain"
        style={{ display: 'none' }}
        aria-label={fromCopy(copy, 'board.notificationMenu.trigger')}
        className="flex-wrap items-center gap-x-2 gap-y-1"
      >
        {model.tabs
          .filter((tab) => tab.unread > 0)
          .map((tab) => (
            <a
              key={tab.kind}
              href={tab.allHref}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="tabular-nums">{tab.unread}</span>
              <span className="sr-only"> {fromCopy(copy, UNREAD_KEY[tab.kind])}</span>
            </a>
          ))}
      </nav>
    </div>
  )
}
