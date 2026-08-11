import type { ForumJumpModel } from '@meith/theme-kit'

import { BTN, PAGE } from '../shared'

export function ForumJump({ action, field, forums, submitLabel, label }: ForumJumpModel) {
  if (forums.length === 0) return null

  const id = `forum-jump-${field}`

  return (
    <div className="bg-background">
      <form
        method="get"
        action={action}
        className={`${PAGE} flex flex-wrap items-center gap-2 pb-4 sm:justify-end`}
      >
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>

        <select
          id={id}
          name={field}
          defaultValue={forums.find((forum) => forum.isSelected)?.value ?? ''}
          className="h-9 w-auto min-w-48 flex-1 rounded-sm border border-input bg-card px-2 text-xs text-foreground sm:flex-none"
        >
          {forums.map((forum) => {
            const indented = `${'  '.repeat(forum.depth)}${forum.label}`
            return (
              <option
                key={forum.value}
                value={forum.value}
                disabled={forum.isCategory}
                label={indented}
              >
                {indented}
              </option>
            )
          })}
        </select>

        <button type="submit" className={BTN}>
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
