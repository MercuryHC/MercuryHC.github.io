(function (root) {
  const validTime = (value) =>
    value == null ||
    value === "" ||
    (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
  function stamp(date, time, end = false) {
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !validTime(time)
    )
      return NaN;
    const [y, m, d] = date.split("-").map(Number),
      [h, min] = (time || (end ? "23:59" : "00:00")).split(":").map(Number);
    const result = new Date(
      y,
      m - 1,
      d,
      h,
      min,
      end && !time ? 59 : 0,
      end && !time ? 999 : 0,
    );
    return result.getFullYear() === y &&
      result.getMonth() === m - 1 &&
      result.getDate() === d
      ? result.getTime()
      : NaN;
  }
  const startAt = (t) => stamp(t.start, t.startTime),
    endAt = (t) => stamp(t.due, t.dueTime, true),
    validRange = (t) =>
      Number.isFinite(startAt(t)) &&
      Number.isFinite(endAt(t)) &&
      startAt(t) <= endAt(t);
  const api = { validTime, stamp, startAt, endAt, validRange };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TaskTime = api;
})(typeof window !== "undefined" ? window : globalThis);
