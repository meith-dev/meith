import { generateVapidKeys } from '@meith/notifications'
import { SettingsSnapshot, saveSettings } from '@meith/settings'

import { parseFlags } from './args'
import { createContext } from './context'

export async function pushKeys(args: readonly string[]): Promise<number> {
  const { flags } = parseFlags(args)
  const keys = await generateVapidKeys()

  if (flags.get('save') !== 'true') {
    console.log('push.vapid_public_key   ' + keys.publicKey)
    console.log('push.vapid_private_key  ' + keys.privateKey)
    console.log(
      '\nPaste these into Admin → Settings → Push, or run this again with --save. ' +
        'Replacing a key that is already in use invalidates every subscription ' +
        'stored against it.',
    )
    return 0
  }

  const ctx = await createContext()
  const snapshot = SettingsSnapshot.fromOverrides(await ctx.settings.loadAll())

  const result = await saveSettings(
    ctx.settings,
    {
      'push.vapid_public_key': keys.publicKey,
      'push.vapid_private_key': keys.privateKey,
    },
    snapshot,
  )

  console.log(
    result.changed.length === 0
      ? 'The keys already on this board were not replaced.'
      : 'Saved a new VAPID key pair. Every subscription stored against the old ' +
          'pair is now dead, and each browser will resubscribe on its next visit ' +
          'to the notification preferences screen.',
  )

  if (!snapshot.get('push.enabled')) {
    console.log('push.enabled is off — turn it on to offer web push to members.')
  }

  return 0
}
