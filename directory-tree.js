/* Shared explorer for GitHub Notes and real Obsidian vault directories. */
(function (root) {
  const valid = (path) =>
    typeof path === "string" &&
    path.length < 1000 &&
    !path
      .split("/")
      .some(
        (p) =>
          !p ||
          p.startsWith(".") ||
          /[<>:"\\|?*\x00-\x1f]/.test(p) ||
          /[. ]$/.test(p),
      );
  const parent = (path) =>
    path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  function build(files, folders = []) {
    const root = { folders: new Map(), files: [] };
    function folder(path) {
      let node = root;
      for (const part of path.split("/").filter(Boolean)) {
        if (!node.folders.has(part))
          node.folders.set(part, { folders: new Map(), files: [] });
        node = node.folders.get(part);
      }
      return node;
    }
    for (const path of folders) folder(path);
    for (const f of files) folder(parent(f.path)).files.push(f);
    return root;
  }
  function render(
    container,
    {
      files,
      folders = [],
      current = "",
      selected = "",
      query = "",
      key,
      onFolder,
      onFile,
    },
  ) {
    const node = build(files, folders);
    let closed;
    try {
      closed = new Set(JSON.parse(localStorage.getItem(key)) || []);
    } catch {
      closed = new Set();
    }
    container.replaceChildren();
    function button(label, path, depth, folder) {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "explorer-row" +
        (folder
          ? current === path
            ? " folder-current"
            : ""
          : selected === path
            ? " active"
            : "");
      b.style.paddingLeft = 10 + depth * 16 + "px";
      b.title = path || "根目录";
      b.textContent = label;
      return b;
    }
    const rootButton = button("⌂ 根目录", "", 0, true);
    rootButton.onclick = () => onFolder("");
    container.append(rootButton);
    function walk(n, prefix = "", depth = 0) {
      for (const [name, child] of [...n.folders].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const path = prefix + name;
        const matches =
          path.toLowerCase().includes(query) ||
          folders.some(
            (p) => p.startsWith(path + "/") && p.toLowerCase().includes(query),
          ) ||
          files.some(
            (f) =>
              f.path.startsWith(path + "/") &&
              (f.path + " " + (f.search || "")).toLowerCase().includes(query),
          );
        if (query && !matches) continue;
        const expanded = query || !closed.has(path),
          b = button((expanded ? "▾ " : "▸ ") + "▱ " + name, path, depth, true);
        b.setAttribute("aria-expanded", String(!!expanded));
        b.onclick = () => {
          if (closed.has(path)) closed.delete(path);
          else closed.add(path);
          localStorage.setItem(key, JSON.stringify([...closed]));
          onFolder(path);
        };
        container.append(b);
        if (expanded) walk(child, path + "/", depth + 1);
      }
      for (const f of n.files.sort((a, b) => a.path.localeCompare(b.path))) {
        if (
          query &&
          !(f.path + " " + (f.search || "")).toLowerCase().includes(query)
        )
          continue;
        const b = button(
          "▤ " + (f.label || f.path.split("/").at(-1)),
          f.path,
          depth,
          false,
        );
        if (f.preview !== undefined) {
          b.textContent = '';
          const title = document.createElement('strong'), preview = document.createElement('span'), date = document.createElement('small');
          title.textContent = f.label || f.path;
          preview.textContent = f.preview || '没有附加文本';
          date.textContent = f.date || '';
          b.append(title, preview, date);
          b.classList.add('note-summary-row');
        }
        b.onclick = () => onFile(f);
        container.append(b);
      }
    }
    walk(node);
  }
  root.DirectoryTree = { valid, parent, build, render };
  if (typeof module !== "undefined") module.exports = root.DirectoryTree;
})(typeof window !== "undefined" ? window : globalThis);
