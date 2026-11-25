/* Three-way, record-level merge; selections are explicit for real conflicts. */
(function (root) {
  const groups = ["tasks", "projects", "schedules", "reminders"];
  const equal = (a, b) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const clone = (value) =>
    value == null ? null : JSON.parse(JSON.stringify(value));
  function plan(local, remote, base = null) {
    const rows = [];
    let unchanged = 0;
    for (const group of groups) {
      const maps = [local, remote, base].map(
        (data) =>
          new Map((data?.[group] || []).map((record) => [record.id, record])),
      );
      const ids = new Set([
        ...maps[0].keys(),
        ...maps[1].keys(),
        ...maps[2].keys(),
      ]);
      for (const id of ids) {
        const l = maps[0].get(id) || null,
          r = maps[1].get(id) || null,
          b = maps[2].get(id) || null;
        if (equal(l, r)) {
          if (l) unchanged++;
          rows.push({
            group,
            id,
            local: l,
            remote: r,
            base: b,
            choice: "local",
            kind: "same",
          });
          continue;
        }
        let choice = null,
          kind = "conflict";
        if (base) {
          if (equal(l, b)) {
            choice = "remote";
            kind = "remote-change";
          } else if (equal(r, b)) {
            choice = "local";
            kind = "local-change";
          }
        } else if (!l) {
          choice = "remote";
          kind = "remote-only";
        } else if (!r) {
          choice = "local";
          kind = "local-only";
        }
        rows.push({ group, id, local: l, remote: r, base: b, choice, kind });
      }
    }
    return { rows, unchanged, hasBase: !!base };
  }
  function build(plan, makeId) {
    const result = { projects: [], tasks: [], schedules: [], reminders: [] },
      warnings = [],
      unresolved = [];
    for (const row of plan.rows) {
      if (!row.choice) {
        unresolved.push(row);
        continue;
      }
      if (!["local", "remote", "both", "omit"].includes(row.choice))
        throw Error("合并选择无效。");
      if (row.choice === "omit") continue;
      if (row.choice === "both") {
        if (row.group !== "tasks" || !row.local || !row.remote)
          throw Error("只有任务的两个现有版本可以同时保留。");
        result.tasks.push(clone(row.local));
        const copy = clone(row.remote);
        copy.id = makeId(row);
        copy.title += "（远端副本）";
        delete copy.scheduleId;
        delete copy.occurrence;
        result.tasks.push(copy);
        continue;
      }
      const item = clone(row[row.choice]);
      if (item) result[row.group].push(item);
    }
    if (unresolved.length) return { data: null, warnings, unresolved };
    const projects = new Map(result.projects.map((p) => [p.id, p]));
    for (const p of result.projects)
      if (
        p.parentId &&
        (!projects.has(p.parentId) ||
          projects.get(p.parentId).parentId ||
          p.parentId === p.id)
      ) {
        p.parentId = "";
        warnings.push(
          `项目「${p.title}」的上级未保留或层级冲突，将提升为一级项目。`,
        );
      }
    for (const t of result.tasks)
      if (t.project && !projects.has(t.project)) {
        t.project = "";
        warnings.push(`任务「${t.title}」所属项目未保留，将移至未分类。`);
      }
    const scheduleIds = new Set(result.schedules.map((s) => s.id));
    for (const t of result.tasks)
      if (t.scheduleId && !scheduleIds.has(t.scheduleId)) {
        delete t.scheduleId;
        delete t.occurrence;
        warnings.push(
          `任务「${t.title}」的循环计划未保留，任务本身保留为普通任务。`,
        );
      }
    for (const s of result.schedules)
      if (s.template.project && !projects.has(s.template.project)) {
        s.template.project = "";
        warnings.push(
          `循环计划「${s.template.title}」所属项目未保留，将使用未分类。`,
        );
      }
    return { data: result, warnings, unresolved };
  }
  const api = { plan, build, equal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MergeCore = api;
})(typeof window !== "undefined" ? window : globalThis);
