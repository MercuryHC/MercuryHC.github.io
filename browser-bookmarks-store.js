(function (root) {
  function create(factory = indexedDB) {
    const ready = new Promise((resolve, reject) => {
      const r = factory.open("workstation-browser-bookmarks-v1", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("sources", { keyPath: "id" });
        r.result.createObjectStore("history");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    async function load() {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const r = db.transaction("sources").objectStore("sources").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    async function change(records = [], remove = []) {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["sources", "history"], "readwrite"),
          store = tx.objectStore("sources"),
          history = tx.objectStore("history"),
          ids = [...new Set([...records.map((r) => r.id), ...remove])],
          previous = [];
        let remaining = ids.length;
        if (!remaining) {
          resolve();
          return;
        }
        for (const id of ids) {
          const r = store.get(id);
          r.onsuccess = () => {
            if (r.result) previous.push(r.result);
            if (!--remaining) {
              history.put({ ids, previous }, "undo");
              remove.forEach((id) => store.delete(id));
              records.forEach((record) => store.put(record));
            }
          };
        }
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () =>
          reject(tx.error || Error("保存书签失败。"));
      });
    }
    async function undo() {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["sources", "history"], "readwrite"),
          history = tx.objectStore("history"),
          store = tx.objectStore("sources"),
          r = history.get("undo");
        r.onsuccess = () => {
          if (!r.result) return;
          r.result.ids.forEach((id) => store.delete(id));
          r.result.previous.forEach((s) => store.put(s));
          history.delete("undo");
        };
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    }
    async function replace(records) {
      const db = await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["sources", "history"], "readwrite"), store = tx.objectStore("sources"), r = store.getAll();
        r.onsuccess = () => {
          tx.objectStore("history").put({ids:[...new Set([...r.result.map(x=>x.id), ...records.map(x=>x.id)])], previous:r.result}, "undo");
          store.clear(); records.forEach(x=>store.put(x));
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || Error("书签保存失败。"));
      });
    }
    return {
      replace,
      load,
      save: (records) => change(records),
      remove: (id) => change([], [id]),
      undo,
    };
  }
  root.BrowserBookmarksStore = { create };
  if (typeof module !== "undefined")
    module.exports = root.BrowserBookmarksStore;
})(typeof window !== "undefined" ? window : globalThis);
