(() => {
  const id = crypto.randomUUID(),
    origin = location.origin,
    channel = "workstation-bookmarks-extension-v1";
  function post(message) {
    window.postMessage({ ...message, channel, bridgeId: id }, origin);
  }
  async function request(type) {
    try {
      const result = await chrome.runtime.sendMessage({ type });
      if (result?.ok === false)
        post({ type: "error", message: result.message });
    } catch (e) {
      post({ type: "error", message: "扩展连接已失效，请刷新工作站。" });
    }
  }
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (
      e.source !== window ||
      e.origin !== origin ||
      m?.channel !== "workstation-bookmarks-page-v1" ||
      m.bridgeId !== id
    )
      return;
    if (m.type === "ready") request("page-ready");
    else if (m.type === "read-now") request("read-now");
  });
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (
      sender.id !== chrome.runtime.id ||
      !["state", "snapshot", "error"].includes(m?.type)
    )
      return;
    post(m);
  });
  post({ type: "hello" });
})();
