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
  function urgentTasks(tasks, now = Date.now()) {
    return tasks
      .filter((task) => task.priority === "高" && task.status !== "已完成")
      .map((task) => ({ task, remaining: deadlineAt(task) - now }))
      .filter(
        (item) => Number.isFinite(item.remaining) && item.remaining < 3600000,
      )
      .sort((a, b) => a.remaining - b.remaining);
  }
  function remainingLabel(ms) {
    if (ms <= 0) {
      const minutes = Math.max(1, Math.floor(-ms / 60000));
      return minutes >= 60
        ? "已逾期 " + Math.floor(minutes / 60) + " 小时"
        : "已逾期 " + minutes + " 分钟";
    }
    return "剩余 " + Math.max(1, Math.ceil(ms / 60000)) + " 分钟";
  }
  function refreshDeadlineDock() {
    const entries = urgentTasks(db.tasks),
      menu = document.querySelector(".deadline-menu");
    const trigger = document.getElementById("deadline-trigger"),
      count = document.getElementById("deadline-count"),
      list = document.getElementById("deadline-list");
    menu.classList.toggle("urgent", entries.length > 0);
    count.hidden = entries.length === 0;
    count.textContent = entries.length > 99 ? "99+" : String(entries.length);
    const message = entries.length
      ? `${entries.length} 项高优任务即将到期或已逾期`
      : "暂无即将到期的高优任务";
    trigger.title = message;
    trigger.setAttribute("aria-label", message);
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "deadline-empty";
      empty.textContent = "暂无 1 小时内到期或逾期的高优任务。";
      list.append(empty);
      return;
    }
    for (const { task, remaining } of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deadline-task";
      const name = document.createElement("span");
      name.className = "deadline-task-title";
      name.textContent = task.title;
      const meta = document.createElement("span");
      meta.className = "deadline-task-meta";
      meta.textContent =
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
