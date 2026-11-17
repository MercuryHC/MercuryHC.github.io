(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.BookmarksCore,
    KEY = "workstation-bookmarks-v1",
    UNDO = KEY + ":undo";
  let data = core.defaults(),
    group = "",
    editing = null,
    dragging = null;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) data = core.validate(JSON.parse(saved));
  } catch {
    $("bm-status").textContent =
      "收藏数据读取失败，已显示预置入口；原数据仍在本机。";
  }
  function clone() {
    return JSON.parse(JSON.stringify(data));
  }
  function status(s, error = false) {
    $("bm-status").textContent = s;
    $("bm-status").style.color = error ? "#d37a85" : "";
  }
  function commit(next) {
    try {
      const clean = core.validate(next);
      localStorage.setItem(UNDO, JSON.stringify(data));
      localStorage.setItem(KEY, JSON.stringify(clean));
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
      const a = document.createElement("a");
      a.href = b.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = b.url;
      const title = document.createElement("strong"),
        host = document.createElement("small");
      title.textContent = b.title;
      host.textContent = new URL(b.url).hostname;
      host.className = "bookmark-host";
      a.append(icon(b), title, host);
      const edit = document.createElement("button");
      edit.className = "bookmark-edit";
      edit.textContent = "•••";
      edit.title = "编辑 " + b.title;
      edit.setAttribute("aria-label", "编辑 " + b.title);
      edit.onclick = () => open(b.id);
      tile.append(a, edit);
      tile.ondragstart = (e) => {
        dragging = b.id;
        e.dataTransfer.setData("text/plain", b.id);
        tile.classList.add("dragging");
      };
      tile.ondragend = () => {
        dragging = null;
        tile.classList.remove("dragging");
      };
      tile.ondragover = (e) => e.preventDefault();
      tile.ondrop = (e) => {
        e.preventDefault();
        if (!dragging || dragging === b.id) return;
        const next = clone(),
          from = next.items.findIndex((x) => x.id === dragging),
          to = next.items.findIndex((x) => x.id === b.id);
        if (from < 0 || to < 0) return;
        const moved = next.items.splice(from, 1)[0];
        next.items.splice(to, 0, moved);
        commit(next);
      };
      $("bm-grid").append(tile);
    }
    const add = document.createElement("button");
    add.className = "bookmark-card bookmark-add-card";
    add.textContent = "＋ 添加网站";
    add.onclick = () => open();
    $("bm-grid").append(add);
  }
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
