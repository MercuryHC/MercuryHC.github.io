/* Vault files remain plain Markdown; hidden configuration and attachments are excluded. */
(function (root) {
  const validPath = (path) =>
    typeof path === "string" &&
    path.endsWith(".md") &&
    !path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p.startsWith(".") ||
          /[\\\x00-\x1f]/.test(p),
      );
  async function scan(dir, prefix = "", out = []) {
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith(".")) continue;
      const path = prefix + name;
      if (handle.kind === "directory") await scan(handle, path + "/", out);
      else if (validPath(path)) {
        out.push({ path, handle });
        if (out.length > 1000)
          throw Error("仓库超过 1000 篇 Markdown，请选择较小的笔记目录。");
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  async function read(handle) {
    const file = await handle.getFile();
    if (file.size > 900000) throw Error("单篇笔记超过 900 KB。");
    return file.text();
  }
  async function write(handle, text, base) {
    if ((await read(handle)) !== base)
      throw Error(
        "Obsidian 或其他程序已修改此文件，请重新读取后合并。网页草稿已保留。",
      );
    const stream = await handle.createWritable();
    try {
      if ((await read(handle)) !== base)
        throw Error("文件在保存前又有变化，已停止覆盖。");
      await stream.write(text);
      await stream.close();
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
  }
  root.ObsidianCore = { validPath, scan, read, write };
  if (typeof module !== "undefined") module.exports = root.ObsidianCore;
})(typeof window !== "undefined" ? window : globalThis);
