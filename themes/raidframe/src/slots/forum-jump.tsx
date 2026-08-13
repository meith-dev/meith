import type { ForumJumpModel } from '@meith/theme-kit'

import { BUTTON, MICRO } from '../shared'

export function ForumJump({ action, field, forums, submitLabel, label }: ForumJumpModel) {
  if (forums.length === 0) return null

  const id = `forum-jump-${field}`

  return (
    <div className="border-t border-border bg-card/40">
      <form
        method="get"
        action={action}
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:justify-end"
      >
        <label htmlFor={id} className={MICRO}>
          {label}
        </label>

        <select
          id={id}
          name={field}
          defaultValue={forums.find((forum) => forum.isSelected)?.value ?? ''}
          className="h-8 w-auto min-w-48 flex-1 border border-input bg-surface px-2 font-mono text-xs text-foreground sm:flex-none"
        >
          {forums.map((forum) => (
            <option
              key={forum.value}
              value={forum.value}
              disabled={forum.isCategory}
              label={`${'  '.repeat(forum.depth)}${forum.label}`}
            >
              {`${'  '.repeat(forum.depth)}${forum.label}`}
            </option>
          ))}
        </select>

        <button type="submit" className={BUTTON}>
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
