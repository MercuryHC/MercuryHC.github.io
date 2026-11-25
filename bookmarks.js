(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.BookmarksCore,
    KEY = "workstation-bookmarks-v1",
    UNDO = KEY + ":undo";
  let data = core.defaults(),
    group = "",
    editing = null,
    dragging = null,
    syncBusy = false,
    syncSession = null;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) data = core.validate(JSON.parse(saved));
  } catch {
    $("bm-status").textContent =
      "收藏数据读取失败，已显示预置入口；原数据仍在本机。";
  }
  function clone() {
    return JSON.parse(JSON.stringify({...data,...(window.HomeDesktop?.storageExport?{layout:window.HomeDesktop.storageExport()}: {})}));
  }
  function status(s, error = false) {
    $("bm-status").textContent = s;
    $("bm-status").style.color = error ? "#d37a85" : "";
  }
  function commit(next) {
    try {
      const clean = core.validate(next);
      localStorage.setItem(UNDO, JSON.stringify(clone()));
      const oldLayout=window.HomeDesktop?.storageExport?.();
      if(clean.layout)window.HomeDesktop?.storageImport?.(clean.layout);
      try {localStorage.setItem(KEY, JSON.stringify(clean));}
      catch(e){if(oldLayout)window.HomeDesktop.storageImport(oldLayout);throw e;}
      data = clean;
      if (group && !data.groups.includes(group)) group = "";
      render();
      status("已自动保存到此浏览器。");
      return true;
    } catch (e) {
      status(e.message, true);
      return false;
    }
  }
  function icon(b) {
    const box = document.createElement("span");
    box.className = "bookmark-icon";
    box.style.background = b.color;
    const value = b.icon;
    const builtin = Object.hasOwn(core.icons, value) ? core.icons[value] : null;
    if (value.startsWith("http")) {
      const img = document.createElement("img");
      img.draggable = false;
      img.src = core.url(value);
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        box.textContent = b.title.slice(0, 1);
      };
      box.append(img);
    } else if (builtin?.startsWith("<path")) {
      box.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">' +
        builtin +
        "</svg>";
    } else box.textContent = builtin || value || b.title.slice(0, 1);
    return box;
  }
  function render() {
    window.refreshGithubDock?.();
    const q = $("bm-search").value.toLowerCase().trim();
    $("bm-groups").replaceChildren();
    for (const name of ["", ...data.groups]) {
      const b = document.createElement("button");
      b.className = "nav" + (group === name ? " active" : "");
      b.textContent =
        (name ? "▱ " : "▦ ") +
        (name || "全部收藏") +
        " · " +
        data.items.filter((x) => !name || x.group === name).length;
      b.onclick = () => {
        group = name;
        render();
      };
      $("bm-groups").append(b);
    }
    $("bm-heading").textContent = group || "全部收藏";
    $("bm-group-delete").disabled = !group;
    $("bm-undo").disabled = !localStorage.getItem(UNDO);
    $("bm-grid").replaceChildren();
    for (const b of data.items.filter(
      (x) =>
        (!group || x.group === group) &&
        (!q ||
          (x.title + " " + x.url + " " + x.group).toLowerCase().includes(q)),
    )) {
      const tile = document.createElement("div");
      tile.className = "bookmark-card";
      tile.draggable = true;
      tile.dataset.bookmarkId = b.id;
      const a = document.createElement("a");
      a.draggable = false;
      a.href = b.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = b.url;
      const title = document.createElement("strong");
      title.textContent = b.title;
      a.append(icon(b), title);
      const edit = document.createElement("button");
      edit.className = "bookmark-edit";
      edit.textContent = "•••";
      edit.title = "编辑 " + b.title;
      edit.setAttribute("aria-label", "编辑 " + b.title);
      edit.onclick = () => open(b.id);
      tile.append(a, edit);
      tile.ondragstart = (e) => {
        if (syncBusy) { e.preventDefault(); return; }
        dragging = b.id;
        e.dataTransfer.setData("text/plain", b.id);
        e.dataTransfer.effectAllowed = "move";
        tile.classList.add("dragging");
      };
      tile.ondragend = clearDrag;
      a.onkeydown = e => {
        if (!e.altKey || !["ArrowLeft", "ArrowRight"].includes(e.key) || syncBusy) return;
        e.preventDefault();
        const visible = [...$("bm-grid").children].filter(x => x.dataset.bookmarkId);
        const i = visible.indexOf(tile), next = visible[i + (e.key === "ArrowLeft" ? -1 : 1)];
        if (next && moveBookmark(b.id, next.dataset.bookmarkId, e.key === "ArrowRight")) {
          [...$("bm-grid").children].find(x => x.dataset.bookmarkId === b.id)?.firstElementChild?.focus();
        }
      };
      $("bm-grid").append(tile);
    }
    const add = document.createElement("button");
    add.className = "bookmark-card bookmark-add-card";
    add.textContent = "＋ 添加网站";
    add.onclick = () => open();
    $("bm-grid").append(add);
    window.HomeDesktop?.refresh();
  }
  let dropTarget = null;
  function clearDrag() {
    for (const tile of $("bm-grid").children) {
      tile.classList.remove("dragging");
      delete tile.dataset.dropSide;
    }
    dragging = null;
    dropTarget = null;
  }
  function moveBookmark(source, target, after) {
    const next = clone(), from = next.items.findIndex(x => x.id === source);
    if (source === target || from < 0 || !next.items.some(x => x.id === target)) return false;
    const [moved] = next.items.splice(from, 1);
    const to = next.items.findIndex(x => x.id === target) + (after ? 1 : 0);
    next.items.splice(to, 0, moved);
    if (next.items.every((x, i) => x.id === data.items[i].id)) return false;
    return commit(next);
  }
  // Resolve gaps and row endings too, so dropping does not require hitting a tile.
  $("bm-grid").ondragover = e => {
    if (!dragging || syncBusy) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    let nearest = null, distance = Infinity;
    for (const tile of $("bm-grid").children) {
      delete tile.dataset.dropSide;
      if (!tile.dataset.bookmarkId || tile.dataset.bookmarkId === dragging) continue;
      const r = tile.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const d = Math.hypot(e.clientX - x, (e.clientY - y) * 2);
      if (d < distance) { distance = d; nearest = {tile, after:e.clientX > x}; }
    }
    dropTarget = nearest;
    if (nearest) nearest.tile.dataset.dropSide = nearest.after ? "after" : "before";
  };
  $("bm-grid").ondrop = e => {
    if (!dragging) return;
    e.preventDefault();
    if (dropTarget && !syncBusy) moveBookmark(dragging, dropTarget.tile.dataset.bookmarkId, dropTarget.after);
    clearDrag();
  };
  $("bm-grid").ondragleave = e => {
    if (!$("bm-grid").contains(e.relatedTarget)) {
      dropTarget = null;
      for (const tile of $("bm-grid").children) delete tile.dataset.dropSide;
    }
  };
  function open(id) {
    editing = id || null;
    const item = data.items.find((x) => x.id === id),
      f = $("bm-form");
    f.reset();
    $("bm-form-error").textContent = "";
    $("bm-dialog-title").textContent = item ? "编辑网站" : "添加网站";
    f.elements.group.replaceChildren();
    for (const g of data.groups) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = g;
      f.elements.group.append(o);
    }
    f.elements.group.value = item?.group || group || data.groups[0];
    f.elements.title.value = item?.title || "";
    f.elements.url.value = item?.url || "";
    f.elements.color.value = item?.color || "#536ded";
    f.elements.preset.value = Object.hasOwn(core.icons, item?.icon)
      ? item.icon
      : "link";
    f.elements.icon.value =
      item && !Object.hasOwn(core.icons, item.icon) ? item.icon : "";
    for (const id of ["bm-delete", "bm-move-up", "bm-move-down"])
      $(id).hidden = !item;
    $("bm-dialog").showModal();
  }
  const preset = $("bm-form").elements.preset;
  for (const key of Object.keys(core.icons)) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = key;
    preset.append(o);
    const button = document.createElement("button");
    button.type = "button";
    button.title = key;
    button.append(icon({ icon: key, title: key, color: "#68799a" }));
    button.onclick = () => {
      preset.value = key;
      $("bm-form").elements.icon.value = "";
    };
    $("bm-icon-picker").append(button);
  }
  $("bm-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target,
      next = clone();
    try {
      const item = {
        id: editing || crypto.randomUUID(),
        title: f.elements.title.value,
        url: core.url(f.elements.url.value.trim()),
        group: f.elements.group.value,
        color: f.elements.color.value,
        icon: f.elements.icon.value.trim() || f.elements.preset.value,
      };
      const i = next.items.findIndex((x) => x.id === editing);
      if (i < 0) next.items.push(item);
      else next.items[i] = item;
      const clean = core.validate(next);
      if (commit(clean)) $("bm-dialog").close();
    } catch (error) {
      $("bm-form-error").textContent = error.message;
    }
  };
  $("bm-add").onclick = () => open();
  $("bm-close").onclick = () => $("bm-dialog").close();
  $("bm-search").oninput = render;
  $("bm-delete").onclick = () => {
    if (!confirm("删除这条收藏？可通过「撤销上次更改」恢复。")) return;
    const next = clone();
    next.items = next.items.filter((x) => x.id !== editing);
    if (commit(next)) $("bm-dialog").close();
  };
  for (const [id, delta] of [
    ["bm-move-up", -1],
    ["bm-move-down", 1],
  ])
    $(id).onclick = () => {
      const next = clone(),
        i = next.items.findIndex((x) => x.id === editing),
        j = i + delta;
      if (i < 0 || j < 0 || j >= next.items.length) return;
      [next.items[i], next.items[j]] = [next.items[j], next.items[i]];
      commit(next);
    };
  $("bm-group-new").onclick = () => {
    const value = prompt("新建收藏分组");
    if (!value?.trim()) return;
    const next = clone();
    if (next.groups.includes(value.trim())) {
      status("已有同名分组。", true);
      return;
    }
    next.groups.push(value.trim());
    if (commit(next)) {
      group = value.trim();
      render();
    }
  };
  $("bm-group-delete").onclick = () => {
    if (
      !group ||
      !confirm(
        "删除分组「" + group + "」？其中收藏会移到其他分组，不删除网站。",
      )
    )
      return;
    const next = clone(),
      old = group;
    next.groups = next.groups.filter((x) => x !== old);
    if (!next.groups.length) next.groups = ["常用"];
    next.items.forEach((x) => {
      if (x.group === old) x.group = next.groups[0];
    });
    group = "";
    commit(next);
  };
  $("bm-export").onclick = () => {
    const u = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = "workstation-bookmarks.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  $("bm-import-button").onclick = () => $("bm-import").click();
  $("bm-import").onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 2000000) throw Error("导入文件超过2 MB。");
      const next = core.validate(JSON.parse(await f.text()));
      if (confirm("用导入的收藏替换当前列表？可撤销此操作。")) commit(next);
    } catch (error) {
      status(error.message, true);
    } finally {
      e.target.value = "";
    }
  };
  $("bm-undo").onclick = () => {
    try {
      const old = localStorage.getItem(UNDO);
      if (!old) return;
      const next = core.validate(JSON.parse(old));
      localStorage.setItem(KEY, JSON.stringify(next));
      localStorage.removeItem(UNDO);
      data = next;
      group = "";
      render();
      status("已恢复上次修改前的收藏。");
    } catch (e) {
      status(e.message, true);
    }
  };
  const snapshot = (value) => JSON.stringify(core.validate(value));
  const baseKey = () =>
    "workstation-bookmarks-github-base:" +
    window.WorkstationGitHub.context().key;
  function getBase() {
    try {
      const value = JSON.parse(localStorage.getItem(baseKey()));
      return value?.sha
        ? { sha: value.sha, data: core.validate(value.data) }
        : null;
    } catch {
      return null;
    }
  }
  function rememberBase(file) {
    localStorage.setItem(
      baseKey(),
      JSON.stringify({ sha: file.sha, data: core.validate(file.data) }),
    );
  }
  function syncState() {
    const base = getBase();
    return {
      busy: syncBusy,
      connected: window.WorkstationGitHub.context().connected,
      known: !!base,
      dirty: base
        ? snapshot(clone()) !== snapshot(base.data)
        : !!localStorage.getItem(KEY),
    };
  }
  async function syncRun(fn) {
    if (syncBusy) return;
    if (!window.WorkstationGitHub.context().connected) {
      $("gh-open").click();
      status("请先连接 GitHub 数据仓库，再读取或保存主页收藏。");
      return;
    }
    syncBusy = true;
    $("bm-sync-confirm").disabled = true;
    window.refreshGithubDock?.();
    try {
      await fn();
    } catch (e) {
      status(e.message, true);
      $("bm-sync-error").textContent = e.message;
    } finally {
      syncBusy = false;
      $("bm-sync-confirm").disabled = false;
      window.refreshGithubDock?.();
    }
  }
  function previewSync(plan, remote, localSnapshot) {
    syncSession = { plan, sha: remote.sha, localSnapshot };
    $("bm-sync-conflicts").replaceChildren();
    $("bm-sync-error").textContent = "";
    for (const row of plan.conflicts) {
      const card = document.createElement("section"),
        heading = document.createElement("strong");
      card.className = "bm-sync-record";
      heading.textContent = row.kind==='layout'?'主页布局（排序、尺寸与显示设置）':row.local?.title || row.remote?.title || row.id;
      card.append(heading);
      for (const [side, label] of [
        ["local", "本机版本"],
        ["remote", "GitHub 版本"],
      ]) {
        const option = document.createElement("label"),
          radio = document.createElement("input"),
          text = document.createElement("span");
        radio.type = "radio";
        radio.name = "bookmark-conflict-" + plan.rows.indexOf(row);
        radio.value = side;
        radio.onchange = () => {
          row.choice = side;
        };
        const b = row[side];
        text.textContent =
          label +
          "：" +
          (row.kind==='layout' ? (b ? b.widgets.filter(w=>w.enabled).map(w=>w.id+' '+w.size).join('、')+'；顺序：'+b.order.join(' → ') : '无布局设置') : b ? b.title + " · " + b.url + " · " + b.group : "删除此收藏");
        option.append(radio, text);
        card.append(option);
      }
      $("bm-sync-conflicts").append(card);
    }
    $("bm-sync-dialog").showModal();
    status("本机和 GitHub 的同一收藏有不同修改，请选择保留版本。");
  }
  async function readCloud() {
    return syncRun(async () => {
      const before = snapshot(clone());
      status("正在读取 GitHub 主页收藏…");
      const file = await window.BookmarksGitHub.read();
      if (!file) {
        status("远端尚无收藏文件；点击 GitHub 菜单中的「保存主页收藏」创建。");
        return;
      }
      if (snapshot(clone()) !== before)
        throw Error("读取期间本机收藏有新修改，已保留；请重新读取。");
      if (
        syncState().dirty &&
        before !== snapshot(file.data) &&
        !confirm("读取将替换本机收藏；可通过「撤销上次更改」恢复。继续？")
      )
        return;
      if (!commit(file.data)) return;
      rememberBase(file);
      window.refreshGithubDock?.();
      status("已读取 GitHub 主页收藏 · " + window.BookmarksGitHub.path());
    });
  }
  async function saveCloud(resolution = null) {
    return syncRun(async () => {
      const before = snapshot(clone()),
        base = getBase();
      status("正在检查 GitHub 收藏版本…");
      const remote = await window.BookmarksGitHub.read();
      if (snapshot(clone()) !== before)
        throw Error("检查期间本机收藏有更新，请再次保存。");
      let target;
      if (resolution) {
        if (before !== resolution.localSnapshot)
          throw Error("合并预览期间本机收藏有变化，请关闭窗口后重新保存。");
        if (remote?.sha !== resolution.sha)
          throw Error("远端收藏又有更新，请关闭窗口后重新保存、刷新合并版本。");
        target = resolution.data;
      } else if (remote) {
        if (before === snapshot(remote.data)) {
          rememberBase(remote);
          status("主页收藏与 GitHub 一致，无需上传。");
          return;
        }
        const plan = core.plan(clone(), remote.data, base?.data || null);
        if (plan.conflicts.length) {
          previewSync(plan, remote, before);
          return;
        }
        target = core.build(plan);
      } else {
        if (
          base &&
          !confirm("远端收藏文件已删除，是否用当前本机收藏重新创建？")
        )
          return;
        target = core.validate(clone());
      }
      const result = await window.BookmarksGitHub.save(
        target,
        remote?.sha || null,
      );
      rememberBase(result);
      const newer = snapshot(clone()) !== before;
      if (!newer && !commit(result.data)) {
        status("GitHub 已保存，但本机存储失败；请导出备份或重新读取。", true);
        return;
      }
      if (syncSession) {
        syncSession = null;
        $("bm-sync-dialog").close();
      }
      status(
        newer
          ? "本次快照已保存到 GitHub；保存期间还有新修改，请再次保存。"
          : "主页收藏已保存到 GitHub · " + window.BookmarksGitHub.path(),
      );
    });
  }
  $("bm-sync-cancel").onclick = () => {
    if (syncBusy) return;
    syncSession = null;
    $("bm-sync-dialog").close();
  };
  $("bm-sync-dialog").addEventListener("cancel", (e) => {
    if (syncBusy) e.preventDefault();
    else syncSession = null;
  });
  $("bm-sync-confirm").onclick = () => {
    if (!syncSession || syncBusy) return;
    try {
      const data = core.build(syncSession.plan);
      saveCloud({ ...syncSession, data });
    } catch (e) {
      $("bm-sync-error").textContent = e.message;
    }
  };
  window.BookmarksWorkspace = {
    storageExport: clone,
    storageImport(value) { if (!commit(value)) throw Error("收藏无法保存到本机。"); },
    add(item) {
      const next = clone();
      if (next.items.some((b) => b.url === item.url)) return false;
      const group = "浏览器书签";
      if (!next.groups.includes(group)) next.groups.push(group);
      next.items.push({
        id: crypto.randomUUID(),
        title: item.title.slice(0, 100),
        url: item.url,
        icon: "book",
        color: "#687baf",
        group,
      });
      return commit(next);
    },
    read: readCloud,
    save: () => saveCloud(),
    state: syncState,
  };
  window.addEventListener("taskspace-github-state", () =>
    window.refreshGithubDock?.(),
  );
  function clock() {
    const now = new Date();
    $("bm-clock").textContent = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    $("bm-date").textContent = now.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  }
  clock();
  setInterval(clock, 30000);
  render();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      data = e.newValue
        ? core.validate(JSON.parse(e.newValue))
        : core.defaults();
      render();
    } catch {
      status("其他标签页的收藏更新无法读取。", true);
    }
  });
})();
