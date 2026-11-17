/* Personal GitHub storage. Tokens are held only in this page's memory. */
(() => {
  "use strict";
  const CONFIG_KEY = "taskspace-github-config-v1";
  const CACHE_KEY = "taskspace-pages-v1";
  let config = {},
    token = "",
    baseSha = null,
    connected = false,
    busy = false;
  let dirty = false;
  try {
    config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {}
  const el = (id) => document.getElementById(id);
  const status = (text, error = false) => {
    el("gh-status").textContent = text;
    el("gh-dialog-status").textContent = text;
    el("gh-status").style.color = error ? "#c45860" : "#7b8596";
  };
  function updateButtons() {
    for (const id of ["gh-read", "gh-write", "gh-disconnect", "gh-connect"])
      el(id).disabled = busy;
    el("gh-read").disabled = busy || !connected;
    el("gh-write").disabled = busy || !connected;
    el("gh-disconnect").disabled = busy || !token;
    el("gh-write").textContent = dirty
      ? "保存到 GitHub · 有修改"
      : "保存到 GitHub";
    el("gh-indicator").textContent = connected
      ? dirty
        ? "GitHub · 待保存"
        : "GitHub · 已连接"
      : "GitHub · 未连接";
  }
  window.githubSyncMarkDirty = () => {
    dirty = true;
    updateButtons();
    if (connected)
      status("本地修改尚未保存到 GitHub，请点击「保存到 GitHub」。");
  };
  function validateData(data) {
    if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks))
      throw Error("数据格式不正确：需要 projects 和 tasks 数组。");
    if (data.projects.length > 10000 || data.tasks.length > 50000)
      throw Error("记录数量超过个人任务系统的限制。");
    const ids = new Set(),
      pids = new Set();
    const text = (v, max) => typeof v === "string" && v.length <= max;
    const validId = (id) =>
      typeof id === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(id) &&
      !ids.has(id);
    const validDate = (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      !Number.isNaN(Date.parse(d)) &&
      new Date(d).toISOString().slice(0, 10) === d;
    const projects = data.projects.map((p) => {
      if (
        !p ||
        !validId(p.id) ||
        !text(p.title, 500) ||
        !p.title.trim() ||
        !text(p.description ?? "", 10000) ||
        !/^#[0-9a-f]{6}$/i.test(p.color)
      )
        throw Error("项目字段不完整、颜色不正确或 ID 重复。");
      ids.add(p.id);
      pids.add(p.id);
      return {
        id: p.id,
        title: p.title,
        description: p.description ?? "",
        color: p.color,
      };
    });
    const tasks = data.tasks.map((t) => {
      if (
        !t ||
        !validId(t.id) ||
        !text(t.title, 1000) ||
        !t.title.trim() ||
        !text(t.note ?? "", 50000) ||
        !validDate(t.start) ||
        !validDate(t.due) ||
        t.start > t.due ||
        !["待开始", "进行中", "已完成"].includes(t.status) ||
        !["高", "中", "低"].includes(t.priority) ||
        !(t.project === "" || pids.has(t.project))
      )
        throw Error("任务字段、日期、所属项目或 ID 不正确。");
      ids.add(t.id);
      return {
        id: t.id,
        title: t.title,
        project: t.project,
        start: t.start,
        due: t.due,
        status: t.status,
        priority: t.priority,
        note: t.note ?? "",
      };
    });
    return { projects, tasks };
  }
  function encodeData(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  function decodeData(content) {
    const binary = atob(content.replace(/\s/g, ""));
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
  }
  function baseUrl() {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }
  function fileUrl() {
    return (
      baseUrl() +
      "/contents/" +
      config.path.split("/").map(encodeURIComponent).join("/")
    );
  }
  async function api(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      let response;
      try {
        response = await fetch(url, {
          ...options,
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + token,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
        });
      } catch (e) {
        throw Error(
          e.name === "AbortError"
            ? "请求超时。若刚才正在保存，请先读取远端确认是否写入成功。"
            : "无法连接 GitHub API，请检查网络后重试。",
        );
      }
      if (response.status === 404 && options.missingOK) return null;
      if (!response.ok) {
        const messages = {
          401: "Token 无效或已过期，请重新连接。",
          403: "访问被拒绝或请求限流，请检查仓库授权及 Contents 读写权限。",
          404: "仓库、分支或文件不可访问，请检查名称和 Token 的仓库授权。",
          409: "远端数据已改变或分支冲突。请先导出本地备份，再读取远端。",
          422: "写入失败，请检查分支名、文件路径和仓库规则。",
        };
        throw Error(
          messages[response.status] ||
            `GitHub 请求失败（${response.status}），本地数据已保留。`,
        );
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function remote() {
    const result = await api(
      fileUrl() + "?ref=" + encodeURIComponent(config.branch),
      { missingOK: true },
    );
    if (
      result &&
      (result.type !== "file" ||
        result.encoding !== "base64" ||
        typeof result.content !== "string" ||
        result.size > 900000)
    )
      throw Error("远端必须为小于 900 KB 的 JSON 文件。");
    return result;
  }
  function backupLocal() {
    const backups = JSON.parse(
      localStorage.getItem("taskspace-before-github-read") || "[]",
    );
    backups.unshift({
      time: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(db)),
    });
    localStorage.setItem(
      "taskspace-before-github-read",
      JSON.stringify(backups.slice(0, 3)),
    );
  }
  async function readRemote() {
    if (
      !confirm(
        "读取 GitHub 将替换当前本地项目和任务。建议先点「导出」备份；本次读取也会保留最近三次本地快照。继续？",
      )
    )
      return;
    busy = true;
    updateButtons();
    status("正在读取 GitHub…");
    try {
      const file = await remote();
      if (!file) {
        baseSha = null;
        status("分支上还没有数据文件。点击「保存到 GitHub」可以创建。");
        return;
      }
      const data = validateData(decodeData(file.content));
      backupLocal();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      db = data;
      baseSha = file.sha;
      dirty = false;
      render();
      status("已读取 GitHub · " + new Date().toLocaleTimeString("zh-CN"));
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  async function writeRemote() {
    busy = true;
    updateButtons();
    status("正在检查远端版本…");
    try {
      // Recheck visibility before every write in case repository settings changed.
      const repo = await api(baseUrl());
      if (!repo.private)
        throw Error(
          "只允许写入私有仓库。请创建私有数据仓库，避免任务内容公开。",
        );
      const file = await remote();
      if (file && (!baseSha || file.sha !== baseSha))
        throw Error(
          "远端存在尚未读取的新版本，已阻止覆盖。先导出本地备份，再读取 GitHub 后合并修改。",
        );
      if (!file && baseSha)
        throw Error("远端文件已被删除，已阻止重新创建。请重新连接并确认数据。");
      if (
        !file &&
        !confirm(
          `将在私有仓库 ${config.owner}/${config.repo} 的 ${config.branch} 分支创建 ${config.path}，保存当前项目与任务。继续？`,
        )
      ) {
        status("已取消创建，数据仍在本地。");
        return;
      }
      const snapshot = JSON.stringify(validateData(db));
      const payload = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        ...JSON.parse(snapshot),
      };
      const content = encodeData(payload);
      if (content.length > 1200000)
        throw Error("数据超过 900 KB，请先清理或拆分数据。");
      status("正在保存到 GitHub…");
      const result = await api(fileUrl(), {
        method: "PUT",
        body: JSON.stringify({
          message: "Save Taskspace data",
          content,
          branch: config.branch,
          ...(baseSha ? { sha: baseSha } : {}),
        }),
      });
      baseSha = result.content.sha;
      dirty = JSON.stringify(validateData(db)) !== snapshot;
      status(
        dirty
          ? "本次快照已保存；保存期间有新修改，请再次保存。"
          : "已保存到 GitHub · " + new Date().toLocaleTimeString("zh-CN"),
      );
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  el("gh-open").onclick = () => {
    const f = el("gh-form");
    for (const k of ["owner", "repo", "branch", "path"])
      f.elements[k].value =
        config[k] ||
        {
          owner: "MercuryHC",
          repo: "taskspace-data",
          branch: "main",
          path: "taskspace.json",
        }[k];
    f.elements.token.value = "";
    el("gh-dialog").showModal();
  };
  el("gh-close").onclick = () => el("gh-dialog").close();
  el("gh-disconnect").onclick = () => {
    token = "";
    baseSha = null;
    connected = false;
    status("已断开连接；Token 已从页面内存清除，本地数据保留。");
    updateButtons();
  };
  el("gh-read").onclick = readRemote;
  el("gh-write").onclick = writeRemote;
  el("gh-restore").onclick = () => {
    try {
      const backups = JSON.parse(
        localStorage.getItem("taskspace-before-github-read") || "[]",
      );
      if (!backups.length) throw Error("还没有读取前的本地快照。");
      const blob = new Blob([JSON.stringify(backups[0].data, null, 2)], {
          type: "application/json",
        }),
        u = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = u;
      a.download = "taskspace-before-read.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      status(e.message, true);
    }
  };
  el("gh-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const next = Object.fromEntries(
      ["owner", "repo", "branch", "path"].map((k) => [
        k,
        f.elements[k].value.trim(),
      ]),
    );
    if (
      !/^[a-zA-Z0-9-]+$/.test(next.owner) ||
      !/^[a-zA-Z0-9_.-]+$/.test(next.repo) ||
      !next.branch ||
      !next.path.endsWith(".json") ||
      next.path.startsWith("/") ||
      next.path.split("/").some((x) => !x || x === "." || x === "..") ||
      /[\x00-\x1f]/.test(next.path + next.branch)
    ) {
      status(
        "仓库和文件路径格式不正确，请使用 owner、repo、分支和相对 .json 路径。",
        true,
      );
      return;
    }
    const candidate = f.elements.token.value.trim();
    f.elements.token.value = "";
    if (!candidate) {
      status("请输入 Token。", true);
      return;
    }
    config = next;
    token = candidate;
    baseSha = null;
    connected = false;
    busy = true;
    updateButtons();
    status("正在验证私有仓库…");
    try {
      const repo = await api(baseUrl());
      if (!repo.private)
        throw Error(
          "这是公开仓库。请使用独立的私有数据仓库；不要使用公开的 github.io 仓库。",
        );
      // Confirm branch exists rather than mistaking an absent branch for a new file.
      await api(baseUrl() + "/branches/" + encodeURIComponent(config.branch));
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      connected = true;
      status(
        "已连接私有仓库。首次请读取 GitHub；文件不存在时，可保存当前本地数据以创建。",
      );
      el("gh-dialog").close();
    } catch (e) {
      token = "";
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (dirty && connected) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  status("本地模式 · 连接私有仓库后可读取和保存，Token 不会持久化。");
  updateButtons();
})();
