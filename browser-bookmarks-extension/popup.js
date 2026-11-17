const $ = (id) => document.getElementById(id);
async function message(value) {
  const r = await chrome.runtime.sendMessage(value);
  if (r?.ok === false) throw Error(r.message);
  return r;
}
async function run(fn) {
  $("sync").disabled = $("auto").disabled = true;
  try {
    await fn();
  } catch (e) {
    $("status").textContent = e.message;
  } finally {
    $("sync").disabled = $("auto").disabled = false;
  }
}
message({ type: "preferences" })
  .then((p) => {
    $("name").value = p.profileName;
    $("auto").checked = p.autoSync;
  })
  .catch((e) => ($("status").textContent = e.message));
async function settings() {
  await message({
    type: "settings",
    profileName: $("name").value,
    autoSync: $("auto").checked,
  });
  $("status").textContent = $("auto").checked
    ? "自动同步已开启。"
    : "自动同步已关闭，可手动立即同步。";
}
$("name").onchange = () => run(settings);
$("auto").onchange = () => run(settings);
$("sync").onclick = () =>
  run(async () => {
    await settings();
    const r = await message({ type: "sync-now" });
    $("status").textContent = "已发送 " + r.count + " 条书签。请在工作站查看。";
  });
$("open").onclick = () => run(() => message({ type: "open" }));
