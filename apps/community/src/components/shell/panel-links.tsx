/**
 * The way from one control panel into the others you hold.
 *
 * A moderator who is also an administrator had no route between the two panels
 * that did not go through the board's account menu, and a member who moderates
 * had none at all in the other direction: the panels behaved as though each was
 * the only one. They are three views of the same board and the staff who use
 * them are usually the same people.
 *
 * Below the sections rather than above them, and under a rule, because these
 * are not places in *this* panel — the rail's job is the panel you are in, and
 * a sibling listed among its sections would read as one of them.
 *
 * ## The ACP is never linked from here
 *
 * Deliberately. `resolveAdmin` answers 404 rather than "no" to an address
 * outside the allowlist and to a member without `admincp.access`, because the
 * whole value of an allowlist is that the panel is invisible from outside it. A
 * rail link driven by the permission column alone would announce the panel to
 * an administrator sitting at the wrong address and then 404 them — so the ACP
 * links *out* to its siblings and none of them links back.
 */

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
