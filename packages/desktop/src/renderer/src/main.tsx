import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
const root = createRoot(el);

// The overlay window loads this same bundle with a `#overlay` hash route and
// mounts only the lightweight floating-UI document (tooltips/menus), never the
// full workbench. Code-split so neither tree pulls in the other.
if (window.location.hash === "#overlay") {
  void import("./overlay/OverlayApp.js").then(({ OverlayApp }) => {
    root.render(<OverlayApp />);
  });
} else {
  void import("./App.js").then(({ App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
