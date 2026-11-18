// Builds dist/chrome — Firefox loads the repo root directly (manifest.json),
// Chrome needs its own manifest (service_worker + side_panel, no sidebar_action).
const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.join(root, "dist", "chrome");
const files = ["background.js", "content.js", "shared.js", "sidebar", "icons"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of files)
  fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
fs.copyFileSync(
  path.join(root, "manifest.chrome.json"),
  path.join(out, "manifest.json"),
);
console.log(
  "Built dist/chrome — load that folder unpacked in chrome://extensions",
);
