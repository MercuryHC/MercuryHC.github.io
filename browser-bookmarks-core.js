/* Import inert snapshots only; never insert imported HTML into the live document. */
(function (root) {
  const LIMIT = 30000;
  function cleanUrl(raw) {
    try {
      const u = new URL(raw);
      if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
        return null;
      return u.href;
    } catch {
      return null;
    }
  }
  function text(v, max = 500) {
    return String(v || "")
      .trim()
      .slice(0, max);
  }
  function validate(source) {
    if (
      !source ||
      typeof source.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(source.id) ||
      !Array.isArray(source.items) ||
      !Array.isArray(source.folders) ||
      source.items.length > LIMIT ||
      source.folders.length > LIMIT
    )
      throw Error("书签快照格式无效或超过30000条限制。");
    const folders = [],
      ids = new Set();
    for (const f of source.folders) {
      if (
        typeof f.id !== "string" ||
        !f.id ||
        ids.has(f.id) ||
        f.id.length > 150
      )
        throw Error("书签目录 ID 无效。");
      ids.add(f.id);
      folders.push({
        id: f.id,
        title: text(f.title) || "未命名目录",
        parent: typeof f.parent === "string" ? f.parent : "",
      });
    }
    const map = new Map(folders.map((f) => [f.id, f]));
    for (const f of folders) {
      if (f.parent && !map.has(f.parent)) throw Error("书签上级目录不存在。");
      const seen = new Set([f.id]);
      let p = map.get(f.parent);
      while (p) {
        if (seen.has(p.id)) throw Error("书签目录存在循环。");
        seen.add(p.id);
        if (seen.size > 100) throw Error("书签目录层级过深。");
        p = map.get(p.parent);
      }
    }
    const items = [],
      keys = new Set();
    for (const b of source.items) {
      const url = cleanUrl(b.url);
      if (!url) continue;
      if (
        typeof b.id !== "string" ||
        !b.id ||
        b.id.length > 150 ||
        keys.has(b.id)
      )
        throw Error("书签 ID 无效或重复。");
      keys.add(b.id);
      items.push({
        id: b.id,
        title: text(b.title) || new URL(url).hostname,
        url,
        folder: ids.has(b.folder) ? b.folder : "",
        description: text(b.description, 2000),
        added: Number.isFinite(Number(b.added)) ? Number(b.added) : 0,
      });
    }
    return {
      id: source.id,
      name: text(source.name, 100) || "浏览器书签",
      browser: text(source.browser, 30) || "其他",
      mode: ["extension", "html", "json"].includes(source.mode)
        ? source.mode
        : "html",
      revision: text(source.revision, 100),
      updatedAt:
        typeof source.updatedAt === "string"
          ? source.updatedAt
          : new Date().toISOString(),
      folders,
      items,
    };
  }
  function collector(meta) {
    const folders = [],
      items = [],
      seen = new Set();
    let counter = 0,
      skipped = 0;
    return {
      folder(title, parent = "", id) {
        const f = {
          id: String(id || "folder-" + ++counter),
          title: text(title) || "未命名目录",
          parent,
        };
        folders.push(f);
        if (folders.length > LIMIT) throw Error("文件中的目录过多。");
        return f.id;
      },
      bookmark(title, url, folder = "", attrs = {}) {
        const safe = cleanUrl(url);
        if (!safe) {
          skipped++;
          return null;
        }
        const key = folder + "\0" + safe;
        if (seen.has(key)) {
          skipped++;
          return null;
        }
        seen.add(key);
        const b = {
          id: String(attrs.id || "link-" + ++counter),
          title: text(title) || new URL(safe).hostname,
          url: safe,
          folder,
          description: text(attrs.description, 2000),
          added: Number(attrs.added) || 0,
        };
        items.push(b);
        if (items.length > LIMIT) throw Error("单个来源最多支持30000条书签。");
        return b;
      },
      finish(mode) {
        return {
          source: validate({
            ...meta,
            mode,
            folders,
            items,
            updatedAt: new Date().toISOString(),
          }),
          skipped,
        };
      },
    };
  }
  function fromTree(tree, meta) {
    const c = collector(meta);
    let visits = 0;
    function walk(nodes, parent = "", depth = 0) {
      if (depth > 100) throw Error("书签目录层级过深。");
      for (const node of nodes || []) {
        if (++visits > LIMIT * 3) throw Error("书签树过大。");
        if (node.url)
          c.bookmark(node.title, node.url, parent, {
            id: node.id,
            added: node.dateAdded
              ? Math.floor(Number(node.dateAdded) / 1000)
              : node.date_added
                ? Math.floor(Number(node.date_added) / 1000000 - 11644473600)
                : 0,
          });
        else {
          const id =
            !node.title && !parent
              ? parent
              : c.folder(node.title, parent, node.id);
          walk(node.children, id, depth + 1);
        }
      }
    }
    walk(Array.isArray(tree) ? tree : [tree]);
    return c.finish(meta.mode || "extension");
  }
  function fromHtml(html, meta, doc = document) {
    if (!/<(?:DL|A)\b/i.test(html)) throw Error("这不是有效的 HTML 书签文件。");
    const template = doc.createElement("template");
    template.innerHTML = html.replace(/<!doctype[^>]*>/gi, "");
    const c = collector(meta);
    let last = null,
      visits = 0;
    const blocked = new Set([
      "SCRIPT",
      "STYLE",
      "IMG",
      "IFRAME",
      "OBJECT",
      "SVG",
      "LINK",
      "META",
      "BASE",
      "TEMPLATE",
    ]);
    function walk(nodes, parent = "", depth = 0) {
      if (depth > 100) throw Error("书签文件层级过深。");
      let pending = parent;
      for (const node of Array.from(nodes)) {
        if (node.nodeType !== 1) continue;
        if (++visits > LIMIT * 15) throw Error("书签 HTML 过大。");
        const tag = node.tagName.toUpperCase();
        if (blocked.has(tag)) continue;
        if (tag === "DT") {
          const heading = Array.from(node.children).find(
            (n) => n.tagName.toUpperCase() === "H3",
          );
          if (heading) {
            pending = c.folder(heading.textContent, parent);
            walk(
              Array.from(node.children).filter((n) => n !== heading),
              pending,
              depth + 1,
            );
          } else walk(node.childNodes, parent, depth + 1);
        } else if (tag === "H3") {
          pending = c.folder(node.textContent, parent);
        } else if (tag === "DL") {
          walk(node.childNodes, pending, depth + 1);
          pending = parent;
        } else if (tag === "A") {
          last = c.bookmark(
            node.textContent,
            node.getAttribute("href") || node.getAttribute("HREF"),
            parent,
            {
              added:
                node.getAttribute("add_date") || node.getAttribute("ADD_DATE"),
            },
          );
        } else if (tag === "DD") {
          if (last) last.description = text(node.textContent, 2000);
        } else walk(node.childNodes, parent, depth + 1);
      }
    }
    walk(template.content.childNodes);
    const result = c.finish("html");
    if (!result.source.items.length)
      throw Error("文件中没有可导入的 HTTP / HTTPS 书签。");
    return result;
  }
  function paths(source) {
    const map = new Map(source.folders.map((f) => [f.id, f])),
      cache = new Map([["", ""]]);
    function path(id) {
      if (cache.has(id)) return cache.get(id);
      const f = map.get(id);
      if (!f) return "";
      const parent = path(f.parent),
        value = (parent ? parent + " / " : "") + f.title;
      cache.set(id, value);
      return value;
    }
    source.folders.forEach((f) => path(f.id));
    return cache;
  }
  function rows(sources) {
    return sources.flatMap((s) => {
      const p = paths(s);
      return s.items.map((b) => ({
        ...b,
        source: s.id,
        sourceName: s.name,
        browser: s.browser,
        path: p.get(b.folder) || "",
      }));
    });
  }
  function search(
    all,
    query = "",
    source = "",
    folder = "",
    sort = "title",
    folders = [],
  ) {
    const terms = query
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean),
      allowed = new Set([folder]);
    if (folder) {
      const children = new Map();
      for (const f of folders) {
        if (!children.has(f.parent)) children.set(f.parent, []);
        children.get(f.parent).push(f.id);
      }
      const pending = [folder];
      while (pending.length) {
        for (const id of children.get(pending.pop()) || [])
          if (!allowed.has(id)) {
            allowed.add(id);
            pending.push(id);
          }
      }
    }
    return all
      .filter(
        (b) =>
          (!source || b.source === source) &&
          (!folder || allowed.has(b.folder)) &&
          terms.every((q) =>
            (
              b.title +
              " " +
              b.url +
              " " +
              b.path +
              " " +
              b.description +
              " " +
              b.sourceName +
              " " +
              b.browser
            )
              .normalize("NFKC")
              .toLowerCase()
              .includes(q),
          ),
      )
      .sort((a, b) =>
        sort === "date"
          ? b.added - a.added || a.title.localeCompare(b.title)
          : sort === "domain"
            ? new URL(a.url).hostname.localeCompare(new URL(b.url).hostname) ||
              a.title.localeCompare(b.title)
            : a.title.localeCompare(b.title),
      );
  }
  root.BrowserBookmarksCore = {
    validate,
    cleanUrl,
    fromTree,
    fromHtml,
    paths,
    rows,
    search,
  };
  if (typeof module !== "undefined") module.exports = root.BrowserBookmarksCore;
})(typeof window !== "undefined" ? window : globalThis);
