import { cn } from "@meith/ui";

export interface PanelPageProps {
  readonly title: React.ReactNode;
  readonly back?: { readonly href: string; readonly label: string };
  readonly lede?: React.ReactNode;
  readonly meta?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly width?: "reading" | "wide";
  readonly gap?: "normal" | "loose";
  readonly children: React.ReactNode;
}

export function PanelPage({
  title,
  back,
  lede,
  meta,
  actions,
  width = "reading",
  gap = "normal",
  children,
}: PanelPageProps) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={cn(
        "flex w-full flex-col px-6 py-8",
        width === "wide" ? "max-w-none" : "max-w-4xl",
        gap === "loose" ? "gap-8" : "gap-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          {back !== undefined && (
            <a
              href={back.href}
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ← {back.label}
            </a>
          )}
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {lede !== undefined && (
            <p className="text-sm text-muted-foreground">{lede}</p>
          )}
          {meta !== undefined && (
            <p className="text-xs text-muted-foreground">{meta}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children}
    </main>
  );
}

export function PanelSection({
  title,
  description,
  actions,
  id,
  children,
}: {
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly id: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id={id}
            className="font-heading text-lg font-semibold text-foreground"
          >
            {title}
          </h2>
          {description !== undefined && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children}
    </section>
  );
}
