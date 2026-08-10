import { PanelLinks, type PanelLink } from "./panel-links";

export interface PanelShellProps {
  readonly nav: React.ReactNode;
  readonly links?: readonly PanelLink[];
  readonly railOffset?: "board" | "panel";
  readonly children: React.ReactNode;
}

export function PanelShell({
  nav,
  links = [],
  railOffset = "board",
  children,
}: PanelShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside
        className={
          railOffset === "panel"
            ? "flex flex-col gap-4 px-6 pt-6 lg:sticky lg:top-14 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0"
            : "flex flex-col gap-4 px-6 pt-6 lg:sticky lg:top-6 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0"
        }
      >
        {nav}
        {links.length > 0 && <PanelLinks links={links} />}
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
