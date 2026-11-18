(() => {
  if (window.__sideWriteV03) return;
  window.__sideWriteV03 = true;

  const SW = globalThis.SideWriteShared;
  const COLORS = SW.COLORS;
  const BLOCK_SELECTOR = SW.BLOCK_SELECTOR;
  let selectionData = null;
  let toolbar = null;
  let activeMarkMenu = null;
  let pageItems = [];

  const escAttr = (s) => CSS.escape(String(s));
  // Same page regardless of fragment: links to a chapter often lack #study=…
  // (or use a different one) while the stored URL has it — reload/back match
  // exactly, click-through doesn't.
  const pageKey = (u) => String(u).split("#")[0];
  const getMark = (id) =>
    document.querySelector(`[data-sidewrite-id="${escAttr(id)}"]`);
  const applyMarkColor = (mark, color) => {
    if (!mark) return;
    mark.style.backgroundColor = SW.colorOf(color);
    mark.dataset.swColor = SW.normalizeColor(color);
  };

  function installUI() {
    if (document.getElementById("sidewrite-style")) return;
    const style = document.createElement("style");
    style.id = "sidewrite-style";
    style.textContent = `
      .sidewrite-mark{border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer;color:#0b0b0c!important}
      #sidewrite-toolbar,#sidewrite-mark-menu,#sidewrite-toast{position:fixed;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;box-sizing:border-box}
      #sidewrite-toolbar{display:none;align-items:center;gap:7px;padding:8px 10px;background:#20242b;color:#fff;border:1px solid #454b55;border-radius:12px;box-shadow:0 8px 28px #0005}
      #sidewrite-toolbar .pp-label{font-weight:700;margin-right:2px}
      #sidewrite-toolbar button{border:1px solid #ffffff88;border-radius:50%;width:23px;height:23px;background:var(--swatch);cursor:pointer;padding:0}
      #sidewrite-toolbar button.pp-note{width:auto;height:27px;border-radius:7px;padding:0 10px;background:#3b5578;color:white;border-color:#64748b;font-weight:650}
      #sidewrite-toolbar button.pp-close{width:auto;height:auto;border:0;border-radius:0;background:transparent;color:#c7cedb;font:700 15px/1 system-ui,sans-serif;padding:0 1px}
      #sidewrite-toolbar button.pp-close:hover{color:#fff}
      #sidewrite-mark-menu{display:none;flex-direction:column;gap:8px;padding:8px;background:#20242b;border:1px solid #454b55;border-radius:10px;box-shadow:0 8px 28px #0005}
      #sidewrite-mark-menu .pp-head{display:flex;align-items:baseline;justify-content:space-between}
      #sidewrite-mark-menu .pp-head span{font:700 9px system-ui,sans-serif;color:#9aa4b2;letter-spacing:.06em;text-transform:uppercase}
      #sidewrite-mark-menu .pp-head button{width:auto;height:auto;border:0;border-radius:0;background:transparent;color:#9aa4b2;cursor:pointer;font:700 14px/1 system-ui,sans-serif;padding:0 1px}
      #sidewrite-mark-menu .pp-head button:hover{color:#fff}
      #sidewrite-mark-menu .pp-actions{display:flex;gap:6px;justify-content:space-between}
      #sidewrite-mark-menu .pp-actions button{border:1px solid #d5dae3;border-radius:7px;padding:7px 11px;background:#fff;color:#20242b;cursor:pointer;font:600 12px system-ui,sans-serif}
      #sidewrite-mark-menu .pp-actions button.danger{background:#fff1f1;color:#a32626;border-color:#f0caca}
      #sidewrite-mark-menu .pp-swatches{display:flex;align-items:center;gap:8px}
      #sidewrite-mark-menu .pp-swatches span{font:700 9px system-ui,sans-serif;color:#9aa4b2;letter-spacing:.06em;text-transform:uppercase;margin-right:2px}
      #sidewrite-mark-menu .pp-swatches button{width:20px;height:20px;border-radius:50%;border:2px solid transparent;padding:0;background:var(--swatch);cursor:pointer;box-shadow:0 0 0 1px #ffffff66}
      #sidewrite-mark-menu .pp-swatches button:hover{transform:scale(1.14)}
      #sidewrite-mark-menu .pp-swatches button.selected{border-color:#fff;box-shadow:0 0 0 2px #385f98}
      #sidewrite-toast{display:none;left:50%;transform:translateX(-50%);bottom:24px;max-width:calc(100vw - 32px);text-align:center;background:#20242b;color:#fff;border:1px solid #454b55;border-radius:10px;padding:9px 13px;font:600 12px/1.4 system-ui,sans-serif;box-shadow:0 8px 28px #0005}
    `;
    document.documentElement.appendChild(style);

    toolbar = document.createElement("div");
    toolbar.id = "sidewrite-toolbar";
    toolbar.innerHTML = `<span class="pp-label">Highlight</span>
      ${Object.entries(COLORS)
        .map(
          ([c, v]) =>
            `<button data-color="${c}" title="${c}" style="--swatch:${v}"></button>`,
        )
        .join("")}
      <button class="pp-note" data-color="yellow">＋ Note</button>
      <button class="pp-close" data-close title="Close">×</button>`;
    document.documentElement.appendChild(toolbar);

    activeMarkMenu = document.createElement("div");
    activeMarkMenu.id = "sidewrite-mark-menu";
    activeMarkMenu.innerHTML = `<div class="pp-head"><span>Highlight</span><button data-action="close" title="Close">×</button></div>
      <div class="pp-swatches"><span>Color</span>${Object.entries(COLORS)
        .map(
          ([c, v]) =>
            `<button data-color="${c}" title="${c}" style="--swatch:${v}"></button>`,
        )
        .join("")}</div>
      <div class="pp-actions"><button data-action="edit">Edit note</button><button data-action="delete" class="danger">Delete highlight</button></div>`;
    document.documentElement.appendChild(activeMarkMenu);

    toolbar.addEventListener("mousedown", (e) => e.preventDefault());
    toolbar.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) {
        hideToolbar();
        return;
      }
      const b = e.target.closest("[data-color]");
      if (!b || !selectionData) return;
      createHighlight(b.dataset.color);
    });
    activeMarkMenu.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="close"]')) {
        hideMarkMenu();
        return;
      }
      if (!activeMarkMenu.dataset.id) return;
      const sw = e.target.closest("[data-color]");
      if (sw) {
        const id = activeMarkMenu.dataset.id;
        const mark = getMark(id);
        hideMarkMenu();
        changeColor(id, sw.dataset.color, mark);
        return;
      }
      const b = e.target.closest("[data-action]");
      if (!b) return;
      const id = activeMarkMenu.dataset.id;
      const mark = getMark(id);
      hideMarkMenu();
      if (b.dataset.action === "edit") focusSidebarEditor(id);
      if (b.dataset.action === "delete") deleteAnnotation(id, mark);
    });
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }
  function hideMarkMenu() {
    if (activeMarkMenu) activeMarkMenu.style.display = "none";
  }
  function contextFor(range, selected) {
    const parent =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const block = parent?.closest(BLOCK_SELECTOR) || parent;
    const text = block?.textContent || "";
    const at = text.indexOf(selected);
    return {
      prefix: at > 0 ? text.slice(Math.max(0, at - 100), at) : "",
      suffix:
        at >= 0
          ? text.slice(at + selected.length, at + selected.length + 100)
          : "",
    };
  }
  function wrapRange(range, color, id) {
    const mark = document.createElement("mark");
    mark.className = "sidewrite-mark";
    mark.dataset.sidewriteId = id;
    mark.dataset.swColor = SW.normalizeColor(color);
    mark.style.backgroundColor = SW.colorOf(color);
    mark.title = "SideWrite highlight — click for options";
    try {
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
      return mark;
    } catch (_) {
      return null;
    }
  }
  function showToast(text) {
    installUI();
    let toast = document.getElementById("sidewrite-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "sidewrite-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.display = "block";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }
  async function focusSidebarEditor(id) {
    try {
      const res = await browser.runtime.sendMessage({
        type: "EDIT_IN_SIDEBAR",
        id,
      });
      if (!res?.sidebarOpen) showToast(SW.SIDEBAR_CLOSED_MSG);
    } catch (_) {
      showToast(SW.SIDEBAR_CLOSED_MSG);
    }
  }
  async function changeColor(id, color, mark) {
    const prev = mark?.dataset.swColor || "yellow";
    applyMarkColor(mark, color);
    try {
      const res = await browser.runtime.sendMessage({
        type: "UPDATE_ANNOTATION",
        id,
        patch: { color },
      });
      if (!res?.ok) throw new Error("update failed");
    } catch (_) {
      applyMarkColor(mark, prev);
      showToast(
        "SideWrite couldn't change that color. Check that the extension is enabled.",
      );
    }
  }
  async function deleteAnnotation(id, mark) {
    if (!confirm(SW.CONFIRM_DELETE)) return;
    await browser.runtime.sendMessage({ type: "DELETE_ANNOTATION", id });
    if (mark) unwrapMark(mark);
  }
  function unwrapMark(mark) {
    if (!mark) return;
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
  async function createHighlight(color) {
    if (!selectionData) return;
    const saved = selectionData;
    selectionData = null;
    hideToolbar();
    const id = SW.makeId(),
      ctx = contextFor(saved.range, saved.text);
    const item = {
      id,
      url: location.href,
      title: document.title || location.hostname,
      selectedText: saved.text,
      exactText: saved.selectionText,
      color,
      note: "",
      prefix: ctx.prefix,
      suffix: ctx.suffix,
      createdAt: new Date().toISOString(),
    };
    const mark = wrapRange(saved.range, color, id);
    if (!mark) {
      alert(
        "SideWrite couldn't apply that selection. Try selecting text within a single paragraph.",
      );
      return;
    }
    try {
      await browser.runtime.sendMessage({
        type: "SAVE_ANNOTATION",
        annotation: item,
      });
      window.getSelection()?.removeAllRanges();
      focusSidebarEditor(id);
    } catch (_) {
      unwrapMark(mark);
      alert(
        "SideWrite couldn't save this highlight. Check that the extension is enabled.",
      );
    }
  }

  // Restore text anchors across inline elements within a paragraph/block, preferring matching context.
  function findAnchor(item) {
    const candidates = [...document.querySelectorAll(BLOCK_SELECTOR)].filter(
      (el) =>
        !el.closest(
          "script,style,noscript,textarea,input,select,button,[contenteditable=true],.sidewrite-mark",
        ) &&
        el.textContent &&
        el.textContent.includes(item.selectedText),
    );
    let best = null,
      bestScore = -1;
    for (const el of candidates) {
      const text = el.textContent,
        at = text.indexOf(item.selectedText);
      if (at < 0) continue;
      const before = text.slice(
        Math.max(0, at - (item.prefix || "").length),
        at,
      );
      const after = text.slice(
        at + item.selectedText.length,
        at + item.selectedText.length + (item.suffix || "").length,
      );
      let score = 0;
      if (item.prefix)
        for (let i = 1; i <= Math.min(before.length, item.prefix.length); i++) {
          if (before.slice(-i) === item.prefix.slice(-i)) score++;
          else break;
        }
      if (item.suffix)
        for (let i = 1; i <= Math.min(after.length, item.suffix.length); i++) {
          if (after.slice(0, i) === item.suffix.slice(0, i)) score++;
          else break;
        }
      if (score > bestScore) {
        bestScore = score;
        best = { el, at };
      }
    }
    if (!best) return null;
    const walker = document.createTreeWalker(best.el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(".sidewrite-mark")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let total = 0,
      n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: total, end: total + n.nodeValue.length });
      total += n.nodeValue.length;
    }
    const start = best.at,
      end = start + item.selectedText.length;
    const first = nodes.find((x) => x.start <= start && x.end > start);
    const last = [...nodes]
      .reverse()
      .find((x) => x.start < end && x.end >= end);
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }
  function restore(item) {
    if (!item || !item.selectedText) return;
    if (pageKey(item.url) !== pageKey(location.href)) return;
    if (getMark(item.id)) return;
    const range = findAnchor(item);
    if (range) wrapRange(range, item.color, item.id);
    else
      console.debug(
        "[SideWrite] could not re-anchor highlight",
        item.id,
        JSON.stringify(item.selectedText),
      );
  }
  async function restoreAll() {
    try {
      const r = await browser.runtime.sendMessage({ type: "GET_ANNOTATIONS" });
      pageItems = r?.annotations || [];
    } catch (_) {}
    applyMissing();
  }
  function applyMissing() {
    const key = pageKey(location.href);
    pageItems.filter((a) => pageKey(a.url) === key).forEach(restore);
  }

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      installUI();
      const sel = window.getSelection(),
        raw = sel?.toString() || "",
        text = raw.replace(/\s+/g, " ").trim();
      if (!text || !sel?.rangeCount) {
        hideToolbar();
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const parent = node.nodeType === 1 ? node : node.parentElement;
      if (range.collapsed || parent?.closest(".sidewrite-mark")) {
        hideToolbar();
        return;
      }
      selectionData = {
        range: range.cloneRange(),
        text,
        selectionText: raw,
      };
      const rect = range.getBoundingClientRect();
      toolbar.style.display = "flex";
      toolbar.style.left =
        Math.max(8, Math.min(rect.left, innerWidth - 340)) + "px";
      toolbar.style.top = Math.max(8, rect.top - 48) + "px";
    }, 20);
  });
  document.addEventListener("mousedown", (e) => {
    if (toolbar && !toolbar.contains(e.target)) hideToolbar();
    if (
      activeMarkMenu &&
      !activeMarkMenu.contains(e.target) &&
      !e.target.closest(".sidewrite-mark")
    )
      hideMarkMenu();
  });
  document.addEventListener(
    "click",
    (e) => {
      const mark = e.target.closest?.(".sidewrite-mark");
      if (!mark) return;
      e.preventDefault();
      e.stopPropagation();
      installUI();
      const rect = mark.getBoundingClientRect();
      activeMarkMenu.dataset.id = mark.dataset.sidewriteId;
      const current = SW.normalizeColor(mark.dataset.swColor);
      activeMarkMenu
        .querySelectorAll(".pp-swatches button")
        .forEach((b) =>
          b.classList.toggle("selected", b.dataset.color === current),
        );
      activeMarkMenu.style.display = "flex";
      activeMarkMenu.style.left =
        Math.max(8, Math.min(rect.left, innerWidth - 300)) + "px";
      activeMarkMenu.style.top =
        Math.max(8, Math.min(innerHeight - 92, rect.bottom + 6)) + "px";
    },
    true,
  );

  browser.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === "UPDATE_MARK") {
      applyMarkColor(getMark(message.id), message.color);
    }
    if (message.type === "REMOVE_MARK") {
      const mark = getMark(message.id);
      if (mark) unwrapMark(mark);
    }
  });

  installUI();
  restoreAll();

  // Keep the cached annotation list fresh from any source (sidebar edits, imports).
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SW.ANNOTATIONS_KEY]) restoreAll();
  });
  // Re-apply when the page's own rendering destroys marks, or the URL changes
  // without a reload (history API / hash settling after load). restore() skips
  // highlights already present, and the debounce lets wrapping settle first.
  let verifyTimer = 0;
  const scheduleApply = () => {
    clearTimeout(verifyTimer);
    verifyTimer = setTimeout(applyMissing, 250);
  };
  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("hashchange", scheduleApply);
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      scheduleApply();
      return result;
    };
  }
})();
