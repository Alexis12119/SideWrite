const KEY = "annotations";
async function readAll() {
  const data = await browser.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message?.type) return;
  if (message.type === "GET_ANNOTATIONS") return { annotations: await readAll() };
  if (message.type === "EDIT_IN_SIDEBAR") {
    const windowId = sender?.tab?.windowId ?? null;
    const details = windowId != null ? { windowId } : {};
    let sidebarOpen = false;
    try { sidebarOpen = await browser.sidebarAction.isOpen(details); } catch (_) {}
    if (!sidebarOpen) {
      // Firefox only allows this from a native user-action handler, so this usually fails from a page click.
      try { await browser.sidebarAction.open(); sidebarOpen = true; } catch (_) {}
      if (!sidebarOpen) {
        try { sidebarOpen = await browser.sidebarAction.isOpen(details); } catch (_) {}
      }
    }
    try {
      await browser.storage.session.set({ pendingEdit: { id: message.id, windowId, at: Date.now() } });
    } catch (_) {}
    return { ok: true, sidebarOpen };
  }
  if (message.type === "SAVE_ANNOTATION") {
    const items = await readAll();
    const i = items.findIndex(x => x.id === message.annotation.id);
    if (i >= 0) items[i] = message.annotation; else items.unshift(message.annotation);
    await browser.storage.local.set({[KEY]: items});
    return {ok:true};
  }
  if (message.type === "UPDATE_ANNOTATION") {
    const items = await readAll();
    const i = items.findIndex(x => x.id === message.id);
    if (i < 0) return {ok:false};
    items[i] = {...items[i], ...message.patch, updatedAt:new Date().toISOString()};
    await browser.storage.local.set({[KEY]:items});
    return {ok:true};
  }
  if (message.type === "DELETE_ANNOTATION") {
    const items = (await readAll()).filter(x => x.id !== message.id);
    await browser.storage.local.set({[KEY]:items});
    return {ok:true};
  }
});
browser.action.onClicked.addListener(() => browser.sidebarAction.toggle());