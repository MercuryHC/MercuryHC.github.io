(() => {
  'use strict';
  const Core = window.ReminderCore, $ = id => document.getElementById(id);
  let filter = 'pending', editingId = null, editingSnapshot = null;
  const items = () => db.reminders || [];
  function error(message = '') { $('reminder-error').textContent = message; }
  function show(mode) {
    const reminders = mode === 'reminders';
    $('task-main').hidden = mode !== 'tasks';
    const calendar = $('calendar-workspace');
    if (calendar) calendar.hidden = mode !== 'calendar';
    $('reminder-workspace').hidden = !reminders;
    for (const name of ['tasks', 'reminders', 'calendar']) {
      const button = $('task-mode-' + name), active = name === mode;
      if (!button) continue;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (reminders) renderList();
    if (mode === 'calendar') window.TaskCalendar?.render();
  }
  function reset() {
    editingId = editingSnapshot = null;
    $('reminder-form').reset();
    $('reminder-submit').textContent = '添加提醒事项';
    $('reminder-cancel').hidden = true;
    error();
  }
  function commit(next) {
    const candidate = {...db, reminders:Core.normalize(next)};
    // Persist first: a quota failure must not turn an unsaved change into live state.
    localStorage.setItem('taskspace-pages-v1', JSON.stringify(candidate));
    db = candidate;
    window.githubSyncMarkDirty?.();
    window.refreshDeadlineDock?.();
    renderList();
    window.TaskCalendar?.render();
    window.HomeWidgets?.refresh();
  }
  function act(fn) {
    try { error(); fn(); }
    catch (e) { error(e.message || '保存失败，请检查浏览器存储空间。'); }
  }
  function open(id) {
    const item = items().find(r => r.id === id);
    if (!item) return;
    // The app switch owns sidebar and workspace visibility.
    document.querySelector('[data-app="task"]')?.click();
    show('reminders');
    editingId = id;
    editingSnapshot = JSON.stringify(item);
    $('reminder-title').value = item.title;
    $('reminder-time').value = Core.toLocal(item.remindAt);
    $('reminder-submit').textContent = '保存修改';
    $('reminder-cancel').hidden = false;
    error();
    $('reminder-title').focus();
  }
  function renderList() {
    const list = $('reminder-list'), selected = Core.select(items(), filter);
    list.replaceChildren();
    $('reminder-count').textContent = `${selected.length} 项 · ${items().filter(r => !r.completed).length} 项待完成`;
    if (!selected.length) {
      const empty = document.createElement('li');
      empty.className = 'reminder-empty';
      empty.textContent = filter === 'completed' ? '还没有已完成的提醒事项。' : filter === 'all' ? '添加第一件要记住的事。' : '当前没有待完成的提醒事项。';
      list.append(empty);
    }
    for (const item of selected) {
      const row = document.createElement('li');
      row.className = 'reminder-row';
      row.dataset.completed = String(item.completed);
      row.dataset.overdue = String(Core.overdue(item));
      const check = document.createElement('input');
      check.type = 'checkbox'; check.checked = item.completed;
      check.setAttribute('aria-label', (item.completed ? '恢复：' : '完成：') + item.title);
      check.onchange = () => act(() => {
        const current = items().find(r => r.id === item.id);
        if (!current) { renderList(); return; }
        try { commit(items().map(r => r.id === item.id ? Core.complete(current, check.checked) : r)); }
        catch (e) { check.checked = current.completed; throw e; }
      });
      const content = document.createElement('div'), title = document.createElement('span'), time = document.createElement('time');
      content.className = 'reminder-content'; title.className = 'reminder-name'; title.textContent = item.title;
      time.dateTime = item.remindAt;
      time.textContent = new Date(item.remindAt).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) + (Core.overdue(item) ? ' · 已超时' : item.completed ? ' · 已完成' : '');
      content.append(title, time);
      const edit = document.createElement('button'), remove = document.createElement('button');
      edit.type = remove.type = 'button'; edit.className = remove.className = 'secondary';
      edit.textContent = '编辑'; remove.textContent = '删除';
      edit.setAttribute('aria-label', '编辑：' + item.title); remove.setAttribute('aria-label', '删除：' + item.title);
      edit.onclick = () => open(item.id);
      remove.onclick = () => act(() => {
        if (!confirm(`删除提醒事项「${item.title}」？`)) return;
        commit(items().filter(r => r.id !== item.id));
        if (editingId === item.id) reset();
      });
      row.append(check, content, edit, remove); list.append(row);
    }
  }
  $('reminder-form').onsubmit = event => {
    event.preventDefault();
    act(() => {
      const title = $('reminder-title').value, remindAt = Core.fromLocal($('reminder-time').value);
      if (editingId) {
        const current = items().find(r => r.id === editingId);
        if (!current || JSON.stringify(current) !== editingSnapshot) throw Error('此事项已被同步或其他操作修改，请取消编辑后重新打开。');
        commit(items().map(r => r.id === editingId ? Core.edit(current, title, remindAt) : r));
      } else {
        commit([...items(), Core.create(title, remindAt, 'reminder-' + crypto.randomUUID())]);
        filter = 'pending'; updateFilter();
      }
      reset(); $('reminder-title').focus();
    });
  };
  function updateFilter() {
    document.querySelectorAll('[data-reminder-filter]').forEach(button => {
      const active = button.dataset.reminderFilter === filter;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    renderList();
  }
  document.querySelectorAll('[data-reminder-filter]').forEach(button => {
    button.onclick = () => { filter = button.dataset.reminderFilter; updateFilter(); };
  });
  $('task-mode-tasks').onclick = () => show('tasks');
  $('task-mode-reminders').onclick = () => show('reminders');
  $('reminder-cancel').onclick = reset;
  window.RemindersWorkspace = {render:renderList, show, open, toggle(id) {const item=items().find(r=>r.id===id);if(item)commit(items().map(r=>r.id===id?Core.complete(r,!r.completed):r));}, createAt(value) {reset();show('reminders');$('reminder-time').value=value;$('reminder-title').focus();}};
  renderList();
  setInterval(() => { if (!$('reminder-workspace').hidden) renderList(); }, 15000);
  window.addEventListener('focus', renderList);
})();
