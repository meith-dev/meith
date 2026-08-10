export interface PanelLink {
  readonly href: string;
  readonly label: string;
}

export function PanelLinks({ links }: { links: readonly PanelLink[] }) {
  return (
    <nav
      aria-label="Other panels"
      className="border-t border-border pt-3 text-sm"
    >
      <ul className="flex flex-col gap-0.5">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="block rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
