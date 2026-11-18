// Constants and helpers shared by the background, content, and sidebar scripts.
// Chrome exposes only chrome.* (promise-based since Chrome 99); Firefox exposes browser.*.
if (!globalThis.browser) globalThis.browser = globalThis.chrome;
(() => {
  const COLORS = Object.freeze({
    yellow: "#ffe58a",
    green: "#b8edc4",
    blue: "#b9dcff",
    purple: "#ddc8ff",
    magenta: "#ff9ed9",
    orange: "#ffd0a3",
  });
  const LEGACY_COLORS = Object.freeze({ pink: "magenta" });
  const normalizeColor = (color) =>
    LEGACY_COLORS[color] ?? (COLORS[color] ? color : "yellow");
  globalThis.SideWriteShared = Object.freeze({
    COLORS,
    ANNOTATIONS_KEY: "annotations",
    NOTEBOOKS_KEY: "notebooks",
    BLOCK_SELECTOR: "p,li,blockquote,td,th,div,section,article",
    CONFIRM_DELETE:
      "Delete this highlight and its attached note? This cannot be undone.",
    SIDEBAR_CLOSED_MSG:
      "SideWrite sidebar is closed — open it from the toolbar to edit this note.",
    colorOf: (color) => COLORS[normalizeColor(color)],
    normalizeColor,
    makeId: (prefix = "pp") =>
      `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    esc: (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    asArray: (v) => (Array.isArray(v) ? v : []),
    readList: async (key) => {
      const data = await browser.storage.local.get(key);
      return Array.isArray(data[key]) ? data[key] : [];
    },
  });
})();
