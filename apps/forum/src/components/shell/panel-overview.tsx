/**
 * What a control panel's front door is made of.
 *
 * ## All three answer the same question and used to answer it differently
 *
 * Nobody opens a control panel to discover that an "Avatar" screen exists. They
 * open it because something needs doing, or to check that nothing does. The ACP
 * learned that and led with what was waiting; the member's panel copied the
 * idea and re-typed the markup, so its cards were a hand-rolled `div` where the
 * ACP's were a `Card` and its button was `h-8` where the ACP's was a
 * `buttonVariants` outline; the ModCP had no front door at all in that sense —
 * it opened on a list of forums with two counts buried in the corner of each
 * row, which is a report rather than a call to action.
 *
 * So the answer lives here, once. A panel's overview supplies its numbers and
 * its tree; the shape of "here is what is waiting, and here is everything you
 * can do" is not a thing three screens should each have an opinion about.
 *
 * ## A panel that always has something amber on it is one people stop reading
 *
 * `PanelWaiting` renders nothing when its count is zero, and `PanelWaitingList`
 * renders a single all-clear line rather than a row of confident noughts. The
 * point of the block is that a glance tells you whether to keep going.
 */

import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
} from "@meith/ui";

import type { PanelNav } from "@/view/panel-nav";

export interface WaitingItem {
  /** How many, already counted through the same authorizer the target uses. */
  readonly count: number;
  /** The label at one, and the label at everything else. */
  readonly one: string;
  readonly many: string;
  readonly href: string;
  /** The verb on the button — "Review", "Open", "Read". */
  readonly action: string;
}

/** One number that is also a call to action. */
function PanelWaiting({ item }: { item: WaitingItem }) {
  return (
    <Card className="flex-1 border-moderation-pending/50">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {item.count}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.count === 1 ? item.one : item.many}
          </p>
        </div>
        <a
          href={item.href}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {item.action}
        </a>
      </CardContent>
    </Card>
  );
}

/**
 * The whole "waiting for you" block: the items with something in them, or one
 * line saying there are none.
 *
 * `allClear` is the difference between "nothing in these two queues" and
 * "nothing anywhere" — the ACP also watches for a pending upgrade, which is not
 * a queue and is rendered above this as an alert, so the sentence underneath
 * has to know whether it may claim everything is fine.
 */
export function PanelWaitingList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly WaitingItem[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}) {
  const waiting = items.filter((item) => item.count > 0);

  if (waiting.length === 0) {
    return (
      <Card>
        <Empty className="py-8">
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {waiting.map((item) => (
        <PanelWaiting key={item.href} item={item} />
      ))}
    </div>
  );
}

/**
 * The panel's sections, each with the sentence the rail has no room for.
 *
 * Read from the same tree the rail reads, so a panel cannot grow a screen that
 * only one of them knows about — and only the sections that **exist**, because
 * a panel advertising links to pages that are not there would be worse than one
 * that admits it is new (D32).
 *
 * The whole card is the target, through an overlay on the link rather than an
 * `<a>` wrapping both lines — so the link's accessible name stays the section's
 * title instead of the title read together with its description.
 */
export function PanelSectionGrid({ sections }: { sections: PanelNav }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((section) => (
        <li key={section.href}>
          <Card className="relative h-full transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-col gap-0.5 p-4">
              <a
                href={section.href}
                className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                <span className="absolute inset-0" />
                {section.title}
              </a>
              <p className="text-xs text-muted-foreground">{section.blurb}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
