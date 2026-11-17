/* Markdown source remains the only stored representation. Raw HTML is disabled. */
(function (root) {
  const factory =
    typeof module !== "undefined" && module.exports
      ? require("./vendor/markdown-it.min.js")
      : root.markdownit;
  const md = factory({
    html: false,
    breaks: true,
    linkify: false,
    typographer: false,
    highlight(source, language) {
      const escape = (value) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const aliases = {
        cuda: "cpp",
        cu: "cpp",
        triton: "python",
        py: "python",
        js: "javascript",
        ts: "typescript",
        sh: "bash",
        html: "xml",
        yml: "yaml",
        "c++": "cpp",
      };
      const requested = (language || "text").toLowerCase();
      const lang = aliases[requested] || requested;
      let content = escape(source),
        label = "text";
      const highlighter = root.hljs;
      if (
        highlighter &&
        /^[a-z0-9_+-]{1,30}$/.test(lang) &&
        highlighter.getLanguage(lang)
      ) {
        label = lang;
        if (source.length <= 40000)
          try {
            content = highlighter.highlight(source, {
              language: lang,
              ignoreIllegals: true,
            }).value;
          } catch {}
      }
      return (
        '<pre class="markdown-codeblock" data-language="' +
        label +
        '"><code class="hljs">' +
        content +
        "</code></pre>"
      );
    },
  });
  md.disable("image");
  const originalValidate = md.validateLink.bind(md);
  md.validateLink = (url) =>
    /^(https?:|mailto:|#)/i.test(url) && originalValidate(url);
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    tokens[i].attrSet("target", "_blank");
    tokens[i].attrSet("rel", "noopener noreferrer");
    return defaultLinkOpen(tokens, i, options, env, self);
  };
  md.core.ruler.after("inline", "taskspace_todos", (state) => {
    state.env.todos = [];
    state.tokens.forEach((token, i) => {
      if (
        token.type !== "inline" ||
        state.tokens[i - 1]?.type !== "paragraph_open" ||
        state.tokens[i - 2]?.type !== "list_item_open" ||
        !/^\[([ xX])\]\s+/.test(token.content) ||
        !token.map
      )
        return;
      const first = token.children?.[0],
        match =
          first?.type === "text" && first.content.match(/^\[([ xX])\]\s+/);
      if (!match) return;
      const line = token.map[0],
        checked = match[1].toLowerCase() === "x";
      first.content = first.content.slice(match[0].length);
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input class="note-todo-check" type="checkbox" data-note-line="${line}" aria-label="完成备注清单第 ${state.env.todos.length + 1} 项" ${checked ? "checked" : ""}>`;
      token.children.unshift(checkbox);
      state.tokens[i - 2].attrJoin("class", "note-todo-item");
      state.env.todos.push({ line, checked });
    });
  });
  function parse(text) {
    const env = {};
    const html = md.render(typeof text === "string" ? text : "", env),
      todos = env.todos || [];
    return {
      html,
      todos,
      total: todos.length,
      done: todos.filter((t) => t.checked).length,
    };
  }
  function toggle(text, line, checked) {
    if (!parse(text).todos.some((t) => t.line === line))
      throw Error("清单项已改变，请刷新预览。");
    const lines = text.split("\n");
    lines[line] = lines[line].replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
    return lines.join("\n");
  }
  function statusFor(text, status, interaction = false) {
    const result = parse(text);
    if (!result.total) return status;
    return result.done === result.total
      ? "已完成"
      : status === "已完成" || interaction
        ? "进行中"
        : status;
  }
  function resetTodos(text) {
    let value = text;
    for (const t of parse(text).todos)
      if (t.checked) value = toggle(value, t.line, false);
    return value;
  }
  const api = { parse, toggle, statusFor, resetTodos };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Notes = api;
})(typeof window !== "undefined" ? window : globalThis);
