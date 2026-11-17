(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    api = window.NotionClient.create(),
    KEY = "workstation-notion-connection-v1";
  let pages = [],
    active = null,
    content = null,
    busy = false,
    mode = "preview",
    closed = new Set();
  try {
    closed = new Set(
      JSON.parse(localStorage.getItem("notion-page-tree")) || [],
    );
  } catch {}
  function status(text, error = false) {
    $("nr-status").textContent = text;
    $("nr-status").style.color = error ? "#d37a85" : "";
  }
  function controls() {
    for (const id of [
      "nr-connect",
      "nr-refresh",
      "nr-disconnect",
      "nr-submit",
      "nr-export",
      "nr-github",
    ])
      $(id).disabled = busy;
    $("nr-refresh").disabled = busy || !api.connected;
    $("nr-disconnect").disabled = busy || !api.connected;
    $("nr-export").disabled = busy || !content;
    $("nr-github").disabled = busy || !content;
    $("nr-connect").textContent = api.connected ? "连接设置" : "连接 Notion";
    window.refreshGithubDock?.();
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await fn();
    } catch (e) {
      if (/Token 无效/.test(e.message)) localStorage.removeItem(KEY);
      status(e.message, true);
      $("nr-error").textContent = e.message;
    } finally {
      busy = false;
      controls();
    }
  }
  function pageUrl(p) {
    try {
      const u = new URL(p.url);
      if (u.protocol === "https:" && /(^|\.)notion\.(so|com)$/.test(u.hostname))
        return u.href;
    } catch {}
    return "https://www.notion.so/" + p.id.replace(/-/g, "");
  }
  function tree() {
    const query = $("nr-search").value.toLowerCase().trim(),
      map = new Map(pages.map((p) => [p.id, p])),
      children = new Map(),
      visible = new Set();
    for (const p of pages) {
      const parent = map.has(p.parent) && p.parent !== p.id ? p.parent : "";
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(p);
      if (!query || p.title.toLowerCase().includes(query)) {
        let item = p;
        const seen = new Set();
        while (item && !seen.has(item.id)) {
          visible.add(item.id);
          seen.add(item.id);
          item = map.get(item.parent);
        }
      }
    }
    for (const arr of children.values())
      arr.sort((a, b) => a.title.localeCompare(b.title));
    $("nr-tree").replaceChildren();
    const visited = new Set();
    function row(p, depth) {
      if (visited.has(p.id) || !visible.has(p.id)) return;
      visited.add(p.id);
      const line = document.createElement("div");
      line.className =
        "notion-tree-row" + (active?.id === p.id ? " active" : "");
      line.style.paddingLeft = depth * 14 + "px";
      const toggle = document.createElement("button"),
        b = document.createElement("button");
      const kids = children.get(p.id) || [];
      toggle.textContent = kids.length
        ? closed.has(p.id) && !query
          ? "▸"
          : "▾"
        : "·";
      toggle.className = "notion-tree-toggle";
      toggle.disabled = !kids.length;
      toggle.setAttribute("aria-label", "展开或折叠 " + p.title);
      toggle.setAttribute("aria-expanded", String(!closed.has(p.id)));
      toggle.onclick = () => {
        if (closed.has(p.id)) closed.delete(p.id);
        else closed.add(p.id);
        localStorage.setItem("notion-page-tree", JSON.stringify([...closed]));
        tree();
      };
      b.textContent = (p.icon || "▤") + " " + p.title;
      b.title = p.title;
      b.onclick = () => run(() => openPage(p));
      line.append(toggle, b);
      $("nr-tree").append(line);
      if (query || !closed.has(p.id)) for (const c of kids) row(c, depth + 1);
    }
    for (const p of children.get("") || []) row(p, 0);
    if (!query && !pages.some((p) => !map.has(p.parent)))
      for (const p of pages) row(p, 0);
    $("nr-page-count").textContent = pages.length + " 个授权页面";
    if (!$("nr-tree").children.length) {
      const p = document.createElement("p");
      p.className = "extension-sidebar-hint";
      p.textContent = query
        ? "没有匹配的页面"
        : "没有可访问页面，请在 Notion 中将页面共享给该集成，再点击刷新。";
      $("nr-tree").append(p);
    }
  }
  function setMode(value) {
    mode = value;
    $("nr-preview").hidden = mode !== "preview";
    $("nr-source").hidden = mode !== "source";
    document.querySelectorAll("[data-nr-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.nrView === mode);
      b.setAttribute("aria-pressed", String(b.dataset.nrView === mode));
    });
  }
  async function openPage(p) {
    status("正在读取：" + p.title);
    const result = await api.read(p.id);
    active = p;
    content = result;
    $("nr-title").textContent = p.title;
    $("nr-edited").textContent = p.edited
      ? "更新于 " + new Date(p.edited).toLocaleString("zh-CN")
      : "NOTION";
    $("nr-original").href = pageUrl(p);
    $("nr-source").value = result.markdown;
    $("nr-preview").innerHTML =
      window.Notes.parse(result.markdown).html || "<p>此页面暂无正文。</p>";
    $("nr-preview")
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = true));
    $("nr-warning").hidden = !result.partial;
    $("nr-document").hidden = false;
    $("nr-empty").hidden = true;
    setMode("preview");
    tree();
    status(
      result.partial
        ? "页面已读取，部分内容受权限或块类型限制。"
        : "已读取 " + p.title + "；完整布局与附件可在 Notion 原页面查看。",
    );
  }
  async function refresh() {
    status("正在读取 Notion 授权页面…");
    pages = await api.list();
    tree();
    if (active) {
      const next = pages.find((p) => p.id === active.id);
      if (next) await openPage(next);
      else {
        active = null;
        content = null;
        $("nr-document").hidden = true;
        $("nr-empty").hidden = false;
      }
    }
    status(
      "已读取 " +
        pages.length +
        " 个授权页面。首次共享页面可能需要稍等片刻才能搜索到。",
    );
  }
  async function connect(token, remember) {
    pages = [];
    active = null;
    content = null;
    $("nr-document").hidden = true;
    $("nr-empty").hidden = false;
    tree();
    status("正在验证 Notion 连接…");
    await api.connect(token);
    if (remember) localStorage.setItem(KEY, JSON.stringify({ token }));
    else localStorage.removeItem(KEY);
    $("nr-dialog").close();
    await refresh();
  }
  $("nr-connect").onclick = $("nr-start").onclick = () => {
    $("nr-token").value = "";
    $("nr-remember").checked = !!localStorage.getItem(KEY);
    $("nr-error").textContent = "";
    $("nr-dialog").showModal();
  };
  $("nr-close").onclick = () => $("nr-dialog").close();
  $("nr-form").onsubmit = (e) => {
    e.preventDefault();
    const token = $("nr-token").value.trim(),
      remember = $("nr-remember").checked;
    $("nr-token").value = "";
    run(() => connect(token, remember));
  };
  $("nr-refresh").onclick = () => run(refresh);
  $("nr-search").oninput = tree;
  $("nr-disconnect").onclick = () => {
    if (busy) return;
    api.disconnect();
    localStorage.removeItem(KEY);
    pages = [];
    active = null;
    content = null;
    $("nr-document").hidden = true;
    $("nr-empty").hidden = false;
    tree();
    controls();
    status("已断开 Notion，并清除本机记住的 Token。");
  };
  const filename = () =>
    ((active?.title || "Notion 页面")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 70) || "Notion 页面") + ".md";
  function markdown() {
    return (
      "# " +
      active.title +
      "\n\n" +
      (content.partial
        ? "> 注意：此备份包含部分读取内容，完整页面请在 Notion 查看。\n\n"
        : "") +
      content.markdown
    );
  }
  $("nr-export").onclick = () => {
    if (!content) return;
    const url = URL.createObjectURL(
        new Blob([markdown()], { type: "text/markdown;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = filename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("nr-github").onclick = () =>
    run(async () => {
      if (!content) return;
      if (!window.WorkstationGitHub.context().connected) {
        $("gh-open").click();
        return;
      }
      const text = markdown(),
        name = "Notion/" + filename(),
        file = await window.WorkstationGitHub.read(name);
      if (
        file &&
        file.text !== text &&
        !confirm("GitHub 已有同名备份，替换为当前 Notion 内容？")
      )
        return;
      await window.WorkstationGitHub.save(name, text, file?.sha || null);
      status("已备份到 GitHub：" + name);
    });
  document
    .querySelectorAll("[data-nr-view]")
    .forEach((b) => (b.onclick = () => setMode(b.dataset.nrView)));
  window.NotionWorkspace = {
    state: () => ({ connected: api.connected, busy }),
    refresh: () => run(refresh),
  };
  controls();
  tree();
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  if (saved?.token) run(() => connect(saved.token, true));
})();
