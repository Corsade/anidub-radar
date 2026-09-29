// Apply before the stylesheet paints to avoid flashing the wrong theme.
(() => {
  const key = 'anidub:theme:v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try { const saved = localStorage.getItem(key); if (saved === 'dark' || saved === 'light') preference = saved; } catch { /* Storage is optional. */ }
  function apply() {
    const dark = preference ? preference === 'dark' : system.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const button = document.getElementById('theme-toggle');
    if (button) { button.hidden = false; button.setAttribute('aria-pressed', String(dark)); }
  }
  apply();
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    button.addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch { /* Theme still works for this page. */ }
      apply();
    });
    apply();
  });
})();
