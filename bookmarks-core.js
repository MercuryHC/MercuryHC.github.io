(function (root) {
  const icons = {
    github:
      '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
    chatgpt: "✺",
    notion: "N",
    google: "G",
    huggingface: "🤗",
    arxiv: "α",
    bilibili: "▰",
    code: "⌘",
    book: "▤",
    link: "↗",
    star: "★",
    tool: "⚙",
    cloud: "☁",
    mail: "✉",
    video: "▶",
  };
  function url(value) {
    const u = new URL(value.includes("://") ? value : "https://" + value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw Error("网址必须是有效的 HTTP / HTTPS 地址，且不能包含账号密码。");
    return u.href;
  }
  function validate(data) {
    if (
      !Array.isArray(data?.groups) ||
      !Array.isArray(data?.items) ||
      data.groups.length > 100 ||
      data.items.length > 1000
    )
      throw Error("收藏格式无效或数量过多。");
    const groups = [
      ...new Set(
        data.groups.map((g) => {
          if (typeof g !== "string" || !g.trim() || g.length > 40)
            throw Error("分组名称无效。");
          return g.trim();
        }),
      ),
    ];
    if (!groups.length) groups.push("常用");
    const ids = new Set();
    return {
      groups,
      items: data.items.map((b) => {
        if (
          typeof b.id !== "string" ||
          !b.id ||
          b.id.length > 100 ||
          ids.has(b.id) ||
          typeof b.title !== "string" ||
          !b.title.trim() ||
          b.title.length > 100
        )
          throw Error("收藏名称或 ID 无效。");
        ids.add(b.id);
        if (typeof b.icon !== "string" || b.icon.length > 500)
          throw Error("图标无效。");
        const icon = b.icon.startsWith("http") ? url(b.icon) : b.icon;
        if (!/^#[a-f0-9]{6}$/i.test(b.color)) throw Error("图标颜色无效。");
        return {
          id: b.id,
          title: b.title.trim(),
          url: url(b.url),
          group: groups.includes(b.group) ? b.group : groups[0],
          icon,
          color: b.color,
        };
      }),
    };
  }
  function defaults() {
    return {
      groups: ["常用", "开发", "学习"],
      items: [
        ["GitHub", "https://github.com/", "github", "#26364c", "开发"],
        ["ChatGPT", "https://chatgpt.com/", "chatgpt", "#168977", "常用"],
        ["Notion", "https://www.notion.so/", "notion", "#505762", "常用"],
        ["Google", "https://www.google.com/", "google", "#4285f4", "常用"],
        [
          "Hugging Face",
          "https://huggingface.co/",
          "huggingface",
          "#e2a52d",
          "开发",
        ],
        ["arXiv", "https://arxiv.org/", "arxiv", "#ae474b", "学习"],
        [
          "Bilibili",
          "https://www.bilibili.com/",
          "bilibili",
          "#e3799b",
          "常用",
        ],
        [
          "Stack Overflow",
          "https://stackoverflow.com/",
          "code",
          "#d38345",
          "开发",
        ],
      ].map((a, i) => ({
        id: "preset-" + i,
        title: a[0],
        url: a[1],
        icon: a[2],
        color: a[3],
        group: a[4],
      })),
    };
  }
  function plan(local, remote, base = null) {
    local = validate(local);
    remote = validate(remote);
    if (base) base = validate(base);
    const maps = [local, remote, base].map(
        (d) => new Map((d?.items || []).map((b) => [b.id, b])),
      ),
      equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const order =
      base &&
      equal(
        local.items.map((x) => x.id),
        base.items.map((x) => x.id),
      )
        ? [...remote.items, ...local.items]
        : [...local.items, ...remote.items];
    const rows = [
      ...new Set(
        order.map((x) => x.id).concat(base?.items.map((x) => x.id) || []),
      ),
    ].map((id) => {
      const l = maps[0].get(id),
        r = maps[1].get(id),
        b = maps[2].get(id);
      let choice = null;
      if (equal(l, r)) choice = "local";
      else if (base && equal(l, b)) choice = "remote";
      else if (base && equal(r, b)) choice = "local";
      else if (!base && (!l || !r)) choice = l ? "local" : "remote";
      return { id, local: l, remote: r, choice };
    });
    const groups = [...new Set([...local.groups, ...remote.groups])].filter(
      (g) => {
        if (!base) return true;
        const l = local.groups.includes(g),
          r = remote.groups.includes(g),
          b = base.groups.includes(g);
        return l === b ? r : r === b ? l : l || r;
      },
    );
    return { rows, groups, conflicts: rows.filter((r) => !r.choice) };
  }
  function build(plan) {
    if (plan.rows.some((r) => !r.choice))
      throw Error("请先选择所有冲突的保留版本。");
    const items = plan.rows
        .map((r) => (r.choice === "local" ? r.local : r.remote))
        .filter(Boolean),
      groups = [...plan.groups];
    for (const b of items) if (!groups.includes(b.group)) groups.push(b.group);
    return validate({ groups, items });
  }
  root.BookmarksCore = { icons, url, validate, defaults, plan, build };
  if (typeof module !== "undefined") module.exports = root.BookmarksCore;
})(typeof window !== "undefined" ? window : globalThis);
