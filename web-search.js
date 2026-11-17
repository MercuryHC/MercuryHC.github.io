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
  function install(doc, storage) {
    const form = doc.getElementById("web-search-form"),
      select = doc.getElementById("web-search-engine"),
      input = doc.getElementById("web-search-query");
    let saved = "google";
    try {
      saved = storage.getItem("workstation-search-engine") || saved;
    } catch {}
    select.value = Object.hasOwn(engines, saved) ? saved : "google";
    function update() {
      const e = engine(select.value);
      form.action = e.action;
      input.name = e.param;
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
    update();
  }
  root.WebSearch = { engines, engine, searchUrl, install };
  if (typeof module !== "undefined") module.exports = root.WebSearch;
  else install(document, localStorage);
})(typeof window !== "undefined" ? window : globalThis);
