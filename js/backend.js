(function () {
  'use strict';

  const accountLink = document.querySelector('[data-account-link]');
  const accountStatus = document.querySelector('#account-status');
  const contactForm = document.querySelector('#contact-form');
  const savedStatus = document.querySelector('#saved-status');
  const saveButton = document.querySelector('[data-save-recipe]');
  const page = location.pathname.split('/').pop().replace(/\.html$/, '');
  const accountURL = new URL(page && !location.pathname.endsWith('.html') ? 'account' : 'account.html', location.href);

  if (page === 'login' || page === 'register') {
    accountURL.searchParams.set('mode', page);
    accountURL.hash = location.hash;
    location.replace(accountURL.href);
    return;
  }

  const settingsError = 'Не вдалося підключитися до сервісу. Спробуйте оновити сторінку.';
  let user = null;

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  function authError(error) {
    switch (error.code) {
      case 'invalid_credentials': return 'Перевірте пошту та пароль.';
      case 'email_not_confirmed': return 'Спочатку підтвердьте адресу через лист.';
      case 'email_address_not_authorized': return 'Надсилання листів на цю адресу ще не налаштовано.';
      case 'over_email_send_rate_limit': return 'Забагато спроб. Спробуйте пізніше.';
      case 'user_already_exists': return 'Цей акаунт уже існує. Спробуйте увійти.';
      default: return error.status === 429 ? 'Забагато спроб. Спробуйте пізніше.' : 'Не вдалося виконати запит. Спробуйте ще раз.';
    }
  }

  function onSubmit(form, handler) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        await handler(new FormData(form));
      } finally {
        button.disabled = false;
      }
    });
  }

  function updateAccountLink() {
    if (accountLink) accountLink.textContent = user ? 'Акаунт' : 'Увійти';
  }

  function initAccount(api) {
    const guest = document.querySelector('#account-guest');
    const member = document.querySelector('#account-member');
    const login = document.querySelector('#login-form');
    const register = document.querySelector('#register-form');
    const modeLinks = document.querySelectorAll('[data-auth-mode]');

    function showMode() {
      const isRegistration = new URLSearchParams(location.search).get('mode') === 'register';
      login.hidden = isRegistration;
      register.hidden = !isRegistration;
      modeLinks.forEach(link => {
        if ((link.dataset.authMode === 'register') === isRegistration) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }

    modeLinks.forEach(link => link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', link.href);
      accountStatus.textContent = '';
      showMode();
    }));
    window.addEventListener('popstate', () => {
      accountStatus.textContent = '';
      showMode();
    });

    function render() {
      guest.hidden = Boolean(user);
      member.hidden = !user;
      accountStatus.textContent = '';
      updateAccountLink();
      const adminLink = document.getElementById('admin-link');
      adminLink.hidden = true;
      if (user) {
        const member = user.id;
        api.rpc('is_smak_admin').then(({data}) => {
          if (user?.id === member) adminLink.hidden = data !== true;
        });
        const displayName = user.user_metadata?.display_name;
        document.querySelector('#account-greeting').textContent = displayName ? 'Вітаємо, ' + displayName + '!' : 'Мій профіль';
        document.querySelector('#account-email').textContent = user.email || '';
      } else {
        showMode();
      }
    }

    onSubmit(login, async data => {
      accountStatus.textContent = 'Входимо…';
      try {
        const result = unwrap(await api.auth.signInWithPassword({
          email: data.get('email').trim(), password: data.get('password')
        }));
        user = result.user;
        login.reset();
        render();
      } catch (error) {
        accountStatus.textContent = authError(error);
      }
    });

    onSubmit(register, async data => {
      accountStatus.textContent = 'Створюємо акаунт…';
      try {
        const result = unwrap(await api.auth.signUp({
          email: data.get('email').trim(), password: data.get('password'),
          options: {
            emailRedirectTo: accountURL.href,
            data: { display_name: data.get('name').trim(), skill: data.get('skill') }
          }
        }));
        register.reset();
        if (result.session) {
          user = result.session.user;
          render();
        } else {
          accountStatus.textContent = 'Перевірте пошту й підтвердьте адресу. Якщо акаунт уже існує, скористайтеся входом.';
        }
      } catch (error) {
        accountStatus.textContent = authError(error);
      }
    });

    const logout = document.querySelector('#logout');
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        unwrap(await api.auth.signOut());
        user = null;
        history.replaceState(null, '', accountURL.href);
        render();
      } catch (error) {
        accountStatus.textContent = authError(error);
      } finally {
        logout.disabled = false;
      }
    });

    render();
  }

  function initContact(api) {
    const status = document.querySelector('#contact-status');
    status.textContent = '';
    if (!user) {
      document.querySelector('#contact-sign-in').hidden = false;
      return;
    }

    contactForm.hidden = false;
    const email = contactForm.elements.email;
    email.value = user.email || '';
    contactForm.elements.name.value = user.user_metadata?.display_name || '';

    onSubmit(contactForm, async data => {
      status.textContent = 'Надсилаємо повідомлення…';
      try {
        unwrap(await api.rpc('submit_contact_message', {
          p_name: data.get('name').trim(), p_email: data.get('email').trim(),
          p_topic: data.get('topic'), p_message: data.get('message').trim(),
          p_consent: data.get('consent') === 'on'
        }));
        contactForm.elements.message.value = '';
        contactForm.elements.consent.checked = false;
        status.textContent = 'Повідомлення прийнято. Команда зможе відповісти на вказану пошту.';
      } catch (error) {
        if (error.message === 'contact_rate_limit') status.textContent = 'Забагато звернень за короткий час. Спробуйте пізніше.';
        else if (error.message === 'contact_invalid_fields') status.textContent = 'Перевірте заповнені поля та згоду на обробку даних.';
        else status.textContent = 'Не вдалося надіслати повідомлення. Спробуйте ще раз або напишіть напряму на пошту.';
      }
    });
  }

  function favorite(api, recipeId) {
    return api.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
  }

  async function initSaveButton(api) {
    const status = document.querySelector('#save-status');
    if (!user) {
      document.querySelector('#save-sign-in').hidden = false;
      return;
    }

    status.textContent = 'Перевіряємо збереження…';
    try {
      const recipe = unwrap(await api.from('recipes').select('id')
        .eq('slug', saveButton.dataset.saveRecipe).eq('status', 'published').maybeSingle());
      if (!recipe) {
        status.textContent = 'Цей рецепт поки недоступний для збереження.';
        return;
      }
      let saved = Boolean(unwrap(await api.from('favorites').select('recipe_id')
        .eq('user_id', user.id).eq('recipe_id', recipe.id).maybeSingle()));
      function renderButton() {
        saveButton.textContent = saved ? 'Видалити зі збереженого' : 'Зберегти рецепт';
      }

      renderButton();
      saveButton.hidden = false;
      status.textContent = '';
      saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        try {
          if (saved) unwrap(await favorite(api, recipe.id));
          else unwrap(await api.from('favorites').upsert(
            { user_id: user.id, recipe_id: recipe.id },
            { onConflict: 'user_id,recipe_id', ignoreDuplicates: true }
          ));
          saved = !saved;
          status.textContent = saved ? 'Рецепт додано до збереженого.' : 'Рецепт видалено зі збереженого.';
          renderButton();
        } catch {
          status.textContent = 'Не вдалося оновити список. Спробуйте ще раз.';
        } finally {
          saveButton.disabled = false;
        }
      });
    } catch {
      status.textContent = 'Не вдалося перевірити збереження рецепта.';
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function initSaved(api) {
    if (!user) {
      savedStatus.textContent = 'Увійдіть, щоб побачити свої збережені рецепти.';
      document.querySelector('#saved-sign-in').hidden = false;
      return;
    }

    const list = document.querySelector('#saved-recipes');
    function renderCount() {
      savedStatus.textContent = list.childElementCount
        ? 'Збережено рецептів: ' + list.childElementCount
        : 'Тут з’являться рецепти, які ви збережете.';
    }

    try {
      const rows = unwrap(await api.from('favorites')
        .select('recipe_id, recipes!inner(slug,title,description,image_path)').eq('user_id', user.id)
        .eq('recipes.status', 'published').order('created_at', { ascending: false }));
      for (const row of rows) {
        const recipe = row.recipes;
        const item = element('li');
        const card = element('article', 'recipe-card');
        const body = element('div', 'recipe-card-body');
        if (recipe.image_path) {
          const image = element('img');
          image.src = window.smakImage(recipe.image_path);
          image.alt = recipe.title;
          image.width = 640;
          image.height = 480;
          image.loading = 'lazy';
          card.append(image);
        }
        const heading = element('h2');
        const link = element('a', '', recipe.title);
        link.href = window.smakRecipeHref(recipe.slug);
        heading.append(link);
        const button = element('button', 'btn btn-outline', 'Видалити');
        button.type = 'button';
        button.setAttribute('aria-label', 'Видалити зі збережених: ' + recipe.title);
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            unwrap(await favorite(api, row.recipe_id));
            item.remove();
            renderCount();
          } catch {
            savedStatus.textContent = 'Не вдалося видалити рецепт. Спробуйте ще раз.';
            button.disabled = false;
          }
        });
        body.append(heading, element('p', '', recipe.description), button);
        card.append(body);
        item.append(card);
        list.append(item);
      }
      renderCount();
    } catch {
      savedStatus.textContent = 'Не вдалося завантажити збережені рецепти.';
    }
  }

  async function init() {
    try {
      const api = await window.smakApi;
      const session = unwrap(await api.auth.getSession());
      user = session.session?.user || null;
      updateAccountLink();
      if (accountStatus) initAccount(api);
      if (contactForm) initContact(api);
      if (saveButton && await window.smakRecipeReady) await initSaveButton(api);
      if (savedStatus) await initSaved(api);
    } catch {
      const status = accountStatus || savedStatus || document.querySelector('#contact-status, #save-status');
      if (status) status.textContent = settingsError;
    }
  }

  init();
})();
