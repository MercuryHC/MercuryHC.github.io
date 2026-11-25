/* Single-instant reminders; missing collections are legacy empty collections. */
(function (root) {
  'use strict';
  function instant(value) {
    if (typeof value !== 'string') return false;
    const day = value.slice(0,10), date = new Date(day);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) return false;
    return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && Number.isFinite(Date.parse(value));
  }
  function normalize(items) {
    if (items === undefined) return [];
    if (!Array.isArray(items) || items.length > 10000) throw Error('提醒事项列表无效或超过 10000 项。');
    const ids = new Set();
    return items.map(r => {
      if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id) || ids.has(r.id) ||
          typeof r.title !== 'string' || !r.title.trim() || r.title.length > 500 ||
          !instant(r.remindAt) || typeof r.completed !== 'boolean' || !instant(r.createdAt) || !instant(r.updatedAt) ||
          (r.completed ? !instant(r.completedAt) : r.completedAt !== null)) throw Error('提醒事项名称、时间、完成状态或 ID 无效。');
      ids.add(r.id);
      return {id:r.id, title:r.title, remindAt:r.remindAt, completed:r.completed,
        completedAt:r.completedAt, createdAt:r.createdAt, updatedAt:r.updatedAt};
    });
  }
  function create(title, remindAt, id, now = new Date().toISOString()) {
    return normalize([{id, title:title.trim(), remindAt, completed:false, completedAt:null, createdAt:now, updatedAt:now}])[0];
  }
  function edit(item, title, remindAt, now = new Date().toISOString()) {
    return normalize([{...item, title:title.trim(), remindAt, updatedAt:now}])[0];
  }
  function complete(item, done, now = new Date().toISOString()) {
    return normalize([{...item, completed:done, completedAt:done ? now : null, updatedAt:now}])[0];
  }
  const overdue = (r, now = Date.now()) => !r.completed && Date.parse(r.remindAt) < now;
  function select(items, filter = 'pending') {
    return items.filter(r => filter === 'all' || r.completed === (filter === 'completed'))
      .sort((a,b) => Number(a.completed)-Number(b.completed) || Date.parse(a.remindAt)-Date.parse(b.remindAt) || a.id.localeCompare(b.id));
  }
  function fromLocal(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('请选择有效的提醒时间。');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || toLocal(date.toISOString()) !== value) throw Error('请选择有效的本地提醒时间。');
    return date.toISOString();
  }
  function toLocal(value) {
    const d = new Date(value), pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const api = {normalize, create, edit, complete, overdue, select, fromLocal, toLocal};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReminderCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
