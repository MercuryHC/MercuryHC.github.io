/* Date-only recurrence calculations use UTC days to avoid DST drift. */
(function (root) {
  const DAY = 86400000;
  const validDate = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  const number = (s) => Date.parse(s + "T00:00:00Z") / DAY;
  const date = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const addDays = (s, n) => date(number(s) + n);
  const weekday = (s) => new Date(s + "T00:00:00Z").getUTCDay();
  function normalizeRule(rule) {
    if (
      !rule ||
      !["daily", "weekly", "monthly"].includes(rule.frequency) ||
      !validDate(rule.anchor) ||
      !Number.isInteger(rule.interval) ||
      rule.interval < 1 ||
      rule.interval > 52 ||
      !(rule.until === "" || rule.until == null || validDate(rule.until))
    )
      throw Error("循环规则或日期格式不正确。");
    const weekdays = Array.isArray(rule.weekdays)
      ? [...new Set(rule.weekdays)].sort()
      : [];
    if (
      weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      (rule.frequency === "weekly" && !weekdays.length)
    )
      throw Error("每周循环至少选择一个星期。");
    if (rule.until && rule.until < rule.anchor)
      throw Error("循环结束日期不能早于开始日期。");
    return {
      frequency: rule.frequency,
      interval: rule.interval,
      anchor: rule.anchor,
      weekdays,
      until: rule.until || "",
    };
  }
  function nextDate(input, after) {
    const r = normalizeRule(input);
    if (!validDate(after)) throw Error("循环游标无效。");
    const first = Math.max(number(after) + 1, number(r.anchor));
    let result;
    if (r.frequency === "daily")
      result = date(
        number(r.anchor) +
          Math.max(0, Math.ceil((first - number(r.anchor)) / r.interval)) *
            r.interval,
      );
    if (r.frequency === "weekly") {
      const monday = number(r.anchor) - ((weekday(r.anchor) + 6) % 7);
      for (let n = first; n <= first + r.interval * 7 + 7; n++)
        if (
          Math.floor((n - monday) / 7) % r.interval === 0 &&
          r.weekdays.includes(weekday(date(n)))
        ) {
          result = date(n);
          break;
        }
    }
    if (r.frequency === "monthly") {
      const a = new Date(r.anchor + "T00:00:00Z"),
        f = new Date(first * DAY),
        anchorMonth = a.getUTCFullYear() * 12 + a.getUTCMonth(),
        startMonth = f.getUTCFullYear() * 12 + f.getUTCMonth();
      for (let m = startMonth; m <= startMonth + r.interval; m++) {
        if ((m - anchorMonth) % r.interval !== 0) continue;
        const y = Math.floor(m / 12),
          mo = m % 12,
          last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(),
          d = Math.min(a.getUTCDate(), last);
        const candidate = new Date(Date.UTC(y, mo, d))
          .toISOString()
          .slice(0, 10);
        if (number(candidate) >= first) {
          result = candidate;
          break;
        }
      }
    }
    return result && (!r.until || result <= r.until) ? result : null;
  }
  function normalizeSchedules(data) {
    if (data.schedules == null) return [];
    if (!Array.isArray(data.schedules) || data.schedules.length > 1000)
      throw Error("循环计划数量或格式无效。");
    const ids = new Set();
    const pids = new Set(data.projects.map((p) => p.id));
    return data.schedules.map((s) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id) ||
        ids.has(s.id) ||
        typeof s.active !== "boolean" ||
        !(s.nextDate === null || validDate(s.nextDate))
      )
        throw Error("循环计划 ID、状态或游标无效。");
      ids.add(s.id);
      const rule = normalizeRule(s.rule),
        t = s.template;
      if (
        !t ||
        typeof t.title !== "string" ||
        !t.title.trim() ||
        t.title.length > 1000 ||
        typeof t.note !== "string" ||
        t.note.length > 50000 ||
        !(t.project === "" || pids.has(t.project)) ||
        !["加急⚡", "高", "中", "低"].includes(t.priority) ||
        !Number.isInteger(t.durationDays) ||
        t.durationDays < 0 ||
        t.durationDays > 3650 ||
        !(t.dueTime === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime))
      )
        throw Error("循环任务模板无效。");
      if (s.nextDate && s.nextDate < rule.anchor)
        throw Error("循环游标不能早于开始日期。");
      return {
        id: s.id,
        active: s.active,
        nextDate: s.nextDate,
        rule,
        template: {
          title: t.title,
          project: t.project,
          priority: t.priority,
          note: t.note,
          dueTime: t.dueTime,
          durationDays: t.durationDays,
        },
      };
    });
  }
  function taskMetadata(t) {
    if (!t.scheduleId && !t.occurrence) return {};
    if (
      typeof t.scheduleId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(t.scheduleId) ||
      !validDate(t.occurrence)
    )
      throw Error("循环任务来源无效。");
    return { scheduleId: t.scheduleId, occurrence: t.occurrence };
  }
  function generate(data, today, limit = 300) {
    if (!validDate(today)) throw Error("日期无效。");
    let created = 0,
      changed = false,
      scanned = 0;
    const seen = new Set(
      data.tasks
        .filter((t) => t.scheduleId)
        .map((t) => t.scheduleId + ":" + t.occurrence),
    );
    const ids = new Set(data.tasks.map((t) => t.id));
    for (const s of data.schedules || []) {
      while (
        s.active &&
        s.nextDate &&
        s.nextDate <= today &&
        scanned < limit &&
        data.tasks.length < 50000
      ) {
        const occurrence = s.nextDate,
          id = "r_" + s.id + "_" + occurrence,
          key = s.id + ":" + occurrence;
        if (!seen.has(key) && !ids.has(id)) {
          const t = s.template;
          data.tasks.push({
            id,
            title: t.title,
            project: t.project,
            start: occurrence,
            due: addDays(occurrence, t.durationDays),
            dueTime: t.dueTime,
            status: "待开始",
            priority: t.priority,
            note: t.note,
            scheduleId: s.id,
            occurrence,
          });
          seen.add(key);
          ids.add(id);
          created++;
        }
        s.nextDate = nextDate(s.rule, occurrence);
        changed = true;
        scanned++;
      }
    }
    return { created, changed };
  }
  const api = {
    validDate,
    addDays,
    weekday,
    nextDate,
    normalizeRule,
    normalizeSchedules,
    taskMetadata,
    generate,
    dayDifference: (a, b) => number(b) - number(a),
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Recurring = api;
})(typeof window !== "undefined" ? window : globalThis);
