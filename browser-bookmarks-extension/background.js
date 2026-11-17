"use strict";
const APP = "https://mercuryhc.github.io/",
  ORIGIN = new URL(APP).origin;
let timer,
  importing = false,
  chain = Promise.resolve();
function isApp(url) {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
}
async function preferences() {
  const p = await chrome.storage.local.get([
    "profileId",
    "profileName",
    "autoSync",
  ]);
  if (!p.profileId) {
    p.profileId = crypto.randomUUID();
    await chrome.storage.local.set({ profileId: p.profileId });
  }
  return {
    profileId: p.profileId,
    profileName:
      p.profileName ||
      (/Edg\//.test(navigator.userAgent) ? "我的 Edge" : "我的 Chrome"),
    autoSync: p.autoSync === true,
  };
}
function serialize(fn) {
  const result = chain.then(fn, fn);
  chain = result.catch(() => {});
  return result;
}
async function send(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    /* Page may have closed or need refresh after installation. */
  }
}
async function targets() {
  return chrome.tabs.query({ url: APP + "*" });
}
async function state(tabId) {
  const p = await preferences();
  await send(tabId, { type: "state", autoSync: p.autoSync });
  return p;
}
async function snapshot(tabIds) {
  const p = await preferences(),
    tree = await chrome.bookmarks.getTree();
  const raw = JSON.stringify(tree),
    hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(raw + p.profileName),
    );
  const revision = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const folders = [],
    items = [];
  let visits = 0;
  function walk(nodes, parent = "", depth = 0) {
    if (depth > 100) throw Error("书签目录超过100层。");
    for (const n of nodes) {
      if (++visits > 90000) throw Error("书签树过大。");
      if (n.url) {
        try {
          const u = new URL(n.url);
          if (
            !["http:", "https:"].includes(u.protocol) ||
            u.username ||
            u.password
          )
            continue;
          items.push({
            id: n.id,
            title: n.title || u.hostname,
            url: u.href,
            folder: parent,
            added: Math.floor((n.dateAdded || 0) / 1000),
          });
        } catch {}
      } else {
        const id = !n.title && !parent ? parent : n.id;
        if (id !== parent)
          folders.push({ id, title: n.title || "未命名目录", parent });
        walk(n.children || [], id, depth + 1);
      }
    }
  }
  walk(tree);
  if (items.length > 30000 || folders.length > 30000)
    throw Error("单个浏览器来源最多支持30000条书签和目录。");
  const source = {
    id: "extension-" + p.profileId,
    name: p.profileName,
    browser: /Edg\//.test(navigator.userAgent) ? "Edge" : "Chrome",
    mode: "extension",
    revision,
    updatedAt: new Date().toISOString(),
    folders,
    items,
  };
  for (const id of tabIds) await send(id, { type: "snapshot", source });
  return items.length;
}
async function broadcast(sync = false) {
  const tabs = await targets();
  for (const tab of tabs) await state(tab.id);
  if (sync && tabs.length) {
    try {
      await snapshot(tabs.map((t) => t.id));
    } catch (e) {
      for (const t of tabs)
        await send(t.id, { type: "error", message: e.message });
    }
  }
  return tabs.length;
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const page = !!sender.tab;
  if (page && (!isApp(sender.tab.url) || sender.frameId !== 0)) return;
  if (!page && !String(sender.url || "").startsWith(chrome.runtime.getURL("")))
    return;
  const allowed = page
    ? ["page-ready", "read-now"]
    : ["settings", "preferences", "sync-now", "open"];
  if (!allowed.includes(m?.type)) return;
  serialize(async () => {
    if (m.type === "preferences") return preferences();
    if (m.type === "settings") {
      await chrome.storage.local.set({
        autoSync: m.autoSync === true,
        profileName:
          String(m.profileName || "我的浏览器")
            .trim()
            .slice(0, 100) || "我的浏览器",
      });
      await broadcast(m.autoSync === true);
      return { ok: true };
    }
    if (m.type === "page-ready") {
      const p = await state(sender.tab.id);
      if (p.autoSync) await snapshot([sender.tab.id]);
      return { ok: true };
    }
    if (m.type === "read-now") {
      await state(sender.tab.id);
      return { ok: true, count: await snapshot([sender.tab.id]) };
    }
    if (m.type === "open") {
      await chrome.tabs.create({ url: APP });
      return { ok: true };
    }
    if (m.type === "sync-now") {
      const tabs = await targets();
      if (!tabs.length) {
        await chrome.tabs.create({ url: APP });
        return {
          ok: false,
          message: "已打开工作站。页面加载完成后，请再次点击立即同步。",
        };
      }
      for (const t of tabs) await state(t.id);
      return { ok: true, count: await snapshot(tabs.map((t) => t.id)) };
    }
  }).then(respond, (e) => respond({ ok: false, message: e.message }));
  return true;
});
function changed() {
  if (importing) return;
  clearTimeout(timer);
  timer = setTimeout(
    () =>
      serialize(async () => {
        if ((await preferences()).autoSync) await broadcast(true);
      }),
    600,
  );
}
for (const event of [
  "onCreated",
  "onRemoved",
  "onChanged",
  "onMoved",
  "onChildrenReordered",
])
  chrome.bookmarks[event].addListener(changed);
chrome.bookmarks.onImportBegan.addListener(() => {
  importing = true;
  clearTimeout(timer);
});
chrome.bookmarks.onImportEnded.addListener(() => {
  importing = false;
  changed();
});
