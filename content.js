(() => {
  if (window.__sideWriteV03) return;
  window.__sideWriteV03 = true;

  const COLORS = {
    yellow: "#ffe58a",
    green: "#b8edc4",
    blue: "#b9dcff",
    pink: "#ffc7df",
    purple: "#ddc8ff",
  };
  const $ = (id) => document.getElementById(id);
  let selectionData = null;
  let toolbar = null;
  let activeMarkMenu = null;

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const makeId = () =>
    "pp-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
  const escAttr = (s) => CSS.escape(String(s));

  function installUI() {
    if ($("sidewrite-style")) return;
    const style = document.createElement("style");
    style.id = "sidewrite-style";
    style.textContent = `
      .sidewrite-mark{border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer;color:#0b0b0c!important}
      #sidewrite-toolbar,#sidewrite-mark-menu,#sidewrite-toast{position:fixed;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;box-sizing:border-box}
      #sidewrite-toolbar{display:none;align-items:center;gap:7px;padding:8px 10px;background:#20242b;color:#fff;border:1px solid #454b55;border-radius:12px;box-shadow:0 8px 28px #0005}
      #sidewrite-toolbar .pp-label{font-weight:700;margin-right:2px}
      #sidewrite-toolbar button{border:1px solid #ffffff88;border-radius:50%;width:23px;height:23px;background:var(--swatch);cursor:pointer;padding:0}
      #sidewrite-toolbar button.pp-note{width:auto;height:27px;border-radius:7px;padding:0 10px;background:#3b5578;color:white;border-color:#64748b;font-weight:650}
      #sidewrite-mark-menu{display:none;flex-direction:column;gap:8px;padding:8px;background:#20242b;border:1px solid #454b55;border-radius:10px;box-shadow:0 8px 28px #0005}
      #sidewrite-mark-menu .pp-actions{display:flex;gap:6px}
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
      <button class="pp-note" data-color="yellow">＋ Note</button>`;
    document.documentElement.appendChild(toolbar);

    activeMarkMenu = document.createElement("div");
    activeMarkMenu.id = "sidewrite-mark-menu";
    activeMarkMenu.innerHTML = `<div class="pp-swatches"><span>Color</span>${Object.entries(
      COLORS,
    )
      .map(
        ([c, v]) =>
          `<button data-color="${c}" title="${c}" style="--swatch:${v}"></button>`,
      )
      .join("")}</div>
      <div class="pp-actions"><button data-action="edit">Edit note</button><button data-action="delete" class="danger">Delete highlight</button></div>`;
    document.documentElement.appendChild(activeMarkMenu);

    toolbar.addEventListener("mousedown", (e) => e.preventDefault());
    toolbar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-color]");
      if (!b || !selectionData) return;
      createHighlight(b.dataset.color);
    });
    activeMarkMenu.addEventListener("click", (e) => {
      if (!activeMarkMenu.dataset.id) return;
      const sw = e.target.closest("[data-color]");
      if (sw) {
        const id = activeMarkMenu.dataset.id;
        const mark = document.querySelector(
          `[data-sidewrite-id="${escAttr(id)}"]`,
        );
        hideMarkMenu();
        changeColor(id, sw.dataset.color, mark);
        return;
      }
      const b = e.target.closest("[data-action]");
      if (!b) return;
      const id = activeMarkMenu.dataset.id;
      const mark = document.querySelector(
        `[data-sidewrite-id="${escAttr(id)}"]`,
      );
      hideMarkMenu();
      if (b.dataset.action === "edit") editAnnotation(id);
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
    const block =
      parent?.closest("p,li,blockquote,td,th,div,section,article") || parent;
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
    mark.dataset.swColor = color;
    mark.style.backgroundColor = COLORS[color] || COLORS.yellow;
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
    let toast = $("sidewrite-toast");
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
      if (!res?.sidebarOpen)
        showToast(
          "SideWrite sidebar is closed — open it from the toolbar to edit this note.",
        );
    } catch (_) {
      showToast(
        "SideWrite sidebar is closed — open it from the toolbar to edit this note.",
      );
    }
  }
  function editAnnotation(id) {
    focusSidebarEditor(id);
  }
  async function changeColor(id, color, mark) {
    const prev = mark?.dataset.swColor || "yellow";
    if (mark) {
      mark.style.backgroundColor = COLORS[color] || COLORS.yellow;
      mark.dataset.swColor = color;
    }
    try {
      const res = await browser.runtime.sendMessage({
        type: "UPDATE_ANNOTATION",
        id,
        patch: { color },
      });
      if (!res?.ok) throw new Error("update failed");
    } catch (_) {
      if (mark) {
        mark.style.backgroundColor = COLORS[prev] || COLORS.yellow;
        mark.dataset.swColor = prev;
      }
      showToast(
        "SideWrite couldn't change that color. Check that the extension is enabled.",
      );
    }
  }
  async function deleteAnnotation(id, mark) {
    if (
      !confirm(
        "Delete this highlight and its attached note? This cannot be undone.",
      )
    )
      return;
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
    const id = makeId(),
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
    const selectors = "p,li,blockquote,td,th,div,section,article";
    const candidates = [...document.querySelectorAll(selectors)].filter(
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
    if (!item || item.url !== location.href || !item.selectedText) return;
    if (document.querySelector(`[data-sidewrite-id="${escAttr(item.id)}"]`))
      return;
    const range = findAnchor(item);
    if (range) wrapRange(range, item.color, item.id);
  }
  async function restoreAll() {
    try {
      const r = await browser.runtime.sendMessage({ type: "GET_ANNOTATIONS" });
      (r?.annotations || [])
        .filter((a) => a.url === location.href)
        .forEach(restore);
    } catch (_) {}
  }

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      installUI();
      const sel = window.getSelection(),
        text = clean(sel?.toString());
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
        selectionText: sel.toString(),
      };
      const rect = range.getBoundingClientRect();
      toolbar.style.display = "flex";
      toolbar.style.left =
        Math.max(8, Math.min(rect.left, innerWidth - 300)) + "px";
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
      const current = mark.dataset.swColor || "yellow";
      activeMarkMenu
        .querySelectorAll(".pp-swatches button")
        .forEach((b) =>
          b.classList.toggle("selected", b.dataset.color === current),
        );
      activeMarkMenu.style.display = "flex";
      activeMarkMenu.style.left =
        Math.max(8, Math.min(rect.left, innerWidth - 270)) + "px";
      activeMarkMenu.style.top =
        Math.max(8, Math.min(innerHeight - 92, rect.bottom + 6)) + "px";
    },
    true,
  );

  browser.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === "UPDATE_MARK") {
      const mark = document.querySelector(
        `[data-sidewrite-id="${escAttr(message.id)}"]`,
      );
      if (mark) {
        mark.style.backgroundColor = COLORS[message.color] || COLORS.yellow;
        mark.dataset.swColor = message.color;
      }
    }
    if (message.type === "REMOVE_MARK") {
      const mark = document.querySelector(
        `[data-sidewrite-id="${escAttr(message.id)}"]`,
      );
      if (mark) unwrapMark(mark);
    }
  });

  installUI();
  restoreAll();
})();
