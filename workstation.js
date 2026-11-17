/* Standalone Markdown notebooks. Task and note persistence are deliberately separate. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    git = window.WorkstationGitHub;
  let context = git.context(),
    notes = [],
    selected = null,
    working = false,
    conflict = null,
    view = "split";
  const storageKey = () => "workstation-notes-v1:" + context.key;
  const serialize = (n) =>
    "# " +
    (n.title.trim() || "未命名笔记").replace(/[\r\n]/g, " ") +
    "\n\n" +
    n.body;
  const parse = (text) => {
    const m = text.match(/^# ([^\r\n]*)\r?\n(?:\r?\n)?/);
    return {
      title: m ? m[1] : "导入的笔记",
      body: m ? text.slice(m[0].length) : text,
    };
  };
  const current = () => notes.find((n) => n.id === selected);
  const dirty = (n) => serialize(n) !== n.base;
  function message(text, error = false) {
    $("nb-status").textContent = text;
    $("nb-status").style.color = error ? "#c45860" : "";
  }
  function persist() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ notes, selected }));
      return true;
    } catch {
      message("本机存储空间不足，请下载 .md 备份或保存到 GitHub。", true);
      return false;
    }
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey()));
      notes = Array.isArray(data?.notes)
        ? data.notes.filter(
            (n) =>
              typeof n.id === "string" &&
              typeof n.title === "string" &&
              typeof n.body === "string",
          )
        : [];
      selected = data?.selected || null;
    } catch {
      notes = [];
      selected = null;
    }
    if (!current()) selected = notes[0]?.id || null;
  }
  function controls() {
    const n = current(),
      connected = git.context().connected;
    for (const id of ["nb-refresh", "nb-save", "nb-delete", "nb-connect"])
      $(id).disabled = working;
    $("nb-save").disabled = working || !n;
    $("nb-connect").textContent = connected ? "GitHub 已连接" : "连接 GitHub";
    $("nb-refresh").disabled = working || !connected;
    $("nb-location").textContent = context.repository
      ? context.repository + " / " + context.directory
      : "尚未连接私有仓库";
  }
  function list() {
    const query = $("nb-search").value.trim().toLowerCase();
    $("nb-list").replaceChildren();
    for (const n of [...notes].sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || ""),
    )) {
      if (query && !(n.title + "\n" + n.body).toLowerCase().includes(query))
        continue;
      const b = document.createElement("button");
      b.className = "notebook-list-item" + (n.id === selected ? " active" : "");
      const title = document.createElement("strong"),
        hint = document.createElement("small");
      title.textContent = n.title || "未命名笔记";
      hint.textContent =
        (dirty(n) ? "● 待上传" : "✓ 已同步") +
        " · " +
        (n.updatedAt
          ? new Date(n.updatedAt).toLocaleDateString("zh-CN")
          : "Markdown");
      b.append(title, hint);
      b.onclick = () => {
        selected = n.id;
        persist();
        draw();
      };
      $("nb-list").append(b);
    }
    if (!$("nb-list").children.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = query ? "没有匹配的笔记" : "还没有笔记";
      $("nb-list").append(p);
    }
  }
  function preview() {
    const n = current();
    if (!n) return;
    $("nb-preview").innerHTML =
      window.Notes.parse(n.body).html || "<p>预览会显示在这里。</p>";
    $("nb-count").textContent = n.body.length + " 字符";
    $("nb-save-state").textContent = dirty(n)
      ? "已保存在本机 · 待上传 GitHub"
      : "已与 GitHub 同步";
  }
  function draw() {
    const n = current();
    $("nb-empty").hidden = !!n;
    $("nb-document").hidden = !n;
    if (n) {
      $("nb-title").value = n.title;
      $("nb-body").value = n.body;
      preview();
    }
    list();
    controls();
  }
  function changed() {
    const n = current();
    if (!n) return;
    n.title = $("nb-title").value;
    n.body = $("nb-body").value;
    n.updatedAt = new Date().toISOString();
    persist();
    preview();
    list();
  }
  function newNote(values = {}) {
    const n = {
      id: crypto.randomUUID() + ".md",
      title: "",
      body: "",
      sha: null,
      base: null,
      updatedAt: new Date().toISOString(),
      ...values,
    };
    notes.unshift(n);
    selected = n.id;
    persist();
    draw();
    $("nb-title").focus();
    return n;
  }
  async function run(fn) {
    if (working) return;
    working = true;
    controls();
    try {
      await fn();
    } catch (e) {
      message(e.message, true);
    } finally {
      working = false;
      controls();
    }
  }
  function showConflict(n, remote) {
    conflict = { id: n.id, local: serialize(n), remote };
    $("nb-conflict-local").textContent = conflict.local;
    $("nb-conflict-remote").textContent =
      remote?.text || "这篇笔记已在 GitHub 删除。";
    $("nb-conflict-status").textContent = "";
    $("nb-use-remote").textContent = remote
      ? "采用 GitHub 版本"
      : "接受远端删除";
    $("nb-conflict-dialog").showModal();
  }
  async function saveNote(n = current(), shaOverride) {
    if (!n) return;
    if (!git.context().connected) {
      $("gh-open").click();
      message("连接私有仓库后，再点击「保存到 GitHub」。");
      return;
    }
    await run(async () => {
      const text = serialize(n);
      message("正在保存这篇笔记…");
      try {
        const result = await git.save(
          n.id,
          text,
          shaOverride === undefined ? n.sha : shaOverride,
        );
        n.sha = result.sha;
        n.base = text;
        persist();
        draw();
        message(
          dirty(n)
            ? "快照已上传；上传期间有新修改，请再次保存。"
            : "已保存到 GitHub · " + n.title,
        );
      } catch (e) {
        if (e.code === "NOTE_CONFLICT") showConflict(n, e.remote);
        else throw e;
      }
    });
  }
  async function refresh() {
    if (!git.context().connected) return;
    await run(async () => {
      message("正在读取 GitHub 笔记…");
      const files = await git.list(),
        seen = new Set(files.map((f) => f.name));
      let pending = 0;
      for (const f of files) {
        let n = notes.find((n) => n.id === f.name);
        if (!n) {
          notes.push({
            id: f.name,
            ...parse(f.text),
            sha: f.sha,
            base: f.text,
            updatedAt: new Date().toISOString(),
          });
          continue;
        }
        if (!dirty(n) || serialize(n) === f.text) {
          Object.assign(n, parse(f.text), { sha: f.sha, base: f.text });
        } else if (n.sha !== f.sha) pending++;
      }
      notes = notes.filter((n) => !n.sha || seen.has(n.id) || dirty(n));
      if (!current()) selected = notes[0]?.id || null;
      persist();
      draw();
      message(
        pending
          ? `已读取笔记，${pending} 篇同时有本机与远端修改；保存时可选择版本。`
          : "已读取 GitHub 笔记，本机未上传的修改已保留。",
      );
    });
  }
  function closeConflict() {
    if (working) return;
    conflict = null;
    $("nb-conflict-dialog").close();
  }
  async function resolve(choice) {
    if (!conflict || working) return;
    const c = conflict,
      n = notes.find((n) => n.id === c.id);
    if (!n || serialize(n) !== c.local) {
      $("nb-conflict-status").textContent =
        "本机内容已改变，请关闭后重新保存以刷新对比。";
      return;
    }
    if (choice === "local") {
      closeConflict();
      await saveNote(n, c.remote?.sha || null);
      return;
    }
    if (choice === "both")
      newNote({ title: n.title + "（本机副本）", body: n.body });
    if (c.remote)
      Object.assign(n, parse(c.remote.text), {
        sha: c.remote.sha,
        base: c.remote.text,
      });
    else notes = notes.filter((x) => x !== n);
    if (!current()) selected = notes[0]?.id || null;
    closeConflict();
    persist();
    draw();
    message(
      choice === "both"
        ? "已保留 GitHub 版本，并创建本机副本；副本点击保存后上传。"
        : "已采用 GitHub 版本，本机已更新。",
    );
  }
  async function remove() {
    const n = current();
    if (
      !n ||
      !confirm(
        n.sha
          ? "删除此笔记及其 GitHub 文件？GitHub 提交历史仍可找回。"
          : "删除这篇本机笔记？",
      )
    )
      return;
    await run(async () => {
      const before = serialize(n);
      if (n.sha) await git.remove(n.id, n.sha);
      if (serialize(n) !== before) {
        n.sha = null;
        n.base = null;
        message("GitHub 文件已删除，删除期间的新修改保留为本机草稿。");
      } else {
        notes = notes.filter((x) => x !== n);
        selected = notes[0]?.id || null;
        message("笔记已删除。");
      }
      persist();
      draw();
    });
  }
  function format(kind) {
    const a = $("nb-body"),
      start = a.selectionStart,
      end = a.selectionEnd,
      selectedText = a.value.slice(start, end);
    const formats = {
      bold: ["**", "**", "加粗文字"],
      italic: ["*", "*", "斜体文字"],
      link: ["[", "](https://)", "链接文字"],
      code: ["\n```\n", "\n```\n", "代码"],
      heading: ["\n## ", "", "标题"],
      todo: ["\n- [ ] ", "", "待办事项"],
      list: ["\n- ", "", "列表项"],
    };
    const [before, after, hint] = formats[kind];
    a.setRangeText(
      before + (selectedText || hint) + after,
      start,
      end,
      "select",
    );
    a.focus();
    changed();
  }
  function app(name) {
    name = name === "notion" ? "notion" : "task";
    document.body.dataset.workspace = name;
    $("task-workspace").hidden = name !== "task";
    $("notebook-workspace").hidden = name !== "notion";
    document.querySelectorAll("[data-app]").forEach((b) => {
      b.classList.toggle("active", b.dataset.app === name);
      b.setAttribute("aria-pressed", String(b.dataset.app === name));
    });
    localStorage.setItem("workstation-app", name);
  }
  $("nb-title").addEventListener("input", changed);
  $("nb-body").addEventListener("input", changed);
  $("nb-body").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const a = e.target;
      a.setRangeText("  ", a.selectionStart, a.selectionEnd, "end");
      changed();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveNote();
    }
  });
  $("nb-preview").addEventListener("change", (e) => {
    const input = e.target.closest("[data-note-line]");
    if (!input) return;
    $("nb-body").value = window.Notes.toggle(
      current().body,
      Number(input.dataset.noteLine),
      input.checked,
    );
    changed();
  });
  document
    .querySelectorAll("[data-mark]")
    .forEach((b) => (b.onclick = () => format(b.dataset.mark)));
  document.querySelectorAll("[data-note-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.noteView;
        document.querySelector(".notebook-editor").dataset.mode = view;
        document
          .querySelectorAll("[data-note-view]")
          .forEach((x) => x.classList.toggle("active", x === b));
      }),
  );
  document
    .querySelectorAll("[data-app]")
    .forEach((b) => (b.onclick = () => app(b.dataset.app)));
  $("nb-new").onclick = () => newNote();
  $("nb-save").onclick = () => saveNote();
  $("nb-refresh").onclick = refresh;
  $("nb-search").oninput = list;
  $("nb-connect").onclick = () => $("gh-open").click();
  $("nb-delete").onclick = remove;
  $("nb-export").onclick = () => {
    const n = current();
    if (!n) return;
    const url = URL.createObjectURL(
        new Blob([serialize(n)], { type: "text/markdown;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (n.title || "未命名笔记")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 100) + ".md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("nb-conflict-close").onclick = closeConflict;
  $("nb-use-local").onclick = () => resolve("local");
  $("nb-use-remote").onclick = () => resolve("remote");
  $("nb-keep-both").onclick = () => resolve("both");
  $("nb-conflict-dialog").addEventListener("cancel", (e) => {
    if (working) e.preventDefault();
    else conflict = null;
  });
  window.addEventListener("taskspace-github-state", () => {
    const next = git.context();
    if (next.key !== context.key) {
      const drafts = !context.repository ? notes.filter((n) => !n.sha) : [];
      persist();
      context = next;
      load();
      for (const draft of drafts)
        if (!notes.some((n) => n.id === draft.id)) notes.push(draft);
      if (!current()) selected = notes[0]?.id || null;
      if (conflict) closeConflict();
      persist();
      draw();
      message("已切换笔记仓库，点击「读取笔记」获取已有内容。");
    }
    controls();
  });
  window.addEventListener("beforeunload", (e) => {
    if (notes.some(dirty) && git.context().connected) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  load();
  draw();
  app(localStorage.getItem("workstation-app"));
})();
