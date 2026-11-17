/* Report completed work and actual GitHub request stages; never simulate transfer percentages. */
(() => {
  const panel = document.getElementById("github-upload-progress"),
    title = document.getElementById("upload-title"),
    detail = document.getElementById("upload-detail"),
    bar = document.getElementById("upload-bar"),
    count = document.getElementById("upload-count");
  let active = false,
    failed = false,
    writes = 0,
    total = 0,
    generation = 0;
  function stage(text) {
    if (!active) return;
    detail.textContent = text;
    bar.removeAttribute("value");
  }
  window.GitHubUpload = {
    begin(text) {
      generation++;
      active = true;
      failed = false;
      writes = 0;
      total = 0;
      panel.hidden = false;
      panel.dataset.state = "active";
      title.textContent = text;
      count.textContent = "";
      stage("正在检查连接与远端版本…");
    },
    files(n) {
      if (!active) return;
      total = n;
      count.textContent = "共 " + n + " 个文件";
    },
    checked(n, path) {
      if (!active) return;
      count.textContent = "已检查 " + n + " / " + total + " 个文件";
      stage("检查：" + path);
      bar.max = total || 1;
      bar.value = n;
    },
    request(url, method) {
      if (!active || method === "GET") return;
      const path = new URL(url).pathname;
      stage(
        path.includes("/git/trees")
          ? "正在准备文件内容…"
          : path.includes("/git/commits")
            ? "正在创建 GitHub 提交…"
            : path.includes("/git/refs/")
              ? "正在更新远端分支…"
              : method === "DELETE"
                ? "正在删除远端文件…"
                : "正在上传文件内容…",
      );
    },
    ack(method) {
      if (active && method !== "GET") writes++;
    },
    fail(text) {
      if (!active) return;
      failed = true;
      active = false;
      panel.dataset.state = "error";
      title.textContent = "上传未完成";
      detail.textContent = text;
      bar.removeAttribute("value");
    },
    finish() {
      if (!active || failed) return;
      active = false;
      panel.dataset.state = "success";
      title.textContent = writes ? "上传完成" : "检查完成，无需上传";
      detail.textContent = writes
        ? "GitHub 已确认本次写入。"
        : "远端已是当前内容，或本次操作未写入文件。";
      if (total) count.textContent = total + " 个文件处理完成";
      bar.max = 1;
      bar.value = 1;
      const id = generation;
      setTimeout(() => {
        if (generation === id && !active) panel.hidden = true;
      }, 5000);
    },
    get active() {
      return active;
    },
  };
  document.getElementById("upload-close").onclick = () => {
    panel.hidden = true;
  };
})();
