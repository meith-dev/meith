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
  readonly count: number;
  readonly one: string;
  readonly many: string;
  readonly href: string;
  readonly action: string;
}

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
