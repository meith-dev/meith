import type { GroupTagModel, UserRefModel } from '@meith/theme-kit'

export function UserRef({
  user,
  className,
  linked = true,
}: {
  user: UserRefModel
  className?: string
  linked?: boolean
}) {
  const classes = [className, user.nameClass].filter(Boolean).join(' ') || undefined

  if (!linked || user.profileHref === null) {
    return <span className={classes}>{user.username}</span>
  }
  return (
    <a href={user.profileHref} className={classes}>
      {user.username}
    </a>
  )
}

export function groupTags(
  groups: readonly GroupTagModel[] | undefined,
  title: string | null,
): readonly GroupTagModel[] {
  if (groups !== undefined && groups.length > 0) return groups
  return title === null ? [] : [{ title }]
}
