(() => {
  const preference = matchMedia('(prefers-color-scheme: dark)');
  let selected;
  try { selected = localStorage.getItem('smak-theme'); } catch {}
  const root = document.documentElement;

  function apply(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('.theme-switch')?.setAttribute('aria-pressed', String(dark));
  }

  function sync() {
    apply(selected === 'dark' || (selected !== 'light' && preference.matches));
  }

  sync();
  preference.addEventListener('change', sync);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('.theme-switch');
    if (!button) return;
    button.hidden = false;
    sync();
    button.addEventListener('click', () => {
      selected = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('smak-theme', selected); } catch {}
      sync();
    });
  });
})();
