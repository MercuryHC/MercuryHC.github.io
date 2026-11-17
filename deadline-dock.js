/* In-page reminders only; times use the browser's local timezone. */
(() => {
  "use strict";
  function deadlineAt(task) {
    const time = task.dueTime || "23:59";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(task.due) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
      return NaN;
    const [y, m, d] = task.due.split("-").map(Number),
      [hour, minute] = time.split(":").map(Number);
    const result = new Date(
      y,
      m - 1,
      d,
      hour,
      minute,
      task.dueTime ? 0 : 59,
      task.dueTime ? 0 : 999,
    );
    if (
      result.getFullYear() !== y ||
      result.getMonth() !== m - 1 ||
      result.getDate() !== d
    )
      return NaN;
    return result.getTime();
  }
  function reminderLevel(task, now = Date.now()) {
    if (!["高", "加急⚡"].includes(task.priority) || task.status === "已完成")
      return null;
    const end = deadlineAt(task),
      remaining = end - now;
    if (!Number.isFinite(remaining)) return null;
    if (remaining < 3600000) return "red";
    if (remaining < 6 * 3600000) return "yellow";
    const startAt = window.TaskTime
      ? window.TaskTime.startAt(task)
      : new Date(
          task.start + "T" + (task.startTime || "00:00") + ":00",
        ).getTime();
    if (!Number.isFinite(startAt) || end - startAt <= 86400000) return null;
    const [y, m, d] = task.due.split("-").map(Number);
    const greenStart = new Date(y, m - 1, d - 1, 12, 0, 0, 0).getTime();
    return now >= greenStart ? "green" : null;
  }
  function urgentTasks(tasks, now = Date.now()) {
    const rank = { red: 0, yellow: 1, green: 2 };
    return tasks
      .map((task) => ({
        task,
        remaining: deadlineAt(task) - now,
        level: reminderLevel(task, now),
      }))
      .filter((item) => item.level)
      .sort(
        (a, b) => rank[a.level] - rank[b.level] || a.remaining - b.remaining,
      );
  }
  function remainingLabel(ms) {
    if (ms <= 0) {
      const minutes = Math.max(1, Math.floor(-ms / 60000));
      return minutes >= 60
        ? "已逾期 " + Math.floor(minutes / 60) + " 小时"
        : "已逾期 " + minutes + " 分钟";
    }
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return minutes >= 60
      ? "剩余 " +
          Math.floor(minutes / 60) +
          " 小时" +
          (minutes % 60 ? " " + (minutes % 60) + " 分钟" : "")
      : "剩余 " + minutes + " 分钟";
  }
  function refreshDeadlineDock() {
    const entries = urgentTasks(db.tasks),
      menu = document.querySelector(".deadline-menu");
    const trigger = document.getElementById("deadline-trigger"),
      count = document.getElementById("deadline-count"),
      list = document.getElementById("deadline-list");
    const level = entries[0]?.level || "none";
    menu.dataset.level = level;
    menu.classList.toggle("urgent", level === "red");
    count.hidden = entries.length === 0;
    count.textContent = entries.length > 99 ? "99+" : String(entries.length);
    const counts = { red: 0, yellow: 0, green: 0 };
    entries.forEach((item) => counts[item.level]++);
    const message = entries.length
      ? `高/加急任务提醒：红色 ${counts.red} 项，黄色 ${counts.yellow} 项，绿色 ${counts.green} 项`
      : "暂无需要提醒的高或加急任务";
    trigger.title = message;
    trigger.setAttribute("aria-label", message);
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "deadline-empty";
      empty.textContent = "暂无满足提醒条件的高或加急任务。";
      list.append(empty);
      return;
    }
    for (const { task, remaining, level } of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deadline-task";
      button.dataset.level = level;
      const name = document.createElement("span");
      name.className = "deadline-task-title";
      name.textContent = task.title;
      const meta = document.createElement("span");
      meta.className = "deadline-task-meta";
      meta.textContent =
        { red: "红色 · ", yellow: "黄色 · ", green: "绿色 · " }[level] +
        task.priority +
        " · " +
        remainingLabel(remaining) +
        " · " +
        task.due +
        " " +
        (task.dueTime || "23:59");
      button.append(name, meta);
      button.onclick = () => {
        menu.open = false;
        openTask(task.id);
      };
      list.append(button);
    }
  }
  window.refreshDeadlineDock = refreshDeadlineDock;
  refreshDeadlineDock();
  setInterval(refreshDeadlineDock, 15000);
  window.addEventListener("focus", refreshDeadlineDock);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDeadlineDock();
  });
  // Only one utility menu at a time; close on outside click and Escape.
  const menu = document.querySelector(".deadline-menu");
  menu.addEventListener("toggle", () => {
    if (menu.open) {
      document.querySelector(".github-menu").open = false;
      document.querySelector(".dock-account").open = false;
    }
  });
  for (const selector of [".github-menu", ".dock-account"]) {
    document.querySelector(selector).addEventListener("toggle", (event) => {
      if (event.target.open) menu.open = false;
    });
  }
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      document.getElementById("deadline-trigger").focus();
    }
  });
})();
