(() => {
  "use strict";
  const core = window.Notes,
    form = document.getElementById("task-form"),
    area = form.elements.note,
    preview = document.getElementById("note-preview");
  function refresh() {
    const result = core.parse(area.value);
    preview.innerHTML =
      result.html ||
      '<p class="notes-placeholder">填写 Markdown 备注后，这里会显示预览。</p>';
    document.getElementById("note-checklist-progress").textContent =
      result.total
        ? `清单进度 ${result.done} / ${result.total}`
        : "支持 Markdown · - [ ] 创建清单";
  }
  window.loadTaskNotes = () => {
    document.getElementById("notes-save-hint").textContent =
      "勾选现有任务的清单会自动保存备注和状态；取消勾选会将已完成任务恢复为进行中。其余修改请点击保存任务。";
    refresh();
  };
  area.addEventListener("input", refresh);
  preview.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-note-line]");
    if (!checkbox) return;
    try {
      area.value = core.toggle(
        area.value,
        Number(checkbox.dataset.noteLine),
        checkbox.checked,
      );
      const status = core.statusFor(
        area.value,
        form.elements.status.value,
        true,
      );
      form.elements.status.value = status;
      const task = db.tasks.find((t) => t.id === editing);
      if (task) {
        task.note = area.value;
        task.status = status;
        save();
        document.getElementById("notes-save-hint").textContent =
          "清单勾选已自动保存；全部完成后自动完成任务。";
      } else
        document.getElementById("notes-save-hint").textContent =
          "清单状态已更新，点击保存任务后生效。";
      refresh();
    } catch (e) {
      toast(e.message);
      refresh();
    }
  });
  function wrap(before, after = before, placeholder = "文字") {
    const start = area.selectionStart,
      end = area.selectionEnd,
      value = area.value;
    const selected = value.slice(start, end) || placeholder;
    area.setRangeText(before + selected + after, start, end, "select");
    area.focus();
    area.setSelectionRange(
      start + before.length,
      start + before.length + selected.length,
    );
    refresh();
  }
  function prefix(value) {
    const start = area.selectionStart,
      end = area.selectionEnd,
      text = area.value,
      left = text.lastIndexOf("\n", start - 1) + 1;
    let right = text.indexOf("\n", end);
    if (right < 0) right = text.length;
    let selected = text.slice(left, right) || "阶段名称";
    area.setRangeText(
      selected
        .split("\n")
        .map((line) => value + line)
        .join("\n"),
      left,
      right,
      "select",
    );
    area.focus();
    refresh();
  }
  document.querySelectorAll("[data-note-format]").forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.noteFormat;
        if (action === "bold") wrap("**");
        else if (action === "italic") wrap("*");
        else if (action === "strike") wrap("~~");
        else if (action === "code") wrap("`");
        else if (action === "todo") prefix("- [ ] ");
        else if (action === "list") prefix("- ");
        else if (action === "heading") prefix("### ");
        else if (action === "link")
          wrap("[", "](https://example.com)", "链接文字");
      }),
  );
  document.getElementById("notes-view").onchange = (event) => {
    const mode = event.target.value;
    document.getElementById("note-editor").hidden = mode === "preview";
    document.getElementById("note-preview-wrap").hidden = mode === "edit";
    refresh();
  };
  area.addEventListener("keydown", (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      ["b", "i"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      wrap(event.key.toLowerCase() === "b" ? "**" : "*");
    }
  });
})();
