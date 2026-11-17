/* Search is submitted only on Enter/button click; no queries are stored locally. */
(function (root) {
  const engines = {
    google: {
      label: "Google",
      action: "https://www.google.com/search",
      param: "q",
    },
    bing: { label: "必应", action: "https://www.bing.com/search", param: "q" },
    baidu: { label: "百度", action: "https://www.baidu.com/s", param: "wd" },
    github: {
      label: "GitHub",
      action: "https://github.com/search",
      param: "q",
    },
  };
  function engine(key) {
    return Object.hasOwn(engines, key) ? engines[key] : engines.google;
  }
  function searchUrl(key, query) {
    const q = String(query).trim();
    if (!q) throw Error("请输入搜索内容。");
    const e = engine(key),
      url = new URL(e.action);
    url.searchParams.set(e.param, q);
    return url.href;
  }
  const svg = (body) =>
    '<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">' +
    body +
    "</svg>";
  const icons = {
    google: svg(
      '<path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.7 2.9-4.2 2.9-7.4Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.3 13.9a6 6 0 0 1 0-3.8V7.5H2.9a10 10 0 0 0 0 9l3.4-2.6Z"/><path fill="#ea4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.5l3.4 2.6A6 6 0 0 1 12 5.9Z"/>',
    ),
    bing: svg(
      '<path fill="#16a3aa" d="M6 2v15l4 3 9-5-5-3-4 2V4Z"/><path fill="#35c2bc" d="m10 8 7 3 2 4-9-1Z"/><path fill="#098b8e" d="m6 17 4 3 9-5v3l-9 5-4-3Z"/>',
    ),
    baidu: svg(
      '<g fill="#4778ef"><ellipse cx="4.8" cy="7.2" rx="2.3" ry="3.2" transform="rotate(-25 4.8 7.2)"/><ellipse cx="10" cy="4.8" rx="2.2" ry="3.1"/><ellipse cx="15.5" cy="5" rx="2.2" ry="3" transform="rotate(15 15.5 5)"/><ellipse cx="20" cy="9" rx="2.2" ry="3.1" transform="rotate(25 20 9)"/><path d="M12 10c-3.2 0-4.5 4-6 6-2.4 3.5.2 6 3.1 5.1 2.2-.8 3.8-.8 6 0 3 .9 5.4-1.7 3-5.1-1.6-2-2.9-6-6.1-6Z"/></g>',
    ),
    github: svg(
      '<path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
    ),
  };
  function install(doc, storage) {
    const form = doc.getElementById("web-search-form"),
      select = doc.getElementById("web-search-engine"),
      input = doc.getElementById("web-search-query"),
      trigger = doc.getElementById("web-engine-trigger"),
      menu = doc.getElementById("web-engine-menu"),
      picker = doc.getElementById("web-engine-picker");
    const options = [];
    function close() {
      if (!menu) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    let saved = "google";
    try {
      saved = storage.getItem("workstation-search-engine") || saved;
    } catch {}
    select.value = Object.hasOwn(engines, saved) ? saved : "google";
    function update() {
      const e = engine(select.value);
      form.action = e.action;
      input.name = e.param;
      if (trigger) {
        doc.getElementById("web-engine-icon").innerHTML =
          icons[Object.hasOwn(icons, select.value) ? select.value : "google"];
        trigger.title = "当前：" + e.label + "，点击切换搜索引擎";
        trigger.setAttribute("aria-label", trigger.title);
        options.forEach((b) =>
          b.setAttribute(
            "aria-selected",
            String(b.dataset.engine === select.value),
          ),
        );
      }
      input.placeholder = "用 " + e.label + " 搜索网页";
      input.setAttribute("aria-label", "用 " + e.label + " 搜索网页");
      try {
        storage.setItem("workstation-search-engine", select.value);
      } catch {}
    }
    select.onchange = update;
    form.onsubmit = (e) => {
      input.value = input.value.trim();
      if (!input.value) {
        e.preventDefault();
        input.focus();
      }
    };
    if (trigger && menu && picker) {
      for (const [key, e] of Object.entries(engines)) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "engine-option";
        b.dataset.engine = key;
        b.setAttribute("role", "option");
        b.setAttribute("aria-label", e.label);
        b.title = e.label;
        b.innerHTML = icons[key] + "<span>" + e.label + "</span>";
        b.onclick = () => {
          select.value = key;
          update();
          close();
          input.focus();
        };
        menu.append(b);
        options.push(b);
      }
      trigger.onclick = () => {
        menu.hidden = !menu.hidden;
        trigger.setAttribute("aria-expanded", String(!menu.hidden));
      };
      trigger.onkeydown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          menu.hidden = false;
          trigger.setAttribute("aria-expanded", "true");
          options.find((b) => b.dataset.engine === select.value)?.focus();
        } else if (e.key === "Escape") close();
      };
      menu.onkeydown = (e) => {
        const index = options.indexOf(doc.activeElement);
        if (e.key === "Escape") {
          e.preventDefault();
          close();
          trigger.focus();
        } else if (
          [
            "ArrowDown",
            "ArrowUp",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          const target =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? options.length - 1
                : (index +
                    (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) +
                    options.length) %
                  options.length;
          options[target].focus();
        }
      };
      doc.addEventListener("pointerdown", (e) => {
        if (!picker.contains(e.target)) close();
      });
      picker.addEventListener("focusout", (e) => {
        if (!picker.contains(e.relatedTarget)) close();
      });
    }
    update();
  }
  root.WebSearch = { engines, engine, searchUrl, install };
  if (typeof module !== "undefined") module.exports = root.WebSearch;
  else install(document, localStorage);
})(typeof window !== "undefined" ? window : globalThis);
