/* Per-root-project storage, with atomic commits and per-file optimistic locking. */
(function (root) {
  "use strict";
  const empty = () => ({ projects: [], tasks: [], schedules: [], reminders: [] });
  const stable = (data) =>
    JSON.stringify(
      Object.fromEntries(
        ["projects", "tasks", "schedules", "reminders"].map((k) => [
          k,
          [...(data[k] || [])].sort((a, b) => a.id.localeCompare(b.id)),
        ]),
      ),
    );
  function split(data) {
    const groups = new Map();
    const group = (key) => {
      if (!groups.has(key)) groups.set(key, empty());
      return groups.get(key);
    };
    const roots = new Map(data.projects.map((p) => [p.id, p.parentId || p.id]));
    for (const p of data.projects) group(roots.get(p.id)).projects.push(p);
    for (const t of data.tasks)
      group(roots.get(t.project) || null).tasks.push(t);
    for (const s of data.schedules || [])
      group(roots.get(s.template.project) || null).schedules.push(s);
    for (const r of data.reminders || []) group("@reminders").reminders.push(r);
    return groups;
  }
  function create({ request, baseUrl, config, validate, encode, decode }) {
    let observed = null;
    const directory = () => config().path.replace(/\.json$/, ".projects");
    const contents = (path) =>
      baseUrl() +
      "/contents/" +
      path.split("/").map(encodeURIComponent).join("/");
    const get = (path, ref) =>
      request(contents(path) + "?ref=" + encodeURIComponent(ref), {
        missingOK: true,
      });
    const filename = (key) =>
      key === "@reminders" ? "reminders.json" : key === null ? "unassigned.json" : "project-" + key + ".json";
    async function inspect(ref) {
      const dir = await get(directory(), ref);
      const files = new Map();
      let legacy = null;
      if (dir) {
        if (!Array.isArray(dir) || dir.length >= 1000)
          throw Error("项目目录异常或达到 GitHub 目录上限，请检查数据。");
        const marker = dir.find((f) => f.name === "_storage.json");
        if (!marker)
          throw Error("项目目录缺少存储标记，已停止读取以保护数据。");
        const entries = dir.filter((f) =>
          /^(project-[a-zA-Z0-9_-]{1,100}|unassigned|reminders)\.json$/.test(f.name),
        );
        // Read every file at the same commit, never a mixture of branch versions.
        for (const entry of entries) {
          const file = await get(entry.path, ref);
          if (!file || file.encoding !== "base64" || file.size > 900000)
            throw Error("项目文件无法读取或超过 900 KB。");
          const data = validate(decode(file.content));
          const partitions = split(data);
          if (
            [...partitions.keys()].some((key) => filename(key) !== entry.name)
          )
            throw Error("项目文件中存在跨项目数据，请检查：" + entry.name);
          files.set(entry.name, { sha: file.sha, data });
        }
      } else {
        legacy = await get(config().path, ref);
        if (legacy && (legacy.encoding !== "base64" || legacy.size > 900000))
          throw Error("旧数据文件无法读取或超过 900 KB。");
      }
      let data = empty();
      if (legacy) data = validate(decode(legacy.content));
      else
        for (const file of files.values())
          for (const k of Object.keys(data)) data[k].push(...(file.data[k] || []));
      data = validate(JSON.parse(stable(data)));
      return {
        files,
        legacy,
        initialized: !!dir,
        data,
        sha:
          legacy?.sha ||
          "projects:" +
            JSON.stringify([...files].map(([name, f]) => [name, f.sha]).sort()),
      };
    }
    async function head() {
      return (
        await request(
          baseUrl() +
            "/git/ref/heads/" +
            config().branch.split("/").map(encodeURIComponent).join("/"),
        )
      ).object.sha;
    }
    async function read() {
      observed = await inspect(await head());
      if (!observed.initialized && !observed.legacy) return null;
      return { sha: observed.sha, content: encode(observed.data) };
    }
    async function write(payload) {
      const target = validate(decode(payload.content));
      const expected = observed;
      if (
        !expected ||
        (payload.sha || null) !==
          (expected.initialized || expected.legacy ? expected.sha : null)
      )
        throw Error("同步版本已变化，请重新检查。");
      const desired = split(target),
        changes = new Map();
      for (const [key, data] of desired) {
        const name = filename(key),
          old = expected.files.get(name);
        if (!old || stable(old.data) !== stable(data)) changes.set(name, data);
      }
      // Keep an empty tombstone, so deletion is represented without a shared index.
      for (const name of expected.files.keys())
        if (
          ![...desired.keys()].some((k) => filename(k) === name) &&
          stable(expected.files.get(name).data) !== stable(empty())
        )
          changes.set(name, empty());
      for (let attempt = 0; attempt < 4; attempt++) {
        const parent = await head(),
          current = await inspect(parent);
        if (
          current.initialized !== expected.initialized ||
          current.legacy?.sha !== expected.legacy?.sha
        )
          throw Error("存储结构或旧数据已变化，请刷新后合并。");
        for (const name of changes.keys())
          if (current.files.get(name)?.sha !== expected.files.get(name)?.sha)
            throw Error(
              "同一项目的远端版本有更新，已阻止覆盖，请重新检查并合并。",
            );
        const tree = [];
        for (const [name, data] of changes) {
          const content = JSON.stringify(
            { schemaVersion: 3, updatedAt: new Date().toISOString(), ...data },
            null,
            2,
          );
          if (new TextEncoder().encode(content).length > 900000)
            throw Error("单个项目超过 900 KB，请拆分一级项目。");
          tree.push({
            path: directory() + "/" + name,
            mode: "100644",
            type: "blob",
            content,
          });
        }
        if (!current.initialized)
          tree.push({
            path: directory() + "/_storage.json",
            mode: "100644",
            type: "blob",
            content: JSON.stringify({
              schemaVersion: 3,
              layout: "root-projects",
              legacyPath: config().path,
            }),
          });
        if (!tree.length) {
          observed = current;
          return { content: { sha: current.sha }, data: current.data };
        }
        const commit = await request(baseUrl() + "/git/commits/" + parent);
        const nextTree = await request(baseUrl() + "/git/trees", {
          method: "POST",
          body: JSON.stringify({ base_tree: commit.tree.sha, tree }),
        });
        const nextCommit = await request(baseUrl() + "/git/commits", {
          method: "POST",
          body: JSON.stringify({
            message: payload.message || "Save Taskspace projects",
            tree: nextTree.sha,
            parents: [parent],
          }),
        });
        try {
          await request(
            baseUrl() +
              "/git/refs/heads/" +
              config().branch.split("/").map(encodeURIComponent).join("/"),
            {
              method: "PATCH",
              body: JSON.stringify({ sha: nextCommit.sha, force: false }),
            },
          );
        } catch (error) {
          if ((await head()) !== parent) continue;
          throw error;
        }
        // Inspect our committed tree. Concurrent unrelated updates will be seen on the next check.
        observed = await inspect(nextCommit.sha);
        return { content: { sha: observed.sha }, data: observed.data };
      }
      throw Error("仓库正在频繁更新，请稍后重试；本地数据已保留。");
    }
    return { read, write };
  }
  root.ProjectStore = { create, split, stable };
  if (typeof module !== "undefined") module.exports = root.ProjectStore;
})(typeof window !== "undefined" ? window : globalThis);
