(() => {
  "use strict";
  const R = window.Recurring,
    $ = (id) => document.getElementById(id),
    f = $("task-form");
  let running = false;
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const schedules = () => db.schedules || (db.schedules = []);
  function describe(s) {
    const r = s.rule,
      n = r.interval;
    return (
      (r.frequency === "daily"
        ? `每 ${n} 天`
        : r.frequency === "weekly"
          ? `每 ${n} 周 · ` +
            r.weekdays
              .map((d) => ["日", "一", "二", "三", "四", "五", "六"][d])
              .join("、")
          : `每 ${n} 月 · ${Number(r.anchor.slice(8))} 日`) +
      (r.until ? " · 至 " + r.until : "")
    );
  }
  function refreshFields() {
    const frequency = $("repeat-frequency").value;
    $("repeat-options").hidden = frequency === "none";
    $("repeat-interval").disabled = frequency === "none";
    $("repeat-until").disabled = frequency === "none";
    $("repeat-weekdays").hidden = frequency !== "weekly";
    $("repeat-month-note").hidden = frequency !== "monthly";
    $("repeat-unit").textContent =
      { daily: "天", weekly: "周", monthly: "月" }[frequency] || "天";
  }
  window.loadTaskRecurrence = (task) => {
    const s = schedules().find((s) => s.id === task.scheduleId);
    $("repeat-frequency").value = s?.active ? s.rule.frequency : "none";
    $("repeat-interval").value = s?.rule.interval || 1;
    $("repeat-until").value = s?.rule.until || "";
    document
      .querySelectorAll("[data-weekday]")
      .forEach(
        (el) =>
          (el.checked = s
            ? s.rule.weekdays.includes(Number(el.dataset.weekday))
            : Number(el.dataset.weekday) === R.weekday(task.start)),
      );
    $("repeat-series-note").textContent = s
      ? "这项任务属于循环计划。修改规则仅影响后续新任务；选择不重复会停止后续生成。删除单次任务不会停止整个计划。"
      : "首次任务从开始日期起，按所选循环规则安排。历史任务不会因下一轮生成而自动完成。";
    refreshFields();
  };
  window.applyTaskRecurrence = (task, isNew) => {
    const frequency = $("repeat-frequency").value;
    let s = schedules().find((s) => s.id === task.scheduleId);
    if (frequency === "none") {
      if (s) s.active = false;
      return;
    }
    const rule = R.normalizeRule({
      frequency,
      interval: Number($("repeat-interval").value),
      anchor:
        s && db.tasks.find((t) => t.id === task.id)?.start === task.start
          ? s.rule.anchor
          : task.start,
      weekdays: [...document.querySelectorAll("[data-weekday]:checked")].map(
        (el) => Number(el.dataset.weekday),
      ),
      until: $("repeat-until").value,
    });
    const durationDays = R.dayDifference(task.start, task.due);
    if (durationDays > 3650) throw Error("循环任务跨度不能超过 3650 天。");
    const first = R.nextDate(rule, R.addDays(task.start, -1));
    if (!first) throw Error("结束日期之前没有符合条件的执行日期。");
    if (isNew && !s) {
      task.start = first;
      task.due = R.addDays(first, durationDays);
    }
    const next =
      s && JSON.stringify(s.rule) === JSON.stringify(rule)
        ? s.nextDate
        : R.nextDate(rule, task.start);
    if (!s) {
      s = { id: crypto.randomUUID() };
      schedules().push(s);
    }
    Object.assign(s, {
      active: true,
      rule,
      nextDate: next,
      template: {
        title: task.title,
        project: task.project,
        priority: task.priority,
        note: task.note || "",
        dueTime: task.dueTime || "",
        startTime: task.startTime || "",
        durationDays,
      },
    });
    task.scheduleId = s.id;
    task.occurrence = task.occurrence || task.start;
  };
  function run() {
    if (running) return;
    running = true;
    try {
      const result = R.generate(db, localToday());
      if (result.changed) {
        localStorage.setItem("taskspace-pages-v1", JSON.stringify(db));
        render();
        window.githubSyncMarkDirty?.();
        window.refreshDeadlineDock?.();
      }
      refreshList();
    } catch (e) {
      toast("循环计划检查失败：" + e.message);
    } finally {
      running = false;
    }
  }
  window.runRecurringTasks = run;
  function refreshList() {
    const list = $("recurring-list");
    list.replaceChildren();
    if (!schedules().length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "还没有循环计划。新建任务时选择重复频率即可。";
      list.append(p);
      return;
    }
    for (const s of schedules()) {
      const item = document.createElement("article");
      item.className = "recurring-item";
      const title = document.createElement("strong");
      title.textContent = s.template.title;
      const p = document.createElement("p");
      p.textContent = describe(s);
      const state = document.createElement("p");
      state.textContent =
        (s.active
          ? s.nextDate
            ? "下次开始：" + s.nextDate
            : "已结束"
          : "已暂停") +
        " · " +
        (s.template.startTime ? "开始 " + s.template.startTime + " · " : "") +
        (s.template.dueTime ? "截止 " + s.template.dueTime : "截止当日 23:59");
      const actions = document.createElement("div");
      actions.className = "row";
      actions.style.marginTop = "10px";
      const edit = document.createElement("button");
      edit.className = "secondary";
      edit.textContent = "编辑计划";
      edit.onclick = () => {
        const t = [...db.tasks].reverse().find((t) => t.scheduleId === s.id);
        if (t) {
          $("recurring-dialog").close();
          openTask(t.id);
        } else toast("该计划没有可编辑实例，请新建计划。");
      };
      const pause = document.createElement("button");
      pause.className = "secondary";
      pause.textContent = s.active ? "暂停生成" : "恢复生成";
      pause.disabled = !s.nextDate;
      pause.onclick = () => {
        s.active = !s.active;
        save();
        run();
      };
      actions.append(edit, pause);
      item.append(title, p, state, actions);
      list.append(item);
    }
  }
  $("repeat-frequency").onchange = refreshFields;
  $("recurring-open").onclick = () => {
    refreshList();
    $("recurring-dialog").showModal();
  };
  $("recurring-close").onclick = () => $("recurring-dialog").close();
  $("recurring-create").onclick = () => {
    $("recurring-dialog").close();
    openTask();
    $("repeat-frequency").value = "daily";
    refreshFields();
  };
  // Opening, importing, or pulling data catches up due occurrences, in bounded batches.
  run();
  setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, 60000);
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
})();
