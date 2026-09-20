'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function NavLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: ReactNode
}) {
  const pathname = usePathname()
  const current =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link href={href} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  )
}
