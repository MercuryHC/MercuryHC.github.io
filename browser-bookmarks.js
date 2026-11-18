(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.BrowserBookmarksCore,
    db = window.BrowserBookmarksStore.create();
  let sources = [],
    all = [],
    source = "",
    folder = "",
    page = 1,
    pending = null,
    busy = false,
    bridge = "",
    connected = false;
  const queue = new Map(),
    closed = new Set();
  function status(message, error = false) {
    $("br-status").textContent = message;
    $("br-status").style.color = error ? "#ce6575" : "";
  }
  function button(text, handler, cls = "sidebar-quiet") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.onclick = handler;
    return b;
  }
  async function reload() {
    sources = (await db.load()).map(core.validate);
    all = core.rows(sources);
    if (source && !sources.some((s) => s.id === source)) {
      source = "";
      folder = "";
    }
    render();
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
      await reload();
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      drain();
    }
  }
  function select(id = "", dir = "") {
    source = id;
    folder = dir;
    page = 1;
    render();
  }
  function renderTree() {
    const root = $("br-tree");
    root.replaceChildren(button("全部书签", () => select(), "br-tree-all"));
    for (const s of sources) {
      const row = document.createElement("div");
      row.className = "br-tree-source";
      row.append(
        button(
          (closed.has(s.id) ? "▸ " : "▾ ") + s.name,
          () => {
            if (closed.has(s.id)) closed.delete(s.id);
            else closed.add(s.id);
            select(s.id);
          },
          source === s.id && !folder ? "nav active" : "nav",
        ),
      );
      root.append(row);
      if (closed.has(s.id)) continue;
      const map = new Map();
      for (const f of s.folders) {
        if (!map.has(f.parent)) map.set(f.parent, []);
        map.get(f.parent).push(f);
      }
      function branch(parent, depth) {
        for (const f of map.get(parent) || []) {
          const key = s.id + ":" + f.id,
            r = document.createElement("div");
          r.className = "br-tree-row";
          r.style.paddingLeft = Math.min(depth, 12) * 10 + "px";
          const children = map.has(f.id);
          r.append(
            button(
              children ? (closed.has(key) ? "▸" : "▾") : "·",
              () => {
                if (closed.has(key)) closed.delete(key);
                else closed.add(key);
                renderTree();
              },
              "br-tree-toggle",
            ),
          );
          const b = button(
            f.title,
            () => select(s.id, f.id),
            folder === f.id && source === s.id ? "nav active" : "nav",
          );
          b.title = f.title;
          r.append(b);
          root.append(r);
          if (!closed.has(key)) branch(f.id, depth + 1);
        }
      }
      branch("", 0);
    }
  }
  function render() {
    renderTree();
    $("br-total").textContent = all.length.toLocaleString();
    $("br-source-count").textContent = sources.length;
    $("br-folder-count").textContent = sources.reduce(
      (n, s) => n + s.folders.length,
      0,
    );
    const sel = $("br-source");
    sel.replaceChildren(new Option("全部来源", ""));
    sources.forEach((s) => sel.add(new Option(s.name, s.id)));
    sel.value = source;
    const selected = sources.find((s) => s.id === source),
      rows = core.search(
        all,
        $("br-search").value,
        source,
        folder,
        $("br-sort").value,
        selected?.folders || [],
      ),
      pages = Math.max(1, Math.ceil(rows.length / 50));
    page = Math.min(page, pages);
    $("br-result-count").textContent =
      rows.length +
      " 条书签" +
      (folder
        ? " · " + (selected?.folders.find((f) => f.id === folder)?.title || "")
        : "");
    $("br-page").textContent = page + " / " + pages;
    $("br-prev").disabled = page <= 1;
    $("br-next").disabled = page >= pages;
    $("br-remove").disabled = !source;
    $("br-export").disabled = !sources.length;
    const list = $("br-results");
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "br-empty";
      empty.textContent = all.length
        ? "没有匹配的书签，试试网址、目录或其他关键词。"
        : "让书签回到视野中。导入浏览器导出的 HTML，或连接扩展开始同步。";
      list.append(empty);
    }
    for (const b of rows.slice((page - 1) * 50, page * 50)) {
      const row = document.createElement("article");
      row.className = "br-result";
      const mark = document.createElement("span");
      mark.className = "br-domain-mark";
      mark.textContent = new URL(b.url).hostname[0].toUpperCase();
      const content = document.createElement("div");
      content.className = "br-result-content";
      const a = document.createElement("a");
      a.href = b.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = b.title;
      a.title = b.url;
      const url = document.createElement("p");
      url.textContent = b.url;
      const path = document.createElement("small");
      path.textContent =
        b.sourceName + " · " + b.browser + (b.path ? " / " + b.path : "");
      content.append(a, url, path);
      if (b.description) {
        const desc = document.createElement("p");
        desc.className = "br-description";
        desc.textContent = b.description;
        content.append(desc);
      }
      const add = button("加入主页", () => {
        const result = window.BookmarksWorkspace?.add(b);
        status(
          result
            ? "已加入主页「浏览器书签」分组，可通过主页的 GitHub 菜单保存。"
            : "主页已有此链接，或保存失败。",
        );
      });
      row.append(mark, content, add);
      list.append(row);
    }
  }
  $("br-search").oninput = () => {
    page = 1;
    render();
  };
  $("br-source").onchange = (e) => select(e.target.value);
  $("br-sort").onchange = () => {
    page = 1;
    render();
  };
  $("br-prev").onclick = () => {
    page--;
    render();
  };
  $("br-next").onclick = () => {
    page++;
    render();
  };
  $("br-import").onclick = () => $("br-file").click();
  $("br-import-close").onclick = () => $("br-import-dialog").close();
  $("br-file").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024) throw Error("书签文件不能超过30MB。");
      const raw = await file.text(),
        meta = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ""),
          browser: "其他",
        };
      let result;
      if (/^\s*[\[{]/.test(raw)) {
        const json = JSON.parse(raw);
        if (json.schemaVersion === 1 && Array.isArray(json.sources)) {
          if (json.sources.length > 100) throw Error("备份最多包含100个来源。");
          const records = json.sources.map(core.validate);
          if (new Set(records.map((s) => s.id)).size !== records.length)
            throw Error("备份来源 ID 重复。");
          pending = { records };
          result = {
            source: {
              items: records.flatMap((s) => s.items),
              folders: records.flatMap((s) => s.folders),
              name: "备份恢复",
            },
            skipped: 0,
          };
        } else {
          const tree = json.roots ? Object.values(json.roots) : json;
          result = core.fromTree(tree, { ...meta, mode: "json" });
          pending = result;
        }
      } else {
        result = core.fromHtml(raw, meta);
        pending = result;
      }
      $("br-preview").textContent =
        `识别到 ${result.source.items.length} 条链接、${result.source.folders.length} 个目录。已过滤 ${result.skipped} 条重复或不安全链接。` +
        (pending.records ? "恢复备份会替换 ID 相同的来源，其他来源保留。" : "");
      $("br-import-name").value = result.source.name;
      $("br-import-name").disabled = !!pending.records;
      $("br-import-browser").disabled = !!pending.records;
      $("br-import-target").disabled = !!pending.records;
      $("br-import-target").replaceChildren(new Option("新增独立来源", ""));
      sources
        .filter((s) => s.mode !== "extension")
        .forEach((s) =>
          $("br-import-target").add(new Option("更新「" + s.name + "」", s.id)),
        );
      $("br-import-dialog").showModal();
    } catch (e) {
      pending = null;
      status(e.message, true);
    }
  };
  $("br-import-form").onsubmit = (e) => {
    e.preventDefault();
    if (!pending) return;
    const p = pending;
    run(async () => {
      const records = p.records || [
        core.validate({
          ...p.source,
          id: $("br-import-target").value || p.source.id,
          name: $("br-import-name").value,
          browser: $("br-import-browser").value,
        }),
      ];
      await db.save(records);
      pending = null;
      $("br-import-dialog").close();
      status(
        "已导入 " +
          records.reduce((n, s) => n + s.items.length, 0) +
          " 条书签，数据保存在当前浏览器。",
      );
    });
  };
  $("br-undo").onclick = () =>
    run(async () => {
      await db.undo();
      status("已撤销最近一次导入或移除。");
    });
  $("br-remove").onclick = () => {
    const s = sources.find((s) => s.id === source);
    if (
      s &&
      confirm("从工作站移除「" + s.name + "」？不会修改浏览器原书签，可撤销。")
    )
      run(async () => {
        await db.remove(s.id);
        source = "";
        folder = "";
        status("已移除本机快照；扩展自动同步开启时，下次更新可能重新导入。");
      });
  };
  $("br-export").onclick = () => {
    const blob = new Blob(
        [JSON.stringify({ schemaVersion: 1, sources }, null, 2)],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      "browser-bookmarks-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  $("br-connect").onclick = () => $("br-help-dialog").showModal();
  $("br-help-close").onclick = () => $("br-help-dialog").close();
  function send(type) {
    if (bridge)
      window.postMessage(
        { channel: "workstation-bookmarks-page-v1", bridgeId: bridge, type },
        location.origin,
      );
  }
  $("br-read-now").onclick = () => {
    if (connected) {
      send("read-now");
      status("正在读取浏览器书签…");
    } else $("br-help-dialog").showModal();
  };
  async function drain() {
    if (busy || !queue.size) return;
    const [id, s] = queue.entries().next().value;
    queue.delete(id);
    if (sources.find((x) => x.id === s.id)?.revision === s.revision) {
      drain();
      return;
    }
    await run(async () => {
      await db.save([s]);
      status(
        "已同步「" +
          s.name +
          "」 · " +
          s.items.length +
          " 条书签。原浏览器书签保持不变。",
      );
    });
  }
  window.addEventListener("message", (e) => {
    if (
      e.source !== window ||
      e.origin !== location.origin ||
      e.data?.channel !== "workstation-bookmarks-extension-v1"
    )
      return;
    const m = e.data;
    if (m.type === "hello" && typeof m.bridgeId === "string") {
      bridge = m.bridgeId;
      send("ready");
      return;
    }
    if (m.bridgeId !== bridge || !bridge) return;
    if (m.type === "state") {
      connected = true;
      $("br-extension-state").textContent = m.autoSync
        ? "自动同步"
        : "手动同步";
    } else if (m.type === "error")
      status(String(m.message).slice(0, 500), true);
    else if (m.type === "snapshot") {
      try {
        const s = core.validate(m.source);
        if (s.mode !== "extension" || !s.id.startsWith("extension-"))
          throw Error("扩展快照来源无效。");
        queue.set(s.id, s);
        drain();
      } catch (error) {
        status(error.message, true);
      }
    }
  });
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("workstation-bookmarks-refresh-v1")
      : null;
  channel?.addEventListener("message", () => {
    if (!busy) reload().catch((e) => status(e.message, true));
  });
  const originalSave = db.save,
    originalRemove = db.remove,
    originalUndo = db.undo;
  for (const [key, fn] of [
    ["save", originalSave],
    ["remove", originalRemove],
    ["undo", originalUndo],
  ])
    db[key] = async (...args) => {
      const result = await fn(...args);
      channel?.postMessage("changed");
      return result;
    };
  window.BrowserBookmarksWorkspace = {
    storageExport: () => db.load(),
    async storageImport(records) { await db.replace(records.map(core.validate)); await reload(); channel?.postMessage("changed"); }
  };
  reload().catch((e) => status("无法打开本机书签存储：" + e.message, true));
})();
