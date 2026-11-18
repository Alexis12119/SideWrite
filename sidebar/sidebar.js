const KEY = "annotations",
  NOTEBOOKS_KEY = "notebooks";
const COLORS = {
  yellow: "#ffe58a",
  green: "#b8edc4",
  blue: "#b9dcff",
  pink: "#ffc7df",
  purple: "#ddc8ff",
};
let annotations = [],
  notebooks = [],
  currentView = "page",
  currentTab = null,
  editingId = null,
  selectedColor = "yellow",
  selectedNotebook = null,
  queuedEdit = null,
  pendingBusy = false,
  pendingAgain = false,
  colorTouched = false;
const PENDING_TTL = 120000;
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const shortDate = (v) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(v));
  } catch {
    return "";
  }
};

async function load() {
  const data = await browser.storage.local.get([KEY, NOTEBOOKS_KEY]);
  annotations = Array.isArray(data[KEY]) ? data[KEY] : [];
  notebooks = Array.isArray(data[NOTEBOOKS_KEY]) ? data[NOTEBOOKS_KEY] : [];
  await getTab();
  render();
  syncEditorColor();
  await processPendingEdit();
  retryQueuedEdit();
}
async function getTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0] || null;
  if (currentTab?.url) {
    let host = "";
    try {
      host = new URL(currentTab.url).hostname;
    } catch {}
    $("page-info").innerHTML =
      `<strong>${esc(currentTab.title || "Current page")}</strong>${esc(host)}`;
  } else $("page-info").textContent = "No active webpage";
}
function visibleItems() {
  let items = annotations;
  if (currentView === "page" && currentTab)
    items = items.filter((a) => a.url === currentTab.url);
  if (currentView === "notebooks")
    items = selectedNotebook
      ? items.filter((a) => a.notebookId === selectedNotebook)
      : [];
  const q = $("search").value.trim().toLowerCase();
  if (q)
    items = items.filter((a) =>
      `${a.selectedText} ${a.note} ${a.title}`.toLowerCase().includes(q),
    );
  return items;
}
function render() {
  $("page-info").hidden = currentView !== "page";
  $("notebook-tools").hidden = currentView !== "notebooks";
  document
    .querySelectorAll(".tab")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.view === currentView),
    );
  renderNotebooks();
  const items = visibleItems();
  $("annotations").innerHTML = items
    .map(
      (a) => `<article class="annotation" data-id="${esc(a.id)}">
    <p class="quote"><span class="dot" style="background:${COLORS[a.color] || COLORS.yellow}"></span>${esc(a.selectedText)}</p>
    ${a.note ? `<p class="note">${esc(a.note)}</p>` : `<p class="note">No note yet — edit to add one.</p>`}
    <div class="meta"><span>${esc(a.title || "Saved webpage")}</span><span>${shortDate(a.createdAt)}</span></div>
    <div class="meta card-actions"><span>${a.notebookId ? "▤ In notebook" : "Unfiled"}</span><span><button data-edit="${esc(a.id)}">Edit</button><button data-delete="${esc(a.id)}">Delete</button></span></div>
  </article>`,
    )
    .join("");
  $("empty").hidden = items.length !== 0;
  $("empty").querySelector("p").textContent =
    currentView === "page"
      ? "Select text on this webpage and choose a color to save your first highlight."
      : currentView === "notebooks"
        ? "Choose a notebook or create one, then file highlights into it."
        : "Your saved highlights from all webpages will appear here.";
}
function renderNotebooks() {
  $("notebook-list").innerHTML =
    notebooks
      .map(
        (n) =>
          `<div class="notebook ${selectedNotebook === n.id ? "active" : ""}" data-notebook="${esc(n.id)}"><span>▤ ${esc(n.name)}</span><span>${annotations.filter((a) => a.notebookId === n.id).length}</span></div>`,
      )
      .join("") ||
    `<p class="note">No notebooks yet. Create one to group your notes.</p>`;
  $("notebook-select").innerHTML =
    `<option value="">Unfiled</option>` +
    notebooks
      .map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`)
      .join("");
}
function showEditorFor(id, at) {
  if (!annotations.some((a) => a.id === id)) {
    queuedEdit = { id, at: at || Date.now() };
    return;
  }
  queuedEdit = null;
  if (currentView === "notebooks") currentView = "page";
  else if (!visibleItems().some((a) => a.id === id)) currentView = "all";
  render();
  openEditor(id);
}
function retryQueuedEdit() {
  if (!queuedEdit) return;
  if (Date.now() - queuedEdit.at > PENDING_TTL) {
    queuedEdit = null;
    return;
  }
  showEditorFor(queuedEdit.id, queuedEdit.at);
}
async function consumePendingEdit() {
  let entry = null;
  try {
    entry = (await browser.storage.session.get("pendingEdit")).pendingEdit;
  } catch {
    return;
  }
  if (!entry || typeof entry.id !== "string") return;
  if (Date.now() - (entry.at || 0) > PENDING_TTL) {
    try {
      await browser.storage.session.remove("pendingEdit");
    } catch {}
    return;
  }
  if (entry.windowId != null) {
    try {
      const w = await browser.windows.getCurrent();
      if (w && w.id !== entry.windowId) return;
    } catch {}
  }
  try {
    await browser.storage.session.remove("pendingEdit");
  } catch {}
  showEditorFor(entry.id, Date.now());
}
async function processPendingEdit() {
  if (pendingBusy) {
    pendingAgain = true;
    return;
  }
  pendingBusy = true;
  try {
    while (true) {
      pendingAgain = false;
      await consumePendingEdit();
      if (!pendingAgain) break;
    }
  } finally {
    pendingBusy = false;
  }
}
function applyColorUI(color) {
  selectedColor = color || "yellow";
  document
    .querySelectorAll("#editor-colors button")
    .forEach((x) =>
      x.classList.toggle("selected", x.dataset.color === selectedColor),
    );
  const q = $("editor-quote");
  if (q) q.style.background = COLORS[selectedColor] || COLORS.yellow;
}
function syncEditorColor() {
  if (!editingId || colorTouched) return;
  const item = annotations.find((a) => a.id === editingId);
  if (item && (item.color || "yellow") !== selectedColor)
    applyColorUI(item.color);
}
function openEditor(id) {
  const item = annotations.find((a) => a.id === id);
  if (!item) return;
  editingId = id;
  colorTouched = false;
  $("editor").hidden = false;
  $("editor-quote").textContent = (
    item.exactText ||
    item.selectedText ||
    ""
  ).trim();
  $("note-input").value = item.note || "";
  $("notebook-select").value = item.notebookId || "";
  applyColorUI(item.color);
  $("note-input").focus({ preventScroll: true });
  $("editor").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function closeEditor() {
  editingId = null;
  $("editor").hidden = true;
}
async function save() {
  const item = annotations.find((a) => a.id === editingId);
  if (!item) return;
  item.note = $("note-input").value;
  item.color = selectedColor;
  item.notebookId = $("notebook-select").value || null;
  item.updatedAt = new Date().toISOString();
  await browser.storage.local.set({ [KEY]: annotations });
  if (currentTab?.id && item.url === currentTab.url)
    browser.tabs
      .sendMessage(currentTab.id, {
        type: "UPDATE_MARK",
        id: item.id,
        color: item.color,
      })
      .catch(() => {});
  closeEditor();
  render();
}
async function deleteById(id) {
  const item = annotations.find((a) => a.id === id);
  if (!item) return;
  if (
    !confirm(
      "Delete this highlight and its attached note? This cannot be undone.",
    )
  )
    return;
  annotations = annotations.filter((a) => a.id !== id);
  await browser.storage.local.set({ [KEY]: annotations });
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.url === item.url && tab.id)
      browser.tabs
        .sendMessage(tab.id, { type: "REMOVE_MARK", id })
        .catch(() => {});
  }
  if (editingId === id) closeEditor();
  render();
}
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => {
    currentView = b.dataset.view;
    selectedNotebook = null;
    render();
  }),
);
$("search").addEventListener("input", render);
$("refresh").addEventListener("click", load);
$("annotations").addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete]");
  if (del) {
    e.stopPropagation();
    deleteById(del.dataset.delete);
    return;
  }
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    e.stopPropagation();
    openEditor(edit.dataset.edit);
    return;
  }
  const card = e.target.closest(".annotation");
  if (card) openEditor(card.dataset.id);
});
$("close-editor").addEventListener("click", closeEditor);
$("save-note").addEventListener("click", save);
$("delete-note").addEventListener("click", () => {
  if (editingId) deleteById(editingId);
});
$("editor-colors").addEventListener("click", (e) => {
  const b = e.target.closest("[data-color]");
  if (!b) return;
  colorTouched = true;
  applyColorUI(b.dataset.color);
});
$("notebook-list").addEventListener("click", (e) => {
  const n = e.target.closest("[data-notebook]");
  if (!n) return;
  selectedNotebook = n.dataset.notebook;
  render();
});
$("new-notebook").addEventListener("click", async () => {
  const name = prompt("Name this notebook:");
  if (!name?.trim()) return;
  const n = {
    id: "nb-" + Date.now().toString(36),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  notebooks.push(n);
  selectedNotebook = n.id;
  await browser.storage.local.set({ [NOTEBOOKS_KEY]: notebooks });
  render();
});
$("export").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify({ version: 3, annotations, notebooks }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "sidewrite-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.annotations) || !Array.isArray(data.notebooks))
      throw Error("Invalid backup");
    if (
      !confirm(
        "Import this backup and REPLACE all current SideWrite highlights and notebooks? Export a backup first if you want to keep the current data.",
      )
    )
      return;
    annotations = data.annotations;
    notebooks = data.notebooks;
    await browser.storage.local.set({
      [KEY]: annotations,
      [NOTEBOOKS_KEY]: notebooks,
    });
    await load();
    alert("Backup imported successfully.");
  } catch (err) {
    if (err.message !== "Invalid backup") console.error(err);
    alert(
      "Could not import that backup file. Check that it is a valid SideWrite JSON backup.",
    );
  } finally {
    e.target.value = "";
  }
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[KEY] || changes[NOTEBOOKS_KEY])) load();
  if (area === "session" && changes.pendingEdit) processPendingEdit();
});
browser.tabs.onActivated.addListener(load);
browser.tabs.onUpdated.addListener((id, change) => {
  if (id === currentTab?.id && change.status === "complete") load();
});
load();
