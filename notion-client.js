/* Official Notion API only. A connection is scoped to pages shared with that integration. */
(function (root) {
  const id = (x) =>
    typeof x === "string" &&
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(
      x,
    );
  const title = (p) =>
    Object.values(p.properties || {})
      .find((v) => v.type === "title")
      ?.title?.map((t) => t.plain_text || t.text?.content || "")
      .join("") || "未命名页面";
  function create(transport = fetch) {
    let token = "",
      generation = 0;
    async function request(path, body) {
      if (!token) throw Error("请先连接 Notion。");
      const version = generation,
        controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 30000);
      try {
        let response;
        try {
          response = await transport("https://api.notion.com/v1/" + path, {
            method: body ? "POST" : "GET",
            headers: {
              Authorization: "Bearer " + token,
              "Notion-Version": "2026-03-11",
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
          });
        } catch (e) {
          throw Error(
            e.name === "AbortError"
              ? "Notion 请求超时，请重试。"
              : "无法连接 Notion API，请检查网络和浏览器跨域限制。",
          );
        }
        if (version !== generation)
          throw Error("Notion 连接已切换，已忽略旧请求。");
        if (!response.ok) {
          const messages = {
            401: "Notion Token 无效或已过期。",
            403: "此连接没有读取页面的权限。",
            404: "页面不存在，或未共享给此 Notion 连接。",
            429: "Notion 请求过于频繁，请稍后重试。",
          };
          throw Error(
            messages[response.status] ||
              "Notion 请求失败（" + response.status + "）。",
          );
        }
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      async connect(value) {
        generation++;
        token = value.trim();
        if (!token) throw Error("请输入 Notion Integration Token。");
        try {
          return await request("users/me");
        } catch (e) {
          token = "";
          throw e;
        }
      },
      disconnect() {
        token = "";
        generation++;
      },
      get connected() {
        return !!token;
      },
      async list() {
        const result = [],
          seen = new Set();
        let cursor;
        do {
          const response = await request("search", {
            filter: { property: "object", value: "page" },
            page_size: 100,
            sort: { direction: "descending", timestamp: "last_edited_time" },
            ...(cursor ? { start_cursor: cursor } : {}),
          });
          for (const p of response.results || []) {
            if (p.object !== "page" || !id(p.id) || p.archived || p.in_trash)
              continue;
            result.push({
              id: p.id,
              title: title(p),
              parent:
                p.parent?.page_id ||
                p.parent?.database_id ||
                p.parent?.data_source_id ||
                "",
              url: p.url || "",
              icon: p.icon?.type === "emoji" ? p.icon.emoji : "▤",
              edited: p.last_edited_time,
            });
          }
          if (result.length > 2000)
            throw Error("可访问页面超过2000个，请缩小 Notion 连接的授权范围。");
          cursor = response.has_more ? response.next_cursor : null;
          if (cursor) {
            if (seen.has(cursor)) throw Error("Notion 分页异常，请重试。");
            seen.add(cursor);
          }
        } while (cursor);
        return result;
      },
      async read(pageId) {
        if (!id(pageId)) throw Error("Notion 页面 ID 无效。");
        const r = await request(
          "pages/" +
            encodeURIComponent(pageId) +
            "/markdown?markdown_version=v2",
        );
        if (typeof r.markdown !== "string")
          throw Error("Notion 返回了不完整的 Markdown 内容。");
        if (r.markdown.length > 2000000)
          throw Error("此页面过大，请在 Notion 中打开。");
        return {
          markdown: r.markdown,
          partial: !!r.truncated || !!r.unknown_block_ids?.length,
        };
      },
    };
  }
  root.NotionClient = { create, id, title };
  if (typeof module !== "undefined") module.exports = root.NotionClient;
})(typeof window !== "undefined" ? window : globalThis);
