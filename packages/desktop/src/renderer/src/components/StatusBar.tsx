import type { View } from "../App";

export function StatusBar({
  isMock,
  browserTabs,
  workspaceTabs,
  view,
}: {
  isMock: boolean;
  browserTabs: number;
  workspaceTabs: number;
  view: View;
}) {
  return (
    <footer className="statusbar">
      <span className={`status-pill${isMock ? "" : " is-online"}`}>
        {isMock ? "Mock bridge" : "Runtime connected"}
      </span>
      <span className="status-item">{browserTabs} browser tabs</span>
      <span className="status-item">{workspaceTabs} workspace tabs</span>
      <span className="status-spacer" />
      <span className="status-item">{view}</span>
    </footer>
  );
}
