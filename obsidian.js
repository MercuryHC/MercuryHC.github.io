/* Shared local-vault editor. Directory access is granted by the user, never inferred. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.ObsidianCore;
  let root = null,
    vaultId = "",
    entries = [],
    active = null,
    base = "",
    dirty = false,
    busy = false,
    conflict = null,
    settings = {};
  const dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open("workstation-obsidian-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vaults");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  async function savedHandle(value) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("vaults", value ? "readwrite" : "readonly"),
        store = tx.objectStore("vaults"),
        r = value ? store.put(value, "current") : store.get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function status(text, error = false) {
    $("ob-status").textContent = text;
    $("ob-status").style.color = error ? "#c45860" : "";
  }
  const noteKey = () => "obsidian-drafts:" + vaultId;
  function drafts() {
    try {
      return JSON.parse(localStorage.getItem(noteKey())) || {};
    } catch {
      return {};
    }
  }
  function stash() {
    if (!active) return;
    const all = drafts();
    if (dirty) all[active.path] = { text: $("ob-body").value, base };
    else delete all[active.path];
    try {
      localStorage.setItem(noteKey(), JSON.stringify(all));
    } catch {
      status("草稿缓存空间不足，请尽快保存到本地文件。", true);
    }
  }
  function configSave() {
    if (!vaultId) return;
    settings = {
      name: $("ob-vault-name").value.trim(),
      prefix: $("ob-remote-path").value.trim(),
    };
    localStorage.setItem(
      "obsidian-settings:" + vaultId,
      JSON.stringify(settings),
    );
    uri();
  }
  function uri() {
    if (!root) return;
    $("ob-open").href =
      "obsidian://open?vault=" +
      encodeURIComponent($("ob-vault-name").value.trim() || root.name) +
      (active ? "&file=" + encodeURIComponent(active.path) : "");
  }
  function state() {
    const n = active;
    $("ob-document").hidden = !n;
    $("ob-empty").hidden = !!n;
    $("ob-state").textContent = dirty
      ? "网页草稿待保存（尚未写入 Obsidian 文件）"
      : "与本地文件一致";
    for (const id of ["ob-rescan", "ob-new", "ob-upload-all"])
      $(id).disabled = busy || !root;
    for (const id of ["ob-save", "ob-upload", "ob-reload"])
      $(id).disabled = busy || !active;
    $("ob-folder").disabled = busy;
    $("ob-body").disabled = busy;
    $("ob-vault-name").disabled = busy;
    $("ob-remote-path").disabled = busy;
    $("ob-connect-git").disabled = busy;
  }
  function preview() {
    $("ob-preview").innerHTML = window.Notes.parse($("ob-body").value).html;
    state();
  }
  function list() {
    const q = $("ob-search").value.toLowerCase();
    $("ob-list").replaceChildren();
    for (const e of entries.filter((e) => e.path.toLowerCase().includes(q))) {
      const b = document.createElement("button");
      b.className = "notebook-list-item" + (e === active ? " active" : "");
      b.textContent = e.path;
      b.onclick = () => run(() => open(e));
      $("ob-list").append(b);
    }
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    state();
    try {
      await fn();
    } catch (e) {
      if (e.name !== "AbortError") status(e.message, true);
    } finally {
      busy = false;
      state();
    }
  }
  async function open(e) {
    stash();
    const text = await core.read(e.handle);
    active = e;
    const draft = drafts()[e.path];
    base = draft?.base ?? text;
    $("ob-body").value = draft?.text ?? text;
    dirty = $("ob-body").value !== base;
    $("ob-file-path").textContent = e.path;
    uri();
    preview();
    list();
    status(
      draft && draft.base !== text
        ? "客户端文件已有变化，已恢复网页草稿；请对比或重新读取后保存。"
        : "已打开 " + e.path,
    );
  }
  async function scan() {
    if (!root) return;
    stash();
    entries = await core.scan(root);
    if (active) {
      const found = entries.find((e) => e.path === active.path);
      if (found) {
        if (!dirty) await open(found);
        else active = found;
      } else {
        status("当前文件已在磁盘删除；网页草稿保留，请另建笔记保存。", true);
      }
    }
    list();
    status(
      "已读取 " + entries.length + " 篇 Markdown；网页草稿不会覆盖客户端修改。",
    );
  }
  async function connect() {
    if (!window.showDirectoryPicker)
      throw Error("当前浏览器不支持文件夹读写，请使用桌面 Chrome 或 Edge。");
    const handle = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "obsidian-vault",
    });
    stash();
    const prior = await savedHandle().catch(() => null);
    vaultId =
      prior && (await handle.isSameEntry(prior.handle))
        ? prior.id
        : crypto.randomUUID();
    root = handle;
    active = null;
    dirty = false;
    await savedHandle({ handle, id: vaultId });
    try {
      settings =
        JSON.parse(localStorage.getItem("obsidian-settings:" + vaultId)) || {};
    } catch {
      settings = {};
    }
    $("ob-vault-name").value = settings.name || root.name;
    $("ob-remote-path").value =
      settings.prefix || "taskspace.obsidian/" + root.name;
    configSave();
    await scan();
  }
  async function save() {
    if (!active) return;
    const text = $("ob-body").value;
    const before = await core.read(active.handle);
    if (before !== base) {
      status(
        "客户端文件与网页草稿不同，已阻止覆盖；草稿保留，可复制内容或重新读取。",
        true,
      );
      return;
    }
    await core.write(active.handle, text, base);
    base = text;
    dirty = $("ob-body").value !== base;
    stash();
    preview();
    status("已保存到本地仓库，Obsidian 会读取同一文件。");
  }
  const syncKey = () =>
    "obsidian-github-base:" +
    JSON.stringify([
      window.WorkstationGitHub.context().key,
      vaultId,
      $("ob-remote-path").value.trim(),
    ]);
  async function upload(all = false, force = {}) {
    if (!window.WorkstationGitHub.context().connected) {
      $("gh-open").click();
      return;
    }
    if (dirty) throw Error("请先保存网页草稿到本地仓库，再上传。");
    configSave();
    const targets = all ? entries : active ? [active] : [];
    if (!targets.length) throw Error("没有可上传的 Markdown 文件。");
    if (
      all &&
      !confirm(
        "上传 " +
          targets.length +
          " 篇 Markdown 到 " +
          window.WorkstationGitHub.context().repository +
          "/" +
          settings.prefix +
          "？仅上传笔记，不删除 GitHub 文件。",
      )
    )
      return;
    const files = [];
    for (const e of targets)
      files.push({ path: e.path, text: await core.read(e.handle) });
    let baselines = {};
    try {
      baselines = JSON.parse(localStorage.getItem(syncKey())) || {};
    } catch {}
    status("正在上传 " + files.length + " 篇 Markdown…");
    const result = await window.ObsidianGitHub.upload(
      settings.prefix,
      files,
      baselines,
      force,
    );
    if (result.conflicts.length) {
      conflict = result.conflicts[0];
      $("ob-local-version").textContent =
        conflict.path + "\n\n" + conflict.local;
      $("ob-remote-version").textContent =
        conflict.remote?.text || "远端文件已被删除";
      $("ob-conflict").showModal();
      status(
        "有 " +
          result.conflicts.length +
          " 篇远端冲突；本次批量上传未写入，请逐篇处理后重试。",
        true,
      );
      return;
    }
    localStorage.setItem(
      syncKey(),
      JSON.stringify({ ...baselines, ...result.saved }),
    );
    status(
      "已上传 " +
        files.length +
        " 篇 Markdown。保留子文件夹路径；客户端后续修改需再次上传。",
    );
  }
  $("ob-folder").onclick = () => run(connect);
  $("ob-rescan").onclick = () => run(scan);
  $("ob-search").oninput = list;
  $("ob-save").onclick = () => run(save);
  $("ob-upload").onclick = () => run(() => upload());
  $("ob-upload-all").onclick = () => run(() => upload(true));
  $("ob-connect-git").onclick = () => $("gh-open").click();
  $("ob-body").oninput = () => {
    dirty = $("ob-body").value !== base;
    stash();
    preview();
  };
  $("ob-preview").onchange = (e) => {
    const c = e.target.closest("[data-note-line]");
    if (c) {
      $("ob-body").value = window.Notes.toggle(
        $("ob-body").value,
        Number(c.dataset.noteLine),
        c.checked,
      );
      $("ob-body").oninput();
    }
  };
  $("ob-body").onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      run(save);
    }
  };
  $("ob-reload").onclick = () =>
    run(async () => {
      if (dirty && !confirm("丢弃当前网页草稿并读取客户端文件？")) return;
      dirty = false;
      stash();
      await open(active);
    });
  $("ob-vault-name").onchange = configSave;
  $("ob-remote-path").onchange = configSave;
  $("ob-new").onclick = () =>
    run(async () => {
      const path = prompt("输入笔记相对路径（例如 学习/编译器.md）");
      if (!path) return;
      if (!core.validPath(path))
        throw Error("请输入有效的 .md 相对路径，不能包含隐藏目录或 ..。");
      let dir = root;
      const parts = path.split("/");
      for (const part of parts.slice(0, -1))
        dir = await dir.getDirectoryHandle(part, { create: true });
      try {
        await dir.getFileHandle(parts.at(-1));
        throw Error("已有同名文件，请选择其他名称。");
      } catch (e) {
        if (e.name !== "NotFoundError") throw e;
      }
      const handle = await dir.getFileHandle(parts.at(-1), { create: true });
      await scan();
      await open(entries.find((e) => e.path === path) || { path, handle });
    });
  $("ob-conflict-cancel").onclick = () => {
    $("ob-conflict").close();
    conflict = null;
  };
  $("ob-force-upload").onclick = () =>
    run(async () => {
      if (!conflict) return;
      const c = conflict,
        e = entries.find((e) => e.path === c.path);
      if (!e) throw Error("本地文件不再存在，请刷新。");
      if ((await core.read(e.handle)) !== c.local)
        throw Error("本地内容又有更新，请关闭弹窗后重新上传。");
      $("ob-conflict").close();
      const old = active;
      active = e;
      try {
        await upload(false, { [c.path]: c.remote?.sha || "recreate" });
      } finally {
        active = old;
        state();
      }
    });
  window.addEventListener("focus", () => {
    if (root && !busy && !dirty) run(scan);
  });
  window.addEventListener("beforeunload", (e) => {
    stash();
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  state();
  savedHandle()
    .then(async (saved) => {
      if (!saved || root) return;
      if (
        (await saved.handle.queryPermission({ mode: "readwrite" })) !==
        "granted"
      ) {
        status("曾关联过本地仓库；请点击「关联本地仓库」重新授权。");
        return;
      }
      root = saved.handle;
      vaultId = saved.id;
      try {
        settings =
          JSON.parse(localStorage.getItem("obsidian-settings:" + vaultId)) ||
          {};
      } catch {}
      $("ob-vault-name").value = settings.name || root.name;
      $("ob-remote-path").value =
        settings.prefix || "taskspace.obsidian/" + root.name;
      await run(scan);
    })
    .catch(() => status("无法恢复文件夹授权，请手动关联本地仓库。"));
})();
