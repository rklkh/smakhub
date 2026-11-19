const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))) {
  let html = fs.readFileSync(path.join(root,name),'utf8');
  if (!html.includes('js/backend.js')) html = html.replace('</body>', '  <script src="js/config.js" defer></script>\n  <script src="js/backend.js" defer></script>\n</body>');
  if (name === 'catalog.html' && !html.includes('js/catalog.js')) html = html.replace('</body>','  <script src="js/catalog.js" defer></script>\n</body>');
  if (!html.includes('href="account.html"')) html = html.replaceAll('<li><a href="login.html"', '<li><a href="account.html">Мій акаунт</a></li>\n          <li><a href="login.html"');
  if (name === 'catalog.html' && !html.includes('Усі перелічені')) html = html.replace('placeholder="яйця, борошно, молоко">','placeholder="яйця, борошно, молоко" aria-describedby="ingredient-help">\n            <p class="form-hint" id="ingredient-help">Усі перелічені через кому продукти мають входити до рецепта. Інші інгредієнти також можуть знадобитися.</p>');
  if (['login.html','register.html','contacts.html'].includes(name) && !html.includes('connection-note')) html = html.replace(/(<form class="form"[^>]*>)/,'$1\n        <p class="connection-note">Сервіс перебуває на етапі підключення. Підтвердження результату з’явиться після обробки запиту.</p>');
  fs.writeFileSync(path.join(root,name),html);
}
let account=fs.readFileSync(path.join(root,'template.html'),'utf8');
account=account.replace(/<title>.*?<\/title>/,'<title>Мій акаунт — SmakHub</title>').replace(/<main\b[\s\S]*?<\/main>/,`<main id="main"><div class="container"><h1>Мій акаунт</h1><p id="account-status" role="status">Перевіряємо вхід…</p><p><a href="login.html">Увійти</a> · <a href="register.html">Зареєструватися</a></p><button class="btn" type="button" id="logout" hidden>Вийти з акаунта</button></div></main>`);
fs.writeFileSync(path.join(root,'account.html'),account);
const css=path.join(root,'css/style.css');
if (!fs.readFileSync(css,'utf8').includes('connection-status')) fs.appendFileSync(css,`\n/* Доповнення нової версії 03, створеної з ЛР2. */
[hidden] { display: none !important; }
.connection-status:not(:empty), .connection-note { margin-top: 1rem; padding: 0.8rem; background: var(--color-bg); border-left: 4px solid var(--color-secondary); }
.btn:disabled { opacity: 0.6; cursor: wait; }
.header-inner { flex-wrap: wrap; }
@media (max-width: 540px) { .filters-grid, .card-grid, .category-list { grid-template-columns: minmax(0, 1fr); } }
`);
