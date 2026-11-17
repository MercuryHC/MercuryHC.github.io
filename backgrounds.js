(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    KEY = "workstation-background-v1",
    presets = {
      default: { name: "默认", paint: "" },
      solid: { name: "静白", paint: "#e6ebf1" },
      mist: {
        name: "薄雾",
        paint: "linear-gradient(125deg,#e6e9f4,#cfdde2 55%,#ece0e5)",
      },
      dawn: {
        name: "日出",
        paint: "linear-gradient(135deg,#efd4c5,#ded2ed 55%,#bcc9e0)",
      },
      ocean: {
        name: "海岸",
        paint: "linear-gradient(135deg,#b4d8d8,#b4c8e3 55%,#dce4ee)",
      },
      forest: {
        name: "森林",
        paint: "linear-gradient(130deg,#b8ccc0,#d8dfc7 60%,#e4e7da)",
      },
      midnight: {
        name: "星夜",
        paint: "linear-gradient(135deg,#27344d,#484e71 55%,#615879)",
      },
    };
  let saved = { kind: "default", scope: "all", version: 2, blur: 0, mask: 25 },
    draft = { ...saved },
    catalog = null,
    galleryPage = 1,
    savedUrl = "",
    draftUrl = "",
    draftBlob = null,
    loading = false,
    syncing = false,
    selection = 0,
    loadCatalogPromise;
  function clean(c) {
    return {
      kind:
        Object.hasOwn(presets, c?.kind) || c?.kind === "image"
          ? c.kind
          : "default",
      scope: c?.version === 2 && c?.scope === "home" ? "home" : "all",
      version: 2,
      blur: Math.min(20, Math.max(0, Number(c?.blur) || 0)),
      mask: Math.min(85, Math.max(0, Number(c?.mask) || 0)),
      title: typeof c?.title === "string" ? c.title.slice(0, 100) : "",
      wallpaper:
        typeof c?.wallpaper === "string" && /^[a-f0-9]{40}$/.test(c.wallpaper)
          ? c.wallpaper
          : "",
    };
  }
  try {
    saved = clean(JSON.parse(localStorage.getItem(KEY)) || saved);
    draft = { ...saved };
  } catch {}
  const layer = document.createElement("div");
  layer.id = "workspace-background";
  layer.setAttribute("aria-hidden", "true");
  const paint = document.createElement("div"),
    mask = document.createElement("div");
  paint.className = "bg-paint";
  mask.className = "bg-mask";
  layer.append(paint, mask);
  document.body.prepend(layer);
  const database = new Promise((resolve, reject) => {
    const r = indexedDB.open("workstation-backgrounds-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("images");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  database.catch(() => {});
  async function imageStore(mode, blob) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("images", mode),
        store = tx.objectStore("images"),
        req =
          mode === "readonly"
            ? store.get("current")
            : blob
              ? store.put(blob, "current")
              : store.delete("current");
      let result;
      req.onsuccess = () => (result = req.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  function message(text, error = false) {
    $("bg-status").textContent = text;
    $("bg-status").style.color = error ? "#ce6575" : "";
  }
  function background(c, url) {
    return c.kind === "image" && url
      ? 'url("' + url + '")'
      : presets[c.kind]?.paint || "";
  }
  function apply() {
    const active =
      saved.kind !== "default" &&
      (saved.scope === "all" ||
        document.body.dataset.workspace === "bookmarks") &&
      (saved.kind !== "image" || savedUrl);
    document.body.dataset.backgroundActive = String(!!active);
    layer.hidden = !active;
    paint.style.background = background(saved, savedUrl);
    paint.style.backgroundSize = "cover";
    paint.style.backgroundPosition = "center";
    paint.style.filter = "blur(" + saved.blur + "px)";
    mask.style.opacity = saved.mask / 100;
  }
  function preview() {
    $("bg-preview").style.background = background(draft, draftUrl || savedUrl);
    $("bg-preview").style.backgroundSize = "cover";
    $("bg-preview").style.backgroundPosition = "center";
    $("bg-preview").style.setProperty("--preview-blur", draft.blur + "px");
    $("bg-preview").style.setProperty("--preview-mask", draft.mask / 100);
    $("bg-blur-value").textContent = draft.blur + "px";
    $("bg-mask-value").textContent = draft.mask + "%";
    $("bg-selected").textContent =
      draft.kind === "image"
        ? draft.title || "图片背景"
        : presets[draft.kind]?.name || "默认背景";
    for (const b of $("bg-presets").children)
      b.setAttribute("aria-pressed", String(b.dataset.kind === draft.kind));
    for (const b of $("bg-gallery").children)
      b.setAttribute("aria-pressed", String(b.dataset.sha === draft.wallpaper));
  }
  function discard() {
    selection++;
    if (draftUrl) URL.revokeObjectURL(draftUrl);
    draftUrl = "";
    draftBlob = null;
    draft = { ...saved };
    loading = false;
    $("bg-apply").disabled = false;
  }
  async function loadCatalog() {
    if (!loadCatalogPromise)
      loadCatalogPromise = fetch("./wallpaper-catalog.json?v=1")
        .then((r) => {
          if (!r.ok) throw Error("背景库索引读取失败。");
          return r.json();
        })
        .then(window.WallpaperLibrary.validate)
        .then((c) => (catalog = c))
        .catch((e) => {
          loadCatalogPromise = null;
          throw e;
        });
    return loadCatalogPromise;
  }
  function gallery() {
    const grid = $("bg-gallery");
    grid.replaceChildren();
    if (!catalog) return;
    const pages = Math.ceil(catalog.items.length / 18);
    $("bg-page").textContent = galleryPage + " / " + pages;
    $("bg-prev").disabled = galleryPage === 1;
    $("bg-next").disabled = galleryPage === pages;
    for (const item of catalog.items.slice(
      (galleryPage - 1) * 18,
      galleryPage * 18,
    )) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bg-wallpaper";
      b.dataset.sha = item.sha;
      b.title =
        "壁纸 " +
        item.title +
        " · " +
        (item.size / 1024 / 1024).toFixed(1) +
        " MiB";
      b.setAttribute("aria-label", "选择壁纸 " + item.title);
      const img = document.createElement("span");
      img.className = "bg-wallpaper-thumb";
      img.style.backgroundImage = 'url("./' + item.thumbnail + '")';
      img.style.backgroundPosition = item.thumbX + "% " + item.thumbY + "%";
      const label = document.createElement("span");
      label.textContent = item.title;
      b.append(img, label);
      b.onclick = () => chooseWallpaper(item);
      grid.append(b);
    }
    preview();
  }
  async function chooseWallpaper(item) {
    const current = ++selection;
    loading = true;
    $("bg-apply").disabled = true;
    message("正在加载壁纸 " + item.title + "…");
    try {
      let blob;
      try {
        blob = await window.WallpaperGitHub?.read(item.sha);
      } catch {
        /* Public source is also available if not synced to the data repository. */
      }
      if (!blob) {
        const r = await fetch(
          window.WallpaperLibrary.sourceUrl(catalog, item),
          { credentials: "omit", redirect: "error" },
        );
        if (!r.ok) throw Error("图片下载失败，请检查网络后重试。");
        blob = await r.blob();
      }
      await verifyImage(blob);
      if (current !== selection) return;
      if (draftUrl) URL.revokeObjectURL(draftUrl);
      draftBlob = blob;
      draftUrl = URL.createObjectURL(blob);
      draft = {
        ...draft,
        kind: "image",
        title: "壁纸 " + item.title,
        wallpaper: item.sha,
      };
      preview();
      message("壁纸已预览，点击「应用背景」保存。");
    } catch (e) {
      if (current === selection) message(e.message, true);
    } finally {
      if (current === selection) {
        loading = false;
        $("bg-apply").disabled = false;
      }
    }
  }
  async function verifyImage(blob) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(blob.type) ||
      blob.size > 20 * 1024 * 1024
    )
      throw Error("请选择 PNG / JPG / WebP 图片，大小不超过20MB。");
    const bitmap = await createImageBitmap(blob);
    try {
      if (
        bitmap.width < 1 ||
        bitmap.height < 1 ||
        bitmap.width * bitmap.height > 100000000
      )
        throw Error("图片尺寸无效或过大。");
    } finally {
      bitmap.close();
    }
  }
  for (const [kind, preset] of Object.entries(presets)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.kind = kind;
    b.title = preset.name;
    b.setAttribute("aria-label", preset.name);
    b.style.background = preset.paint || "var(--app-hover)";
    b.textContent = preset.name;
    b.onclick = () => {
      selection++;
      loading = false;
      $("bg-apply").disabled = false;
      draft = { ...draft, kind, wallpaper: "" };
      preview();
    };
    $("bg-presets").append(b);
  }
  $("background-toggle").onclick = () => {
    discard();
    $("bg-scope").value = draft.scope;
    $("bg-blur").value = draft.blur;
    $("bg-mask").value = draft.mask;
    preview();
    $("background-dialog").showModal();
    loadCatalog()
      .then(gallery)
      .catch((e) => message(e.message, true));
  };
  $("bg-close").onclick = () => {
    discard();
    $("background-dialog").close();
  };
  $("background-dialog").addEventListener("cancel", discard);
  $("bg-prev").onclick = () => {
    galleryPage--;
    gallery();
  };
  $("bg-next").onclick = () => {
    galleryPage++;
    gallery();
  };
  $("bg-scope").onchange = (e) => (draft.scope = e.target.value);
  for (const id of ["blur", "mask"])
    $("bg-" + id).oninput = (e) => {
      draft[id] = Number(e.target.value);
      preview();
    };
  $("bg-upload").onclick = () => $("bg-file").click();
  $("bg-file").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const current = ++selection;
    loading = true;
    $("bg-apply").disabled = true;
    try {
      await verifyImage(file);
      if (current !== selection) return;
      if (draftUrl) URL.revokeObjectURL(draftUrl);
      draftBlob = file;
      draftUrl = URL.createObjectURL(file);
      draft = { ...draft, kind: "image", title: file.name, wallpaper: "" };
      preview();
      message("本地图片已预览，不会自动上传 GitHub。");
    } catch (e) {
      if (current === selection) message(e.message, true);
    } finally {
      if (current === selection) {
        loading = false;
        $("bg-apply").disabled = false;
      }
    }
  };
  $("bg-apply").onclick = async () => {
    if (loading) return;
    $("bg-apply").disabled = true;
    try {
      const next = clean(draft);
      if (next.kind === "image") {
        if (draftBlob) await imageStore("readwrite", draftBlob);
        else if (!savedUrl) throw Error("请先选择图片。");
      }
      localStorage.setItem(KEY, JSON.stringify(next));
      saved = next;
      if (savedUrl && draftBlob) URL.revokeObjectURL(savedUrl);
      if (draftBlob) {
        savedUrl = draftUrl;
        draftUrl = "";
        draftBlob = null;
      }
      apply();
      $("background-dialog").close();
    } catch (e) {
      message("背景未保存：" + e.message, true);
    } finally {
      $("bg-apply").disabled = false;
    }
  };
  $("bg-reset").onclick = async () => {
    try {
      localStorage.removeItem(KEY);
      saved = { kind: "default", scope: "all", version: 2, blur: 0, mask: 25 };
      discard();
      if (savedUrl) URL.revokeObjectURL(savedUrl);
      savedUrl = "";
      apply();
      await imageStore("readwrite");
      $("background-dialog").close();
    } catch (e) {
      message(e.message, true);
    }
  };
  $("bg-sync").onclick = async () => {
    if (syncing) return;
    syncing = true;
    $("bg-sync").disabled = true;
    $("bg-progress").hidden = false;
    try {
      const c = await loadCatalog(),
        result = await window.WallpaperGitHub.sync(c, (p) => {
          $("bg-progress").max = p.total;
          $("bg-progress").value = p.done;
          message(
            p.phase +
              " · " +
              p.done +
              "/" +
              p.total +
              " · 本次上传 " +
              p.uploaded +
              " 张",
          );
        });
      message(
        "背景库已同步到 " +
          window.WallpaperGitHub.context().repository +
          "/backgrounds/wallpaper · 上传 " +
          result.uploaded +
          " 张，其余保持不变。",
      );
    } catch (e) {
      message("同步未完成：" + e.message, true);
    } finally {
      syncing = false;
      $("bg-sync").disabled = false;
      $("bg-progress").hidden = true;
    }
  };
  window.addEventListener("workstation-app-changed", apply);
  apply();
  if (saved.kind === "image")
    imageStore("readonly")
      .then((blob) => {
        if (blob) {
          savedUrl = URL.createObjectURL(blob);
          apply();
        } else message("本机背景图片已被清理，请重新选择。", true);
      })
      .catch((e) => message("背景图片无法读取：" + e.message, true));
})();
