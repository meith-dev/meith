import type { SlotCopy, Translator } from '@meith/theme-kit'

function copyFor(t: Translator, keys: readonly string[]): SlotCopy {
  const copy: Record<string, string> = {}
  for (const key of keys) copy[key] = t.t(key)
  return copy
}

export function whoIsOnlineCopy(t: Translator): SlotCopy {
  return copyFor(t, [
    'default.whoIsOnline.heading',
    'default.whoIsOnline.online',
    'default.whoIsOnline.member.one',
    'default.whoIsOnline.member.other',
    'default.whoIsOnline.guest.one',
    'default.whoIsOnline.guest.other',
    'default.whoIsOnline.nobody',
    'default.whoIsOnline.onlyGuests',
    'default.whoIsOnline.and',
    'default.whoIsOnline.more',
    'default.whoIsOnline.seeEveryone',
    'default.whoIsOnline.record',
    'default.whoIsOnline.invisible',
  ])
}
