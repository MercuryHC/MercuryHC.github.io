(() => {
  "use strict";
  const DAY = 86400000,
    HOUR = 3600000,
    MINUTE = 60000,
    scales = { day: 72 / DAY, hour: 72 / HOUR, minute: 60 / MINUTE };
  const state = { scale: null, center: null, key: "" };
  let observer;
  const two = (n) => String(n).padStart(2, "0");
  function label(ms, unit) {
    const d = new Date(ms);
    return unit === DAY
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${two(d.getHours())}:${two(d.getMinutes())}`;
  }
  window.renderTaskTimeline = (tasks) => {
    observer?.disconnect();
    const host = document.getElementById("task-content");
    host.innerHTML =
      '<div class="zoom-timeline"><div class="timeline-controls"><div class="timeline-zoom"><button data-scale="day">按天</button><button data-scale="hour">按1h</button><button data-scale="minute">按分钟</button><button data-fit>适应全部</button><button data-today>现在</button></div><span class="timeline-tip">滚轮缩放 · 拖动平移 · Shift+滚轮平移</span></div><div class="timeline-range" aria-live="polite"></div><div class="timeline-canvas" tabindex="0" role="region" aria-label="任务时间线，滚轮放大缩小，左右方向键平移"><div class="timeline-axis-row"><span class="timeline-label-header">任务</span><div class="timeline-axis"></div></div><div class="timeline-rows"></div></div></div>';
    const canvas = host.querySelector(".timeline-canvas"),
      axis = host.querySelector(".timeline-axis"),
      rows = host.querySelector(".timeline-rows");
    const valid = tasks
      .map((task) => ({
        task,
        start: TaskTime.startAt(task),
        end: TaskTime.endAt(task),
      }))
      .filter((t) => Number.isFinite(t.start) && Number.isFinite(t.end));
    if (!valid.length) {
      rows.textContent = "任务时间无效，请检查起止日期。";
      return;
    }
    const earliest = Math.min(...valid.map((t) => t.start)),
      latest = Math.max(...valid.map((t) => t.end));
    let dragStart = null,
      dragged = false;
    const width = () =>
      Math.max(150, axis.clientWidth || canvas.clientWidth - 180);
    function fit() {
      const w = width();
      state.scale = Math.min(
        scales.minute * 2,
        Math.max(1 / (DAY * 365), (w - 48) / Math.max(HOUR, latest - earliest)),
      );
      state.center = (earliest + latest) / 2;
      draw();
    }
    const key = tasks.map((t) => t.id).join("|");
    if (state.key !== key) {
      state.key = key;
      state.scale = null;
      state.center = null;
    }
    function draw() {
      if (!state.scale || !Number.isFinite(state.center)) {
        fit();
        return;
      }
      const w = width(),
        start = state.center - w / (2 * state.scale),
        end = start + w / state.scale;
      const unit =
        state.scale >= 12 / MINUTE
          ? MINUTE
          : state.scale >= 12 / HOUR
            ? HOUR
            : DAY;
      const choices =
        unit === MINUTE
          ? [1, 2, 5, 10, 15, 30]
          : unit === HOUR
            ? [1, 2, 3, 6, 12]
            : [1, 2, 7, 14, 30, 90, 365];
      let step =
        choices.find((x) => x * unit * state.scale >= 48) || choices.at(-1);
      step *= unit;
      let first = Math.floor(start / step) * step;
      if (unit === DAY) {
        let d = new Date(start);
        d.setHours(0, 0, 0, 0);
        first = d.getTime();
      }
      const ticks = [];
      for (let t = first; t <= end + step && ticks.length < 200; t += step)
        ticks.push({ time: t, x: (t - start) * state.scale });
      axis.replaceChildren();
      for (const tick of ticks) {
        const item = document.createElement("span");
        item.className = "timeline-tick";
        item.style.left = tick.x + "px";
        item.textContent = label(tick.time, unit);
        axis.append(item);
      }
      const range = host.querySelector(".timeline-range");
      range.textContent = `${new Date(start).toLocaleString("zh-CN", { hour12: false })} — ${new Date(end).toLocaleString("zh-CN", { hour12: false })} · ${unit === DAY ? "天" : unit === HOUR ? "小时" : "分钟"}视图`;
      host
        .querySelectorAll("[data-scale]")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            b.dataset.scale ===
              (unit === DAY ? "day" : unit === HOUR ? "hour" : "minute"),
          ),
        );
      rows.replaceChildren();
      for (const item of valid) {
        const row = document.createElement("div");
        row.className = "timeline-data-row";
        const name = document.createElement("button");
        name.className = "timeline-task-name";
        name.textContent = item.task.title;
        name.title = item.task.title;
        name.onclick = () => openTask(item.task.id);
        const plot = document.createElement("div");
        plot.className = "timeline-plot";
        for (const tick of ticks) {
          const grid = document.createElement("i");
          grid.className = "timeline-grid";
          grid.style.left = tick.x + "px";
          plot.append(grid);
        }
        const now = Date.now();
        if (now >= start && now <= end) {
          const line = document.createElement("i");
          line.className = "timeline-now";
          line.style.left = (now - start) * state.scale + "px";
          plot.append(line);
        }
        if (item.end >= start && item.start <= end) {
          const bar = document.createElement("button");
          bar.className = "timeline-task-bar";
          const color = project(item.task.project)?.color || "#536ded";
          bar.style.background = color + "25";
          bar.style.color = color;
          bar.style.left =
            Math.max(0, (item.start - start) * state.scale) + "px";
          bar.style.width =
            Math.max(
              4,
              Math.min(w, (item.end - start) * state.scale) -
                Math.max(0, (item.start - start) * state.scale),
            ) + "px";
          bar.textContent =
            (item.task.status === "已完成" ? "✓ " : "") + item.task.title;
          bar.title = `${item.task.title}\n${item.task.start} ${item.task.startTime || "00:00"} → ${item.task.due} ${item.task.dueTime || "23:59"}`;
          bar.onclick = () => {
            if (!dragged) openTask(item.task.id);
          };
          plot.append(bar);
        }
        row.append(name, plot);
        rows.append(row);
      }
    }
    function setScale(scale, x = width() / 2) {
      const w = width(),
        at = state.center + (x - w / 2) / state.scale;
      state.scale = Math.min(
        scales.minute * 2,
        Math.max(1 / (DAY * 365), scale),
      );
      state.center = at - (x - w / 2) / state.scale;
      draw();
    }
    host
      .querySelectorAll("[data-scale]")
      .forEach((b) => (b.onclick = () => setScale(scales[b.dataset.scale])));
    host.querySelector("[data-fit]").onclick = fit;
    host.querySelector("[data-today]").onclick = () => {
      state.center = Date.now();
      draw();
    };
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const delta = event.deltaY || event.deltaX;
        if (event.shiftKey) {
          state.center += delta / state.scale;
          draw();
          return;
        }
        const x = event.clientX - axis.getBoundingClientRect().left;
        setScale(
          state.scale * Math.exp(-Math.max(-180, Math.min(180, delta)) * 0.008),
          Math.max(0, Math.min(width(), x)),
        );
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".timeline-task-name"))
        return;
      dragStart = {
        x: event.clientX,
        center: state.center,
        id: event.pointerId,
      };
      dragged = false;
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      const distance = event.clientX - dragStart.x;
      if (Math.abs(distance) > 4 && !dragged) {
        dragged = true;
        canvas.setPointerCapture(dragStart.id);
      }
      if (dragged) {
        state.center = dragStart.center - distance / state.scale;
        draw();
      }
    });
    canvas.addEventListener("pointerup", (event) => {
      if (!dragStart) return;
      dragStart = null;
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      setTimeout(() => (dragged = false), 0);
    });
    canvas.addEventListener("pointercancel", () => (dragStart = null));
    canvas.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        state.center +=
          ((event.key === "ArrowLeft" ? -1 : 1) * width()) / (4 * state.scale);
        draw();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setScale(state.scale * 2);
      } else if (event.key === "-") {
        event.preventDefault();
        setScale(state.scale / 2);
      }
    });
    observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
  };
})();
