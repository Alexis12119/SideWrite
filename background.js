// Chrome loads background.js alone as a service worker, so pull in shared.js there;
// Firefox lists both files under background.scripts already.
if (typeof importScripts === "function") importScripts("shared.js");
const SW = globalThis.SideWriteShared;
const KEY = SW.ANNOTATIONS_KEY;

const readAll = () => SW.readList(KEY);

async function broadcastToUrl(url, message) {
  if (!url) return;
  try {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url === url)
        browser.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (_) {}
}

async function sidebarOpenFor(sender) {
  const windowId = sender?.tab?.windowId ?? null;
  // Chrome: only sidePanel exists. open() needs a user gesture, which a page
  // click usually can't provide — failing is fine, pendingEdit still gets set.
  if (browser.sidePanel) {
    try {
      const id = windowId ?? (await browser.windows.getCurrent())?.id;
      await browser.sidePanel.open({ windowId: id });
      return { open: true, windowId };
    } catch (_) {
      return { open: false, windowId };
    }
  }
  const details = windowId != null ? { windowId } : {};
  let open = false;
  try {
    open = await browser.sidebarAction.isOpen(details);
  } catch (_) {}
  if (!open) {
    // Firefox only allows this from a native user-action handler, so this usually fails from a page click.
    try {
      await browser.sidebarAction.open();
      open = true;
    } catch (_) {}
    if (!open) {
      try {
        open = await browser.sidebarAction.isOpen(details);
      } catch (_) {}
    }
  }
  return { open, windowId };
}

async function handleEditInSidebar(message, sender) {
  const { open, windowId } = await sidebarOpenFor(sender);
  try {
    await browser.storage.session.set({
      pendingEdit: { id: message.id, windowId, at: Date.now() },
    });
  } catch (_) {}
  return { ok: true, sidebarOpen: open };
}

async function saveAnnotation(annotation) {
  const items = await readAll();
  const i = items.findIndex((x) => x.id === annotation.id);
  if (i >= 0) items[i] = annotation;
  else items.unshift(annotation);
  await browser.storage.local.set({ [KEY]: items });
}

async function updateAnnotation(id, patch) {
  const items = await readAll();
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const prev = items[i];
  items[i] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [KEY]: items });
  if (patch?.color)
    await broadcastToUrl(prev.url, {
      type: "UPDATE_MARK",
      id,
      color: patch.color,
    });
  return true;
}

async function deleteAnnotation(id) {
  const items = await readAll();
  const item = items.find((x) => x.id === id);
  await browser.storage.local.set({ [KEY]: items.filter((x) => x.id !== id) });
  if (item) await broadcastToUrl(item.url, { type: "REMOVE_MARK", id });
  return true;
}

async function createNotebook(notebook) {
  if (!notebook?.id) return false;
  const notebooks = await SW.readList(SW.NOTEBOOKS_KEY);
  notebooks.push(notebook);
  await browser.storage.local.set({ [SW.NOTEBOOKS_KEY]: notebooks });
  return true;
}

async function saveAll(annotations, notebooks) {
  if (!Array.isArray(annotations) || !Array.isArray(notebooks)) return false;
  await browser.storage.local.set({
    [KEY]: annotations,
    [SW.NOTEBOOKS_KEY]: notebooks,
  });
  return true;
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message?.type) return;
  if (message.type === "GET_ANNOTATIONS")
    return { annotations: await readAll() };
  if (message.type === "EDIT_IN_SIDEBAR")
    return handleEditInSidebar(message, sender);
  if (message.type === "SAVE_ANNOTATION") {
    await saveAnnotation(message.annotation);
    return { ok: true };
  }
  if (message.type === "UPDATE_ANNOTATION")
    return { ok: await updateAnnotation(message.id, message.patch) };
  if (message.type === "DELETE_ANNOTATION") {
    await deleteAnnotation(message.id);
    return { ok: true };
  }
  if (message.type === "CREATE_NOTEBOOK")
    return { ok: await createNotebook(message.notebook) };
  if (message.type === "SAVE_ALL")
    return { ok: await saveAll(message.annotations, message.notebooks) };
});
// Firefox: toggle the sidebar. Chrome: no sidebarAction, so the toolbar click
// is handled by setPanelBehavior below instead.
if (browser.sidePanel?.setPanelBehavior) {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}
if (browser.sidebarAction)
  browser.action.onClicked.addListener(() => browser.sidebarAction.toggle());
