import type { ForumJumpModel } from '@meith/theme-kit'
import { NativeSelect } from '@meith/ui'

import { LABEL, SECONDARY_ACTION, TOUCH } from '../shared'

export function ForumJump({ action, field, forums, submitLabel, label }: ForumJumpModel) {
  if (forums.length === 0) return null

  const id = `forum-jump-${field}`

  return (
    <form method="get" action={action} className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>

      <NativeSelect
        controlSize="sm"
        id={id}
        name={field}
        defaultValue={forums.find((forum) => forum.isSelected)?.value ?? ''}
        className="h-9 w-auto min-w-0 max-w-full flex-1 text-[0.8125rem] sm:w-52 sm:flex-none"
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
      </NativeSelect>

      <button type="submit" className={`${SECONDARY_ACTION} min-h-9 ${TOUCH}`}>
        {submitLabel}
      </button>
    </form>
  )
}
