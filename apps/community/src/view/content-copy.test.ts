import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { editPostFormCopy, newThreadFormCopy, replyFormCopy } from './content-copy'

function keysReadFromTheCopyProp(component: string): string[] {
  const source = readFileSync(
    new URL(`../components/content/${component}`, import.meta.url),
    'utf8',
  )
  const keys = new Set<string>()

  for (const match of source.matchAll(/(?:format)?fromCopy\(\s*copy,\s*'([\w.-]+)'/g)) {
    const key = match[1]
    if (key !== undefined) keys.add(key)
  }

  return [...keys].sort()
}

const RECOVERY = keysReadFromTheCopyProp('composer-recovery.tsx')

const BUNDLES = [
  { name: 'replyFormCopy', copy: replyFormCopy(), components: ['reply-form.tsx'] },
  { name: 'newThreadFormCopy', copy: newThreadFormCopy(), components: ['new-thread-form.tsx'] },
  { name: 'editPostFormCopy', copy: editPostFormCopy(), components: ['edit-post-form.tsx'] },
] as const

describe('the copy a composer is handed', () => {
  it('finds the keys the autosave notice reads', () => {
    expect(RECOVERY).toContain('composer.autosave.saved')
    expect(RECOVERY.length).toBeGreaterThan(3)
  })

  for (const bundle of BUNDLES) {
    const wanted = [
      ...bundle.components.flatMap(keysReadFromTheCopyProp),
      ...(bundle.name === 'editPostFormCopy' ? [] : RECOVERY),
    ]

    it.each(wanted)(`${bundle.name} carries %s`, (key) => {
      expect(Object.keys(bundle.copy)).toContain(key)
    })

    it.each(wanted)(`${bundle.name} resolves %s to prose, not the key`, (key) => {
      expect(bundle.copy[key]).not.toBe(key)
      expect(bundle.copy[key] ?? '').not.toBe('')
    })
  }
})
