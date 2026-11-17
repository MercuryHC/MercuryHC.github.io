/* Compare Git blob IDs locally; remote Markdown is fetched only to preview a conflict. */
(function (root) {
  async function mapLimit(items, limit, fn) {
    const result = new Array(items.length);
    let next = 0,
      error;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length && !error) {
          const index = next++;
          try {
            result[index] = await fn(items[index], index);
          } catch (e) {
            error = e;
          }
        }
      }),
    );
    if (error) throw error;
    return result;
  }
  async function blobSha(text) {
    const body = new TextEncoder().encode(text),
      header = new TextEncoder().encode("blob " + body.length + "\0"),
      buffer = new Uint8Array(header.length + body.length);
    buffer.set(header);
    buffer.set(body, header.length);
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
  }
  function create({
    request,
    baseUrl,
    branch,
    validatePath,
    decode,
    progress,
  }) {
    const ref = branch.split("/").map(encodeURIComponent).join("/");
    const getHead = async () =>
      (await request(baseUrl + "/git/ref/heads/" + ref)).object.sha;
    const getTree = (sha, recursive = false) =>
      request(
        baseUrl + "/git/trees/" + sha + (recursive ? "?recursive=1" : ""),
      );
    function add(map, tree, prefix = "") {
      if (!Array.isArray(tree.tree))
        throw Error("远端目录数据不完整，已停止上传。");
      for (const entry of tree.tree) map.set(prefix + entry.path, entry);
      if (map.size > 200000) throw Error("远端目录过大，请拆分数据仓库。");
    }
    async function inventory(treeSha, prefix) {
      const tree = await getTree(treeSha, true),
        map = new Map();
      if (!tree.truncated) {
        add(map, tree);
        return map;
      }
      // Never treat a truncated response as missing files. Traverse only the vault subtree.
      let sha = treeSha,
        path = "";
      for (const part of prefix.split("/")) {
        const dir = await getTree(sha);
        if (dir.truncated)
          throw Error("远端单层目录被截断，无法安全比较文件。");
        add(map, dir, path);
        const entry = dir.tree.find((e) => e.path === part);
        if (!entry) return map;
        if (entry.type !== "tree")
          throw Error("远端路径不是文件夹：" + path + part);
        sha = entry.sha;
        path += part + "/";
      }
      const target = await getTree(sha, true);
      if (!target.truncated) {
        add(map, target, path);
        return map;
      }
      const queue = [{ sha, path }];
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i],
          dir = await getTree(current.sha);
        if (dir.truncated) throw Error("远端目录被截断，请拆分仓库后重试。");
        add(map, dir, current.path);
        for (const e of dir.tree)
          if (e.type === "tree")
            queue.push({ sha: e.sha, path: current.path + e.path + "/" });
        if (queue.length > 10000) throw Error("远端子目录过多，请拆分仓库。");
      }
      return map;
    }
    function ensureFilePath(map, path) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parent = map.get(parts.slice(0, i).join("/"));
        if (parent && parent.type !== "tree")
          throw Error("远端目录与文件冲突：" + parts.slice(0, i).join("/"));
      }
      const entry = map.get(path);
      if (
        entry &&
        (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
      )
        throw Error("远端路径不是普通 Markdown 文件：" + path);
      return entry;
    }
    async function upload(prefix, files, baselines = {}, force = {}) {
      const seen = new Set();
      for (const f of files) {
        validatePath(prefix, f.path);
        if (seen.has(f.path)) throw Error("本地笔记路径重复：" + f.path);
        seen.add(f.path);
        if (
          typeof f.text !== "string" ||
          new TextEncoder().encode(f.text).length > 900000
        )
          throw Error("笔记无效或超过 900 KB：" + f.path);
      }
      progress?.files(files.length);
      progress?.stage?.("正在并行计算本地内容哈希…");
      let hashed = 0;
      const local = await mapLimit(files, 8, async (f) => {
        const sha = await blobSha(f.text);
        progress?.checked(++hashed, f.path);
        return { ...f, sha };
      });
      if (!(await request(baseUrl)).private)
        throw Error("仅允许上传到私有仓库。");
      for (let attempt = 0; attempt < 3; attempt++) {
        progress?.stage?.(
          attempt
            ? "远端分支有更新，正在重新比较差异…"
            : "正在批量读取远端目录并比较 diff…",
        );
        const parent = await getHead(),
          commit = await request(baseUrl + "/git/commits/" + parent),
          remote = await inventory(commit.tree.sha, prefix),
          changes = [],
          saved = {},
          conflicts = [],
          stats = { unchanged: 0, added: 0, modified: 0 };
        for (const f of local) {
          const path = validatePath(prefix, f.path),
            entry = ensureFilePath(remote, path);
          if (entry?.sha === f.sha) {
            saved[f.path] = f.sha;
            stats.unchanged++;
            continue;
          }
          if (
            entry &&
            entry.sha !== baselines[f.path] &&
            entry.sha !== force[f.path]
          ) {
            conflicts.push({
              path: f.path,
              remote: { sha: entry.sha },
              local: f.text,
            });
            continue;
          }
          if (!entry && baselines[f.path] && force[f.path] !== "recreate") {
            conflicts.push({ path: f.path, remote: null, local: f.text });
            continue;
          }
          changes.push({
            path,
            mode: entry?.mode || "100644",
            type: "blob",
            content: f.text,
          });
          saved[f.path] = f.sha;
          if (entry) stats.modified++;
          else stats.added++;
        }
        progress?.diff?.({ ...stats, conflicts: conflicts.length });
        if (conflicts.length) {
          const first = conflicts[0];
          if (first.remote) {
            const file = await request(
              baseUrl +
                "/contents/" +
                validatePath(prefix, first.path)
                  .split("/")
                  .map(encodeURIComponent)
                  .join("/") +
                "?ref=" +
                encodeURIComponent(parent),
            );
            const value = decode(file);
            if (value?.sha !== first.remote.sha)
              throw Error("冲突版本与目录不一致，请重新检查。");
            first.remote = value;
          }
          progress?.fail(conflicts.length + " 个文件有远端冲突；已阻止写入。");
          return { saved: {}, conflicts, stats };
        }
        if (!changes.length) return { saved, conflicts: [], stats };
        const tree = await request(baseUrl + "/git/trees", {
          method: "POST",
          body: JSON.stringify({ base_tree: commit.tree.sha, tree: changes }),
        });
        const next = await request(baseUrl + "/git/commits", {
          method: "POST",
          body: JSON.stringify({
            message:
              "Save Obsidian Markdown diff (" + changes.length + " files)",
            tree: tree.sha,
            parents: [parent],
          }),
        });
        try {
          await request(baseUrl + "/git/refs/heads/" + ref, {
            method: "PATCH",
            body: JSON.stringify({ sha: next.sha, force: false }),
          });
        } catch (e) {
          if ((await getHead()) !== parent) continue;
          throw e;
        }
        // The blob hashes were computed from exactly the text submitted above; no N follow-up GETs.
        return { saved, conflicts: [], stats };
      }
      throw Error("仓库持续出现新提交，请稍后重试；本地文件未被修改。");
    }
    return { upload };
  }
  root.VaultSync = { create, blobSha, mapLimit };
  if (typeof module !== "undefined") module.exports = root.VaultSync;
})(typeof window !== "undefined" ? window : globalThis);
