/* The selected theme is local to this browser and shared by all workspaces. */
(() => {
  const key = "workstation-theme",
    root = document.documentElement,
    button = document.getElementById("theme-toggle");
  const icons = {
    light:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    dark: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
  };
  function apply(theme) {
    theme = theme === "dark" ? "dark" : "light";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      icons[theme] +
      "</svg>";
    const label = theme === "dark" ? "切换为明亮主题" : "切换为黑暗主题";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(theme === "dark"));
  }
  apply(root.dataset.theme);
  button.onclick = () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  };
  window.addEventListener("storage", (e) => {
    if (e.key === key) apply(e.newValue);
  });
})();
