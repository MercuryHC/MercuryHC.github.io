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
  let dirty = localStorage.getItem("taskspace-local-dirty") === "true";
  let remoteChanged = false,
    checked = false,
    checking = false,
    syncError = false;
  let canAutoMerge = false;
  let notebookBusy = false;
  let lastChecked = null,
    baselineSnapshot = null;
  const baselineKey = () =>
    "taskspace-github-base:" +
    JSON.stringify([config.owner, config.repo, config.branch, config.path]);
  const localSnapshot = () => JSON.stringify(validateData(db));
  function rememberBaseline(sha, snapshot) {
    baseSha = sha;
    baselineSnapshot = snapshot;
    try {
      localStorage.setItem(baselineKey(), JSON.stringify({ sha, snapshot }));
    } catch {}
  }
  function rememberDirty() {
    localStorage.setItem("taskspace-local-dirty", String(dirty));
  }
  function updateDockState() {
    let state, label;
    if (busy || checking) {
      state = "checking";
      label = "检查中";
    } else if (!connected) {
      state = dirty ? "upload" : "offline";
      label = dirty ? "本地待上传" : "未连接";
    } else if (remoteChanged && dirty && !canAutoMerge) {
      state = "conflict";
      label = "待合并";
    } else if (syncError) {
      state = "error";
      label = "检查失败";
    } else if (!checked) {
      state = "unknown";
      label = "待检查";
    } else if (remoteChanged) {
      state = "download";
      label = canAutoMerge && dirty ? "可自动合并" : "待读取";
    } else if (dirty) {
      state = "upload";
      label = "待上传";
    } else {
      state = "synced";
      label = "已同步";
    }
    const chip = el("gh-dock-state");
    chip.dataset.state = state;
    chip.textContent = label;
    const detail = !connected
      ? "连接 GitHub 后才能检查远端；本地数据仍保留。"
      : remoteChanged
        ? dirty
          ? canAutoMerge
            ? "不同记录的更新可以自动合并，点击保存即可按项目上传。"
            : "本地与 GitHub 均有变化，点击状态或 GitHub 菜单打开合并弹窗。"
          : "GitHub 数据已更新，请读取远端。"
        : dirty
          ? "本地任务或项目有修改，需要保存到 GitHub。"
          : "本地与最近检查的 GitHub 数据一致。";
    chip.title =
      detail +
      (lastChecked
        ? " 最近检查：" + lastChecked.toLocaleTimeString("zh-CN")
        : "");
    chip.setAttribute("aria-label", "同步状态：" + label + "。" + detail);
  }
  async function checkRemoteState() {
    if (!connected || busy || checking || notebookBusy || mergeSession) return;
    checking = true;
    updateButtons();
    let mergeFile = null;
    try {
      const file = await remote();
      mergeFile = file;
      canAutoMerge = Boolean(file && autoMerge(file));
      if (!connected) return;
      if (file) {
        const snapshot = JSON.stringify(validateData(decodeData(file.content)));
        if (snapshot === localSnapshot()) {
          rememberBaseline(file.sha, snapshot);
          dirty = false;
          remoteChanged = false;
        } else {
          remoteChanged = !baseSha || file.sha !== baseSha;
          dirty = baselineSnapshot
            ? localSnapshot() !== baselineSnapshot
            : dirty;
        }
      } else {
        remoteChanged = Boolean(baseSha);
        dirty = true;
      }
      checked = true;
      syncError = false;
      lastChecked = new Date();
      rememberDirty();
      status(
        remoteChanged
          ? dirty
            ? canAutoMerge
              ? "不同记录的更新可自动合并，点击「保存到 GitHub」即可按项目保存。"
              : "同一记录存在不同修改，请打开合并弹窗选择。"
            : "GitHub 数据已更新，请读取远端。"
          : dirty
            ? "本地有修改，等待保存到 GitHub。"
            : "已检查：本地与 GitHub 数据一致。",
      );
    } catch (e) {
      syncError = true;
      status(e.message, true);
    } finally {
      checking = false;
      updateButtons();
      offerMerge(mergeFile);
    }
  }
  try {
    config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {}
  const el = (id) => document.getElementById(id);
  const status = (text, error = false) => {
    el("gh-status").textContent = text;
    el("gh-dialog-status").textContent = text;
    el("gh-status").style.color = error ? "#c45860" : "#7b8596";
    if (error) syncError = true;
  };
  function updateButtons() {
    for (const id of [
      "gh-read",
      "gh-write",
      "gh-disconnect",
      "gh-connect",
      "gh-check",
      "gh-merge",
    ])
      el(id).disabled = busy || checking || notebookBusy || !!mergeSession;
    el("gh-check").disabled =
      busy || checking || notebookBusy || !!mergeSession || !connected;
    el("gh-read").disabled =
      busy || checking || notebookBusy || !!mergeSession || !connected;
    el("gh-write").disabled =
      busy || checking || notebookBusy || !!mergeSession || !connected;
    el("gh-disconnect").disabled =
      busy || checking || notebookBusy || !!mergeSession || !token;
    el("gh-write").textContent = dirty
      ? "保存到 GitHub · 有修改"
      : "保存到 GitHub";
    el("gh-merge").disabled =
      busy || checking || notebookBusy || !!mergeSession || !connected;
    for (const id of ["merge-refresh", "merge-all-local", "merge-all-remote"])
      el(id).disabled = busy || checking;
    el("merge-list")
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = busy));
    window.dispatchEvent?.(new Event("taskspace-github-state"));
    updateDockState();
    el("gh-indicator").textContent = connected
      ? dirty
        ? "GitHub · 待保存"
        : "GitHub · 已连接"
      : "GitHub · 未连接";
  }
  window.githubSyncMarkDirty = () => {
    dirty = baselineSnapshot ? localSnapshot() !== baselineSnapshot : true;
    rememberDirty();
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
        parentId: p.parentId || "",
      };
    });
    for (const p of projects) {
      if (typeof p.parentId !== "string") throw Error("项目上级格式无效。");
      if (p.parentId) {
        const parent = projects.find((x) => x.id === p.parentId);
        if (!parent || parent.id === p.id || parent.parentId)
          throw Error("项目最多支持两级，上级必须是有效的一级项目。");
      }
    }
    const tasks = data.tasks.map((t) => {
      if (
        !t ||
        !validId(t.id) ||
        !text(t.title, 1000) ||
        !t.title.trim() ||
        !text(t.note ?? "", 50000) ||
        !validDate(t.start) ||
        (window.TaskTime && !window.TaskTime.validRange(t)) ||
        !validDate(t.due) ||
        (t.dueTime != null &&
          t.dueTime !== "" &&
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime)) ||
        t.start > t.due ||
        !["待开始", "进行中", "已完成"].includes(t.status) ||
        !["加急⚡", "高", "中", "低"].includes(t.priority) ||
        !(t.project === "" || pids.has(t.project))
      )
        throw Error("任务字段、日期、所属项目或 ID 不正确。");
      ids.add(t.id);
      return {
        id: t.id,
        title: t.title,
        project: t.project,
        start: t.start,
        startTime: t.startTime || "",
        due: t.due,
        dueTime: t.dueTime || "",
        status: t.status,
        priority: t.priority,
        note: t.note ?? "",
        ...(window.Recurring ? window.Recurring.taskMetadata(t) : {}),
      };
    });
    return {
      projects,
      tasks,
      schedules: window.Recurring
        ? window.Recurring.normalizeSchedules({ ...data, projects, tasks })
        : [],
    };
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
  async function rawApi(url, options = {}) {
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
          409: "远端数据已改变或分支冲突。请刷新合并版本后重新选择。",
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
  const projectStore = window.ProjectStore.create({
    request: rawApi,
    baseUrl,
    config: () => config,
    validate: validateData,
    encode: encodeData,
    decode: decodeData,
  });
  async function api(url, options = {}) {
    if (url === fileUrl() && options.method === "PUT")
      return projectStore.write(JSON.parse(options.body));
    return rawApi(url, options);
  }
  const remote = () => projectStore.read();
  function autoMerge(file) {
    if (!file) return null;
    const plan = window.MergeCore.plan(
      validateData(db),
      validateData(decodeData(file.content)),
      baselineSnapshot ? validateData(JSON.parse(baselineSnapshot)) : null,
    );
    const result = window.MergeCore.build(
      plan,
      () => "merge_" + crypto.randomUUID(),
    );
    return result.unresolved.length ? null : validateData(result.data);
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
    if (mergeSession || busy || checking) return;
    if (dirty && remoteChanged) {
      await openMerge();
      return;
    }
    if (
      !confirm(
        "读取 GitHub 将读取所有项目文件并替换本地项目和任务。建议先点「导出」备份；本次读取也会保留最近三次本地快照。继续？",
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
        remoteChanged = false;
        checked = true;
        syncError = false;
        dirty = true;
        lastChecked = new Date();
        rememberDirty();
        status("分支上还没有数据文件。点击「保存到 GitHub」可以创建。");
        return;
      }
      const data = validateData(decodeData(file.content));
      backupLocal();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      db = data;
      rememberBaseline(file.sha, JSON.stringify(data));
      dirty = false;
      remoteChanged = false;
      checked = true;
      syncError = false;
      lastChecked = new Date();
      rememberDirty();
      render();
      status("已读取 GitHub · " + new Date().toLocaleTimeString("zh-CN"));
      window.runRecurringTasks?.();
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
    }
  }
  async function writeRemote() {
    if (mergeSession || busy || checking) return;
    busy = true;
    updateButtons();
    status("正在逐项目检查远端版本…");
    try {
      const repo = await api(baseUrl());
      if (!repo.private) throw Error("只允许写入私有数据仓库。");
      const file = await remote();
      const before = localSnapshot();
      let data = validateData(db);
      if (file) {
        const merged = autoMerge(file);
        if (!merged) {
          remoteChanged = true;
          prepareMerge(file);
          status("同一记录有不同修改，请在弹窗选择合并版本。");
          return;
        }
        data = merged;
      } else if (baseSha)
        throw Error("远端存储已被删除，已阻止重新创建，请确认后重新连接。");
      if (
        !file &&
        !confirm(
          `将在私有仓库 ${config.owner}/${config.repo} 创建按项目存储目录；每个一级项目和其子项目单独保存。继续？`,
        )
      )
        return;
      const snapshot = JSON.stringify(data);
      const response = await api(fileUrl(), {
        method: "PUT",
        body: JSON.stringify({
          message: "Save Taskspace project changes",
          content: encodeData(data),
          branch: config.branch,
          ...(file ? { sha: file.sha } : {}),
        }),
      });
      // The store can incorporate an unrelated project committed during our upload.
      const saved = validateData(response.data || data);
      rememberBaseline(response.content.sha, JSON.stringify(saved));
      if (localSnapshot() === before) {
        backupLocal();
        db = saved;
        localStorage.setItem(CACHE_KEY, JSON.stringify(db));
        render();
      }
      dirty = localSnapshot() !== baselineSnapshot;
      remoteChanged = false;
      canAutoMerge = false;
      checked = true;
      syncError = false;
      lastChecked = new Date();
      rememberDirty();
      status(
        dirty
          ? "项目快照已保存；保存期间有新修改，请再次保存。"
          : "已按项目保存；其他项目的远端更新已自动保留。旧单文件备份保持不变。",
      );
      window.runRecurringTasks?.();
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
      mergePreview();
    }
  }
  let mergeSession = null,
    lastMergePromptKey = "";
  const mergeNames = { tasks: "任务", projects: "项目", schedules: "循环计划" };
  function mergeError(text) {
    el("merge-error").textContent = text;
  }
  function mergePreview() {
    if (!mergeSession) return;
    const result = window.MergeCore.build(mergeSession.plan, (row) =>
      mergeSession.copyIds.get(row.id),
    );
    el("merge-confirm").disabled = busy || !!result.unresolved.length;
    el("merge-summary").textContent = result.unresolved.length
      ? `还有 ${result.unresolved.length} 项冲突需要选择；相同的 ${mergeSession.plan.unchanged} 条记录自动保留。`
      : `合并后：${result.data.tasks.length} 项任务、${result.data.projects.length} 个项目、${result.data.schedules.length} 个循环计划。`;
    const warnings = el("merge-warnings");
    warnings.replaceChildren();
    for (const text of result.warnings) {
      const p = document.createElement("p");
      p.textContent = text;
      warnings.append(p);
    }
    return result;
  }
  function versionDescription(record, group, data) {
    if (!record) return "此版本中已删除 / 不存在";
    if (group === "tasks") {
      const p = data.projects.find((p) => p.id === record.project);
      return [
        `任务：${record.title}`,
        `状态：${record.status} · 优先级：${record.priority}`,
        `项目：${p?.title || "未分类"}`,
        `开始：${record.start} ${record.startTime || "00:00"}`,
        `截止：${record.due} ${record.dueTime || "23:59"}`,
        `备注：\n${record.note || "（空）"}`,
      ].join("\n");
    }
    if (group === "projects")
      return [
        `项目：${record.title}`,
        `上级：${data.projects.find((p) => p.id === record.parentId)?.title || "一级项目"}`,
        `颜色：${record.color}`,
        `说明：${record.description || "（空）"}`,
      ].join("\n");
    const rule = record.rule;
    return [
      `计划：${record.template.title}`,
      `状态：${record.active ? "启用" : "暂停"}`,
      `频率：${rule.frequency} / ${rule.interval}`,
      `星期：${rule.weekdays.join(", ") || "—"}`,
      `开始：${rule.anchor}；结束：${rule.until || "不限"}`,
      `下次日期：${record.nextDate || "已结束"}`,
      `模板：\n${JSON.stringify(record.template, null, 2)}`,
    ].join("\n");
  }
  function drawMerge() {
    const session = mergeSession;
    el("merge-list").replaceChildren();
    mergeError("");
    el("merge-context").textContent =
      `${config.owner}/${config.repo} · ${config.path.replace(/\.json$/, ".projects")} · 按一级项目存储 · 远端版本 ${session.remoteSha.slice(0, 8)}。${session.plan.hasBase ? "已参考上次同步版本判断单边修改及删除。" : "未找到共同版本：独有记录默认保留，同 ID 的不同版本需要你选择。"}`;
    for (const group of ["tasks", "projects", "schedules"]) {
      const rows = session.plan.rows.filter(
        (r) => r.group === group && r.kind !== "same",
      );
      if (!rows.length) continue;
      const heading = document.createElement("h3");
      heading.className = "merge-group-heading";
      heading.textContent = `${mergeNames[group]} · ${rows.length} 项差异`;
      el("merge-list").append(heading);
      for (const row of rows.sort(
        (a, b) => Number(b.kind === "conflict") - Number(a.kind === "conflict"),
      )) {
        const card = document.createElement("section");
        card.className = "merge-record";
        card.dataset.conflict = row.kind === "conflict";
        const title = document.createElement("strong");
        title.textContent =
          row.local?.title ||
          row.remote?.title ||
          row.local?.template?.title ||
          row.remote?.template?.title ||
          row.base?.title ||
          row.base?.template?.title ||
          row.id;
        const hint = document.createElement("span");
        hint.className = "merge-record-hint";
        hint.textContent =
          row.kind === "conflict"
            ? "两边不同，需要选择"
            : row.kind === "local-only"
              ? "仅本地存在"
              : row.kind === "remote-only"
                ? "仅远端存在"
                : row.kind === "local-change"
                  ? "本地修改（含删除）"
                  : "远端修改（含删除）";
        const options = document.createElement("div");
        options.className = "merge-options";
        const choices = [
          ["local", row.local ? "采用本地" : "采用本地删除"],
          ["remote", row.remote ? "采用远端" : "采用远端删除"],
          ...(group === "tasks" && row.local && row.remote
            ? [["both", "两个都保留"]]
            : []),
          ["omit", "不保留"],
        ];
        for (const [value, label] of choices) {
          const wrapper = document.createElement("label"),
            input = document.createElement("input"),
            text = document.createElement("span");
          input.type = "radio";
          input.name = "merge-" + session.plan.rows.indexOf(row);
          input.value = value;
          input.checked = row.choice === value;
          input.disabled = busy;
          input.onchange = () => {
            row.choice = value;
            mergeError("");
            mergePreview();
          };
          text.textContent = label;
          wrapper.append(input, text);
          options.append(wrapper);
        }
        const details = document.createElement("details");
        details.open = row.kind === "conflict";
        const summary = document.createElement("summary");
        summary.textContent = "对比具体内容";
        details.append(summary);
        const columns = document.createElement("div");
        columns.className = "merge-versions";
        for (const [side, label] of [
          ["local", "本地版本"],
          ["remote", "GitHub 版本"],
        ]) {
          const column = document.createElement("div"),
            head = document.createElement("div"),
            pre = document.createElement("pre");
          head.className = "merge-version-label";
          head.textContent = label;
          pre.textContent = versionDescription(row[side], group, session[side]);
          column.append(head, pre);
          columns.append(column);
        }
        details.append(columns);
        card.append(title, hint, options, details);
        el("merge-list").append(card);
      }
    }
    if (!session.plan.rows.some((r) => r.kind !== "same")) {
      const p = document.createElement("p");
      p.textContent = "两边数据内容一致，可以确认同步版本。";
      el("merge-list").append(p);
    }
    mergePreview();
  }
  function prepareMerge(file, baseOverride) {
    const remoteData = validateData(decodeData(file.content)),
      localData = validateData(db);
    let base = baseOverride || null;
    if (!base && baselineSnapshot)
      try {
        base = validateData(JSON.parse(baselineSnapshot));
      } catch {}
    const plan = window.MergeCore.plan(localData, remoteData, base);
    mergeSession = {
      plan,
      local: localData,
      remote: remoteData,
      localSnapshot: JSON.stringify(localData),
      remoteSha: file.sha,
      copyIds: new Map(
        plan.rows
          .filter((r) => r.group === "tasks")
          .map((r) => [r.id, "merge_" + crypto.randomUUID()]),
      ),
    };
    lastMergePromptKey = file.sha + ":" + baseSha;
    drawMerge();
    if (!el("gh-merge-dialog").open) el("gh-merge-dialog").showModal();
    updateButtons();
  }
  function offerMerge(file) {
    if (
      !file ||
      autoMerge(file) ||
      !remoteChanged ||
      !dirty ||
      mergeSession ||
      document.querySelector("dialog[open]")
    )
      return;
    const key = file.sha + ":" + baseSha;
    if (key === lastMergePromptKey) return;
    try {
      prepareMerge(file);
    } catch (e) {
      status("无法打开合并预览：" + e.message, true);
    }
  }
  async function openMerge() {
    if (!connected || busy || checking) return;
    busy = true;
    updateButtons();
    try {
      const file = await remote();
      if (!file) throw Error("远端数据文件不存在，暂时无法对比合并。");
      prepareMerge(file);
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      updateButtons();
      mergePreview();
    }
  }
  function finishMerge(data, sha) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    db = data;
    rememberBaseline(sha, JSON.stringify(data));
    dirty = false;
    remoteChanged = false;
    checked = true;
    syncError = false;
    lastChecked = new Date();
    rememberDirty();
    mergeSession = null;
    el("gh-merge-dialog").close();
    render();
    window.refreshDeadlineDock?.();
    window.runRecurringTasks?.();
    status(
      dirty
        ? "合并已上传；循环计划生成了新任务，需要再次保存。"
        : "合并并上传成功 · " + new Date().toLocaleTimeString("zh-CN"),
    );
  }
  async function confirmMerge() {
    if (!mergeSession || busy) return;
    const session = mergeSession,
      result = mergePreview();
    if (!result?.data) return;
    busy = true;
    updateButtons();
    el("merge-confirm").disabled = true;
    el("merge-cancel").disabled = true;
    mergeError("正在检查远端并保存合并结果…");
    try {
      const merged = validateData(result.data),
        snapshot = JSON.stringify(merged);
      if (localSnapshot() !== session.localSnapshot)
        throw Error("预览期间本地数据有新修改，请点击「刷新版本」重新选择。");
      const repo = await api(baseUrl());
      if (!repo.private) throw Error("仅允许保存到私有数据仓库。");
      const file = await remote();
      if (!file) throw Error("远端文件已被删除，请确认后再合并。");
      if (file.sha !== session.remoteSha) {
        if (
          JSON.stringify(validateData(decodeData(file.content))) === snapshot
        ) {
          if (localSnapshot() !== session.localSnapshot)
            throw Error("本地数据又有变化，请刷新合并版本。");
          backupLocal();
          finishMerge(merged, file.sha);
          return;
        }
        throw Error("远端已出现更新，已阻止覆盖。请点击「刷新版本」重新合并。");
      }
      if (localSnapshot() !== session.localSnapshot)
        throw Error("本地数据又有变化，请刷新合并版本。");
      const content = encodeData({
        schemaVersion: 2,
        updatedAt: new Date().toISOString(),
        ...merged,
      });
      // Per-project size limits are enforced by ProjectStore.
      backupLocal();
      const response = await api(fileUrl(), {
        method: "PUT",
        body: JSON.stringify({
          message: "Merge Taskspace local and remote changes",
          content,
          branch: config.branch,
          sha: file.sha,
        }),
      });
      if (localSnapshot() !== session.localSnapshot) {
        // Never replace changes made while the upload was running.
        remoteChanged = true;
        dirty = true;
        rememberDirty();
        mergeSession = null;
        el("gh-merge-dialog").close();
        prepareMerge(
          { sha: response.content.sha, content: encodeData(merged) },
          session.local,
        );
        status("合并结果已上传，但保存期间本地又有修改，请继续合并。");
        return;
      }
      finishMerge(validateData(response.data || merged), response.content.sha);
    } catch (e) {
      mergeError(e.message);
      status(e.message, true);
    } finally {
      busy = false;
      el("merge-cancel").disabled = false;
      updateButtons();
      mergePreview();
    }
  }
  el("gh-merge").onclick = openMerge;
  el("merge-confirm").onclick = confirmMerge;
  el("merge-refresh").onclick = openMerge;
  el("merge-cancel").onclick = () => {
    if (busy) return;
    mergeSession = null;
    el("gh-merge-dialog").close();
    updateButtons();
  };
  el("gh-merge-dialog").addEventListener("cancel", (event) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    mergeSession = null;
    updateButtons();
  });
  for (const side of ["local", "remote"])
    el("merge-all-" + side).onclick = () => {
      if (!mergeSession || busy) return;
      mergeSession.plan.rows
        .filter((r) => r.kind === "conflict")
        .forEach((r) => (r.choice = side));
      drawMerge();
    };

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
    baselineSnapshot = null;
    remoteChanged = false;
    checked = false;
    syncError = false;
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
    if (busy || checking || notebookBusy) return;
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
    remoteChanged = false;
    checked = false;
    syncError = false;
    lastChecked = null;
    baselineSnapshot = null;
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
      try {
        const saved = JSON.parse(localStorage.getItem(baselineKey()));
        if (
          saved &&
          typeof saved.sha === "string" &&
          typeof saved.snapshot === "string"
        ) {
          baseSha = saved.sha;
          baselineSnapshot = saved.snapshot;
          dirty = localSnapshot() !== baselineSnapshot;
        }
      } catch {}
      status(
        "已连接：按一级项目独立保存。兼容旧单文件，首次保存会迁移并保留旧文件。",
      );
      el("gh-dialog").close();
      busy = false;
      await checkRemoteState();
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
  const noteDirectory = () =>
    config.path?.replace(/\.json$/, ".notes") || "taskspace.notes";
  const noteContext = () => ({
    connected,
    key: JSON.stringify([
      config.owner || "",
      config.repo || "",
      config.branch || "",
      config.path || "",
    ]),
    directory: noteDirectory(),
    repository:
      config.owner && config.repo ? config.owner + "/" + config.repo : "",
  });
  function noteUrl(name) {
    if (!/^[^/\\\x00-\x1f]{1,200}\.md$/.test(name))
      throw Error("笔记文件名无效。");
    return (
      baseUrl() +
      "/contents/" +
      (noteDirectory() + "/" + name)
        .split("/")
        .map(encodeURIComponent)
        .join("/")
    );
  }
  function markdownFile(file) {
    if (!file) return null;
    if (
      file.type !== "file" ||
      file.encoding !== "base64" ||
      file.size > 900000
    )
      throw Error("笔记文件无法读取或超过 900 KB。");
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, "")), (c) =>
      c.charCodeAt(0),
    );
    return {
      sha: file.sha,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  }
  async function notebookOperation(fn) {
    if (!connected) throw Error("请先连接 GitHub 私有仓库。");
    if (busy || checking || notebookBusy || mergeSession)
      throw Error("GitHub 正在同步，请稍后重试。");
    notebookBusy = true;
    updateButtons();
    try {
      return await fn();
    } finally {
      notebookBusy = false;
      updateButtons();
    }
  }
  window.WorkstationGitHub = {
    context: noteContext,
    list: () =>
      notebookOperation(async () => {
        const head = await rawApi(
          baseUrl() +
            "/git/ref/heads/" +
            config.branch.split("/").map(encodeURIComponent).join("/"),
        );
        const ref = head.object.sha;
        const url =
          baseUrl() +
          "/contents/" +
          noteDirectory().split("/").map(encodeURIComponent).join("/");
        const entries = await rawApi(url + "?ref=" + encodeURIComponent(ref), {
          missingOK: true,
        });
        if (!entries) return [];
        if (!Array.isArray(entries) || entries.length >= 1000)
          throw Error("笔记目录异常或达到 1000 文件限制。");
        const result = [];
        for (const entry of entries.filter(
          (e) => e.type === "file" && e.name.endsWith(".md"),
        )) {
          result.push({
            name: entry.name,
            ...markdownFile(
              await rawApi(
                noteUrl(entry.name) + "?ref=" + encodeURIComponent(ref),
              ),
            ),
          });
        }
        return result;
      }),
    read: (name) =>
      notebookOperation(async () =>
        markdownFile(
          await rawApi(
            noteUrl(name) + "?ref=" + encodeURIComponent(config.branch),
            { missingOK: true },
          ),
        ),
      ),
    save: (name, text, sha, targetName = name) =>
      notebookOperation(async () => {
        if (new TextEncoder().encode(text).length > 900000)
          throw Error("笔记超过 900 KB，请拆分内容。");
        if (!(await rawApi(baseUrl())).private)
          throw Error("仅允许写入私有仓库。");
        const url = noteUrl(name),
          file = markdownFile(
            await rawApi(url + "?ref=" + encodeURIComponent(config.branch), {
              missingOK: true,
            }),
          );
        if ((file?.sha || null) !== (sha || null)) {
          const error = Error("笔记在 GitHub 上已有更新，请选择保留版本。");
          error.code = "NOTE_CONFLICT";
          error.remote = file;
          throw error;
        }
        noteUrl(targetName);
        if (targetName !== name) {
          const destination = await rawApi(
            noteUrl(targetName) + "?ref=" + encodeURIComponent(config.branch),
            { missingOK: true },
          );
          if (destination)
            throw Error(
              "已存在同名笔记，请修改标题后再保存，避免覆盖其他笔记。",
            );
        }
        if (file && targetName !== name) {
          // Rename and update in a single commit; a moving branch rejects the whole change.
          const refPath = config.branch
            .split("/")
            .map(encodeURIComponent)
            .join("/");
          const head = await rawApi(baseUrl() + "/git/ref/heads/" + refPath);
          const parent = head.object.sha;
          const sourceAtHead = await rawApi(noteUrl(name) + "?ref=" + parent, {
            missingOK: true,
          });
          const destinationAtHead = await rawApi(
            noteUrl(targetName) + "?ref=" + parent,
            { missingOK: true },
          );
          if (sourceAtHead?.sha !== file.sha || destinationAtHead)
            throw Error("笔记版本或目标文件已变化，请重新读取后保存。");
          const commit = await rawApi(baseUrl() + "/git/commits/" + parent);
          const directory = noteDirectory() + "/";
          const tree = await rawApi(baseUrl() + "/git/trees", {
            method: "POST",
            body: JSON.stringify({
              base_tree: commit.tree.sha,
              tree: [
                {
                  path: directory + name,
                  mode: "100644",
                  type: "blob",
                  sha: null,
                },
                {
                  path: directory + targetName,
                  mode: "100644",
                  type: "blob",
                  content: text,
                },
              ],
            }),
          });
          const next = await rawApi(baseUrl() + "/git/commits", {
            method: "POST",
            body: JSON.stringify({
              message: "Rename workstation note to match title",
              tree: tree.sha,
              parents: [parent],
            }),
          });
          await rawApi(baseUrl() + "/git/refs/heads/" + refPath, {
            method: "PATCH",
            body: JSON.stringify({ sha: next.sha, force: false }),
          });
          const saved = await rawApi(noteUrl(targetName) + "?ref=" + next.sha);
          return { sha: saved.sha, text, name: targetName };
        }
        let binary = "";
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const result = await rawApi(noteUrl(targetName), {
          method: "PUT",
          body: JSON.stringify({
            message: "Save workstation Markdown note",
            branch: config.branch,
            content: btoa(binary),
            ...(file ? { sha: file.sha } : {}),
          }),
        });
        return { sha: result.content.sha, text, name: targetName };
      }),
    remove: (name, sha) =>
      notebookOperation(async () => {
        if (!(await rawApi(baseUrl())).private)
          throw Error("仅允许写入私有仓库。");
        const url = noteUrl(name),
          file = markdownFile(
            await rawApi(url + "?ref=" + encodeURIComponent(config.branch), {
              missingOK: true,
            }),
          );
        if (!file) return;
        if (file.sha !== sha)
          throw Error("远端笔记已更新，请读取并合并后再删除。");
        await rawApi(url, {
          method: "DELETE",
          body: JSON.stringify({
            message: "Delete workstation Markdown note",
            branch: config.branch,
            sha: file.sha,
          }),
        });
      }),
  };
  status("本地模式 · 连接私有仓库后可读取和保存，Token 不会持久化。");
  window.validateTaskspaceData = validateData;
  updateButtons();
  el("gh-dock-state").onclick = () => {
    if (connected && dirty && remoteChanged && !canAutoMerge) {
      openMerge();
      return;
    }
    document.querySelector(".github-menu").open = true;
  };
  el("gh-check").onclick = checkRemoteState;
  setInterval(() => {
    if (document.visibilityState === "visible") checkRemoteState();
  }, 60000);
  window.addEventListener("focus", checkRemoteState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkRemoteState();
  });
})();
