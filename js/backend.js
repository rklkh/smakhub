(function () {
  'use strict';
  var config = window.SMAKHUB_CONFIG || {};
  var page = location.pathname.split('/').pop();
  var htmlSuffix = page.endsWith('.html') ? '.html' : '';
  var pageName = page.replace(/\.html$/, '');
  var accountURL = new URL('account' + htmlSuffix, location.href);
  var form = document.querySelector('form[method="post"]');
  var account = document.getElementById('account-status');
  if (!form && !account) return;
  var status = account || document.createElement('p');
  status.className = 'connection-status';
  status.setAttribute('role', 'status');
  if (form) form.append(status);
  var clientPromise;
  function client() {
    if (!clientPromise) clientPromise = new Promise(function (resolve, reject) {
      if (!config.supabaseUrl || !config.supabasePublishableKey) { reject(new Error('Сервіс акаунтів ще не підключено. Спробуйте пізніше.')); return; }
      if (!/^https:\/\//.test(config.supabaseUrl) || config.supabasePublishableKey.startsWith('sb_secret_')) { reject(new Error('Сервіс тимчасово недоступний.')); return; }
      function ready() {
        if (!window.supabase) { reject(new Error('Не вдалося завантажити сервіс входу. Перевірте з’єднання.')); return; }
        resolve(window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey));
      }
      if (window.supabase) { ready(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.js';
      script.onload = ready;
      script.onerror = function () { reject(new Error('Не вдалося завантажити сервіс входу.')); };
      document.head.append(script);
    });
    return clientPromise;
  }
  function friendly(error) {
    if (error && error.message === 'Invalid login credentials') return 'Неправильна пошта або пароль.';
    if (error && error.message === 'Email not confirmed') return 'Спочатку підтвердьте адресу через лист.';
    if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit')) return 'Забагато спроб. Спробуйте пізніше.';
    return error && error.message || 'Не вдалося виконати запит. Спробуйте ще раз.';
  }
  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (pageName === 'contacts') {
        status.textContent = 'Онлайн-надсилання ще не підключено. Напишіть нам за адресою, зазначеною в контактах. Дані форми не надіслано.';
        return;
      }
      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      status.textContent = 'Зачекайте…';
      try {
        var api = await client();
        var data = new FormData(form);
        if (pageName === 'register') {
          var result = await api.auth.signUp({ email: String(data.get('email')).trim(), password: String(data.get('password')), options: {
            emailRedirectTo: accountURL.href,
            data: { display_name: String(data.get('name')).trim(), skill: String(data.get('skill')) }
          }});
          if (result.error) throw result.error;
          form.reset();
          status.textContent = result.data.session ? 'Реєстрацію завершено. Відкрийте «Мій акаунт».' : 'Якщо реєстрація доступна для цієї адреси, на неї надійде лист. Перевірте пошту для підтвердження.';
        } else if (pageName === 'login') {
          var login = await api.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
          if (login.error) throw login.error;
          location.assign(accountURL.href);
        }
      } catch (error) { status.textContent = friendly(error); }
      finally { button.disabled = false; }
    });
  }
  if (account) {
    (async function () {
      try {
        var api = await client();
        var response = await api.auth.getUser();
        if (response.error || !response.data.user) { status.textContent = 'Щоб переглянути акаунт, увійдіть.'; return; }
        status.textContent = 'Ви увійшли як ' + response.data.user.email;
        var logout = document.getElementById('logout');
        logout.hidden = false;
        logout.addEventListener('click', async function () {
          logout.disabled = true;
          var result = await api.auth.signOut();
          if (result.error) { status.textContent = friendly(result.error); logout.disabled = false; return; }
          location.assign('login.html');
        });
      } catch (error) { status.textContent = friendly(error); }
    })();
  }
})();
