'use strict';

window.smakApi = Promise.resolve().then(() => {
  const config = window.SMAKHUB_CONFIG;
  return window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
});
// Pages that only display public HTML can remain usable during a connection failure.
window.smakApi.catch(() => {});
window.smakRecipeHref = slug => '/recipes/' + encodeURIComponent(slug);
window.smakImage = path => {
  if (/^\/?images\/recipes\/[\w-]+\.webp$/.test(path || '')) return '/' + path.replace(/^\//, '');
  try {
    const url = new URL(path);
    if (url.origin === window.SMAKHUB_CONFIG.supabaseUrl && url.pathname.startsWith('/storage/v1/object/public/recipe-photos/')) return url.href;
  } catch { /* A recipe without a photo uses the default image. */ }
  return '/images/hero.webp';
};
