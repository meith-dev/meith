import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

/**
 * Configures Monaco to load from the locally-bundled `monaco-editor` package
 * (NOT a CDN) so the editor works offline inside Electron, and wires up the
 * language web workers through Vite's `?worker` imports.
 *
 * Import this module once before rendering any Monaco editor.
 */

// Vite resolves `?worker` imports to worker constructors; Monaco picks the
// right worker per language via the label.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

// Point @monaco-editor/react at the bundled instance instead of fetching from a
// CDN. This keeps everything self-contained.
loader.config({ monaco });

let themeDefined = false;

/**
 * A warm, harvest-toned dark theme matching the app chrome. Defined once.
 *
 * This MUST be registered before any `<Editor theme="meith">` mounts, otherwise
 * Monaco silently falls back to the light `vs` theme for the first paint. We
 * therefore call it eagerly at module load (below) in addition to `beforeMount`.
 */
export function ensureMeithTheme(): void {
  if (themeDefined) return;
  monaco.editor.defineTheme("meith", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b6356", fontStyle: "italic" },
      { token: "keyword", foreground: "e0a82e" },
      { token: "string", foreground: "5fa67f" },
      { token: "number", foreground: "d98032" },
      { token: "type", foreground: "3f8fa6" },
    ],
    colors: {
      "editor.background": "#1a1714",
      "editor.foreground": "#e8e0d4",
      "editorLineNumber.foreground": "#6b6356",
      "editorLineNumber.activeForeground": "#e0a82e",
      "editor.selectionBackground": "#3f3a32",
      "editor.lineHighlightBackground": "#211d19",
      "editorCursor.foreground": "#e0a82e",
      "editorIndentGuide.background1": "#2b2620",
    },
  });
  themeDefined = true;
}

// Register the theme as soon as this module is imported so the very first
// editor mount paints with the dark "meith" theme rather than light `vs`.
ensureMeithTheme();

export { monaco };
