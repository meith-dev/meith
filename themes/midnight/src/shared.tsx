import type { UserRefModel } from '@meith/theme-kit'

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
