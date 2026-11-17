(function (root) {
  "use strict";
  const DIRECTORY = "backgrounds/wallpaper",
    SOURCE = "MercuryHC/wallpaper";
  function validate(input) {
    if (
      input?.schemaVersion !== 1 ||
      input.sourceRepository !== SOURCE ||
      !/^[a-f0-9]{40}$/.test(input.sourceRef) ||
      !Array.isArray(input.items) ||
      input.items.length > 1000
    )
      throw Error("背景库索引无效。");
    const paths = new Set();
    return {
      ...input,
      items: input.items.map((x, index) => {
        if (
          typeof x.path !== "string" ||
          !/^\d+\.png$/.test(x.path) ||
          !/^[a-f0-9]{40}$/.test(x.sha) ||
          paths.has(x.path) ||
          x.size > 20 * 1024 * 1024
        )
          throw Error("背景文件路径、大小或校验值无效。");
        paths.add(x.path);
        return {
          id: x.sha,
          title: x.title,
          path: x.path,
          sha: x.sha,
          size: x.size,
          thumbnail:
            "wallpaper-sheets/" + (Math.floor(index / 18) + 1) + ".webp",
          thumbX: (index % 6) * 20,
          thumbY: Math.floor((index % 18) / 6) * 50,
        };
      }),
    };
  }
  const sourceUrl = (catalog, item) =>
    "https://raw.githubusercontent.com/" +
    SOURCE +
    "/" +
    catalog.sourceRef +
    "/" +
    encodeURIComponent(item.path);
  function encode(bytes) {
    let result = "";
    for (let i = 0; i < bytes.length; i += 32768)
      result += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(result);
  }
  async function hash(bytes) {
    const prefix = new TextEncoder().encode("blob " + bytes.length + "\0"),
      all = new Uint8Array(prefix.length + bytes.length);
    all.set(prefix);
    all.set(bytes, prefix.length);
    const value = await crypto.subtle.digest("SHA-1", all);
    return Array.from(new Uint8Array(value), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  }
  function create({
    request,
    branch,
    publicFetch = fetch,
    resume = { has: () => false, save: () => {} },
  }) {
    const ref =
        "/git/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/"),
      writeRef =
        "/git/refs/heads/" +
        branch.split("/").map(encodeURIComponent).join("/");
    async function sync(input, progress = () => {}) {
      const catalog = validate(input),
        repo = await request("");
      if (!repo.private) throw Error("背景库仅同步到当前连接的私有数据仓库。");
      const listed = await request(
        "/contents/" +
          DIRECTORY +
          "/originals?ref=" +
          encodeURIComponent(branch),
        { missingOK: true },
      );
      if (listed && !Array.isArray(listed))
        throw Error("背景目录被同名文件占用。");
      const remote = new Map((listed || []).map((x) => [x.name, x.sha])),
        changed = catalog.items.filter((x) => remote.get(x.path) !== x.sha),
        entries = [];
      let done = catalog.items.length - changed.length,
        uploaded = 0;
      progress({
        total: catalog.items.length,
        done,
        uploaded,
        phase: "检查完成",
      });
      // Upload immutable Git blobs first. The branch changes once, after all uploads finish.
      for (const item of changed) {
        if (resume.has(item.sha)) {
          entries.push({
            path: DIRECTORY + "/originals/" + item.path,
            mode: "100644",
            type: "blob",
            sha: item.sha,
          });
          done++;
          progress({
            total: catalog.items.length,
            done,
            uploaded,
            phase: "继续 " + item.path,
          });
          continue;
        }
        progress({
          total: catalog.items.length,
          done,
          uploaded,
          phase: "上传 " + item.path,
        });
        const response = await publicFetch(sourceUrl(catalog, item), {
          credentials: "omit",
          redirect: "error",
        });
        if (!response.ok) throw Error("原图库下载失败：" + item.path);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== item.size || (await hash(bytes)) !== item.sha)
          throw Error("原图校验失败：" + item.path);
        const blob = await request("/git/blobs", {
          method: "POST",
          timeoutMs: 90000,
          body: JSON.stringify({ encoding: "base64", content: encode(bytes) }),
        });
        if (blob.sha !== item.sha) throw Error("GitHub 图片校验不一致。");
        resume.save(item.sha);
        entries.push({
          path: DIRECTORY + "/originals/" + item.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
        done++;
        uploaded++;
        progress({
          total: catalog.items.length,
          done,
          uploaded,
          phase: "已上传 " + item.path,
        });
      }
      const manifest = {
        ...catalog,
        syncedAt: new Date().toISOString(),
        directory: DIRECTORY,
        items: catalog.items.map((i) => ({
          ...i,
          storedPath: DIRECTORY + "/originals/" + i.path,
        })),
      };
      entries.push({
        path: DIRECTORY + "/index.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(manifest, null, 2),
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        const head = await request(ref),
          commit = await request("/git/commits/" + head.object.sha),
          tree = await request("/git/trees", {
            method: "POST",
            body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }),
          }),
          next = await request("/git/commits", {
            method: "POST",
            body: JSON.stringify({
              message: "Sync personal workstation wallpaper library",
              tree: tree.sha,
              parents: [head.object.sha],
            }),
          });
        try {
          await request(writeRef, {
            method: "PATCH",
            body: JSON.stringify({ sha: next.sha, force: false }),
          });
          progress({
            total: catalog.items.length,
            done,
            uploaded,
            phase: "同步完成",
            commit: next.sha,
          });
          return {
            uploaded,
            unchanged: catalog.items.length - uploaded,
            manifest,
          };
        } catch (e) {
          const latest = await request(ref);
          if (latest.object.sha === head.object.sha || attempt === 2) throw e;
        }
      }
    }
    return { sync };
  }
  root.WallpaperLibrary = { validate, sourceUrl, create, DIRECTORY };
  if (typeof module !== "undefined") module.exports = root.WallpaperLibrary;
})(typeof window !== "undefined" ? window : globalThis);
