'use client'

import { useCallback, useEffect, useState } from 'react'

import { subscribeToPushAction, unsubscribeFromPushAction } from '@/server/push-actions'

import { FormError, FormNotice } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60'

type Status = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working'

function applicationServerKey(publicKey: string): Uint8Array {
  const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))

  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

function keyOf(subscription: PushSubscription, name: 'p256dh' | 'auth'): string {
  const key = subscription.getKey(name)
  if (key === null) return ''

  let binary = ''
  for (const byte of new Uint8Array(key)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function PushDeviceForm({ publicKey, copy }: { publicKey: string; copy: Copy }) {
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const supported =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported')
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
        const subscription = await registration.pushManager.getSubscription()
        if (cancelled) return

        if (subscription !== null) {
          await subscribeToPushAction({
            endpoint: subscription.endpoint,
            p256dh: keyOf(subscription, 'p256dh'),
            auth: keyOf(subscription, 'auth'),
          })
          if (!cancelled) setStatus('on')
          return
        }

        setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
      } catch {
        if (!cancelled) setStatus('unsupported')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supported])

  const subscribe = useCallback(async () => {
    setError(undefined)
    setNotice(undefined)
    setStatus('working')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      })

      const result = await subscribeToPushAction({
        endpoint: subscription.endpoint,
        p256dh: keyOf(subscription, 'p256dh'),
        auth: keyOf(subscription, 'auth'),
      })

      if (result.error !== undefined) {
        await subscription.unsubscribe()
        setError(result.error)
        setStatus('off')
        return
      }

      setNotice(result.notice)
      setStatus('on')
    } catch {
      setError(fromCopy(copy, 'accountForm.push.failed'))
      setStatus('off')
    }
  }, [copy, publicKey])

  const unsubscribe = useCallback(async () => {
    setError(undefined)
    setNotice(undefined)
    setStatus('working')

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription !== null) {
        const result = await unsubscribeFromPushAction(subscription.endpoint)
        await subscription.unsubscribe()
        if (result.error !== undefined) {
          setError(result.error)
          setStatus('on')
          return
        }
        setNotice(result.notice)
      }

      setStatus('off')
    } catch {
      setError(fromCopy(copy, 'accountForm.push.failed'))
      setStatus('on')
    }
  }, [copy])

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium">{fromCopy(copy, 'accountForm.push.heading')}</h2>

      <FormError message={error} />
      <FormNotice message={notice} />

      <p className="text-sm text-muted-foreground">
        {fromCopy(
          copy,
          status === 'checking'
            ? 'form.working'
            : status === 'unsupported'
              ? 'accountForm.push.unsupported'
              : status === 'blocked'
                ? 'accountForm.push.blocked'
                : status === 'on'
                  ? 'accountForm.push.subscribed'
                  : 'accountForm.push.unsubscribed',
        )}
      </p>

      {(status === 'off' || status === 'on' || status === 'working') && (
        <div>
          <button
            type="button"
            className={BUTTON}
            disabled={status === 'working'}
            onClick={status === 'on' ? unsubscribe : subscribe}
          >
            {fromCopy(
              copy,
              status === 'working'
                ? 'form.working'
                : status === 'on'
                  ? 'accountForm.push.unsubscribe'
                  : 'accountForm.push.subscribe',
            )}
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'accountForm.push.blurb')}</p>
    </section>
  )
}
