// Hello Plugin — a starter meith plugin.
//
// A meith plugin is just a web app. It runs inside a controlled "plugin" tab
// and talks to the app ONLY through `window.meithPlugin`, a permission-gated
// bridge that the host attaches based on the grants the user approved.
//
// Key rules to remember:
//   * `window.meithPlugin` only exists when the host has mapped this tab to an
//     enabled plugin. On a normal web page it is `undefined`.
//   * Only the namespaces you were granted are present. If the user did not
//     approve the `ai` API, `meithPlugin.ai` is `undefined` — always
//     feature-detect before using a namespace.
//   * Identity is resolved by the host from the tab itself. You cannot forge
//     another plugin's id, and tool calls are gated by your approved
//     capabilities regardless of what you pass.

/** @typedef {import("@meith/protocol").MeithPluginApi} MeithPluginApi */

const plugin = /** @type {MeithPluginApi | undefined} */ (window.meithPlugin);

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

function renderPills(el, items) {
  el.replaceChildren(
    ...items.map((label) => {
      const li = document.createElement("li");
      li.className = "pill";
      li.textContent = label;
      return li;
    }),
  );
}

async function main() {
  // Feature-detect the bridge. If it is missing we are not running as an
  // enabled plugin (e.g. opened directly in a browser), so degrade gracefully.
  if (!plugin) {
    $("identity").textContent =
      "Not running inside meith. Open this plugin from the Plugins manager.";
    return;
  }

  const identity = plugin.identity;
  $("title").textContent = identity.name;
  $("identity").textContent = `${identity.pluginId} v${identity.version}`;
  renderPills($("grants"), [
    ...identity.apis.map((a) => `api:${a}`),
    ...identity.capabilities.map((c) => `cap:${c}`),
  ]);

  // --- storage.getBrowserTabs (requires the `storage` API) ----------------
  const refreshTabs = async () => {
    if (!plugin.storage) {
      $("tabs").textContent = "Not granted the storage API.";
      return;
    }
    const tabs = await plugin.storage.getBrowserTabs();
    $("tabs").replaceChildren(
      ...tabs.map((t) => {
        const li = document.createElement("li");
        li.textContent = `${t.title} — ${t.url}`;
        return li;
      }),
    );
  };
  $("refresh-tabs").addEventListener("click", () => void refreshTabs());
  await refreshTabs();

  // --- tools.call (requires the `tools` API + the tool's capabilities) ----
  $("call-tool").addEventListener("click", async () => {
    if (!plugin.tools) {
      $("tool-result").textContent = "Not granted the tools API.";
      return;
    }
    const result = await plugin.tools.call("get_tabs", {});
    // Tool results are discriminated on `ok`. Permission failures surface as
    // `{ ok: false, error: { code: "PERMISSION_DENIED", ... } }`.
    $("tool-result").textContent = JSON.stringify(result, null, 2);
  });

  // --- ai.streamText (requires the `ai` API) ------------------------------
  let controls = null;
  const aiRun = $("ai-run");
  const aiCancel = $("ai-cancel");

  aiRun.addEventListener("click", async () => {
    if (!plugin.ai) {
      $("ai-output").textContent = "Not granted the ai API.";
      return;
    }
    $("ai-output").textContent = "";
    aiRun.setAttribute("disabled", "true");
    aiCancel.removeAttribute("disabled");
    try {
      await plugin.ai.streamText({
        prompt: "Briefly summarize the browser tabs I have open.",
        onStart: (c) => {
          controls = c;
        },
        onText: (delta) => {
          $("ai-output").textContent += delta;
        },
      });
    } catch (err) {
      $("ai-output").textContent += `\n[error] ${String(err)}`;
    } finally {
      controls = null;
      aiRun.removeAttribute("disabled");
      aiCancel.setAttribute("disabled", "true");
    }
  });

  aiCancel.addEventListener("click", () => {
    controls?.cancel();
  });
}

void main();
