import { Label, NativeSelect, buttonVariants } from '@meith/ui'
import type { ForumJumpModel } from '@meith/theme-kit'

import { PAGE } from '../shared'

export function ForumJump({ action, field, forums, submitLabel, label }: ForumJumpModel) {
  if (forums.length === 0) return null

  const id = `forum-jump-${field}`

  return (
    <div className="border-t border-border bg-card">
      <form
        method="get"
        action={action}
        className={`${PAGE} flex flex-wrap items-center gap-2 py-3 sm:justify-end`}
      >
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>

        <NativeSelect
          id={id}
          name={field}
          defaultValue={forums.find((forum) => forum.isSelected)?.value ?? ''}
          className="h-8 w-auto min-w-48 flex-1 text-xs sm:flex-none"
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

        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
