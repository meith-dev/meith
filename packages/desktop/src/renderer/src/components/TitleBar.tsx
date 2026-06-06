export function TitleBar({
  spaceName,
  isMock,
}: {
  spaceName: string | null;
  isMock: boolean;
}) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-dot" aria-hidden="true" />
        <span className="titlebar-title">meith</span>
        <span className="titlebar-sub">control panel</span>
      </div>
      <div className="titlebar-space">
        {spaceName ? `Space: ${spaceName}` : "No active space"}
      </div>
      <div className="titlebar-spacer" />
      {isMock && (
        <span className="titlebar-badge" title="Running without the Electron runtime">
          mock bridge
        </span>
      )}
    </header>
  );
}
