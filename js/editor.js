(async function () {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const status = $('#editor-status');
  if (!status) return;

  const stateLabels = {
    draft: 'Чернетка', pending: 'На модерації', published: 'Опубліковано', rejected: 'Відхилено'
  };
  const pageSize = 24;
  let api, user, admin;

  function node(tag, text) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function link(text, href) {
    const anchor = node('a', text);
    anchor.href = href;
    return anchor;
  }
  function checked({data, error}) {
    if (error) throw error;
    return data;
  }
  function explain(error) {
    const known = {
      stale_revision: 'Інший користувач уже змінив рецепт. Оновіть сторінку та перевірте нову версію.',
      invalid_ingredient: 'Перевірте назву та кількість кожного інгредієнта.',
      invalid_recipe: 'Перевірте поля рецепта й кількість кроків.',
      photo_required: 'Додайте фото перед надсиланням на модерацію.',
      invalid_photo: 'Не вдалося підтвердити фото. Завантажте його повторно.'
    };
    return known[error.message] || (error.local ? error.message : 'Не вдалося виконати дію. Перевірте з’єднання та права доступу.');
  }
  function invalid(text) {
    return Object.assign(new Error(text), {local:true});
  }
  async function run(button, task, feedback = status) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      await task();
    } catch (error) {
      feedback.textContent = explain(error);
    } finally {
      if (button) button.disabled = false;
    }
  }
  function button(text, task) {
    const control = node('button', text);
    control.type = 'button';
    control.className = 'btn btn-outline';
    control.addEventListener('click', () => run(control, task));
    return control;
  }
  function listView(selector, query, draw) {
    const root = $(selector);
    let offset = 0;
    let generation = 0;
    async function load(reset = false) {
      if (reset) offset = 0;
      const request = ++generation;
      const rows = checked(await query().range(offset,offset + pageSize));
      if (request !== generation) return;
      if (offset && rows.length === 0) {
        offset -= pageSize;
        return load();
      }
      const list = node('ul');
      list.className = 'editor-list';
      for (const row of rows.slice(0,pageSize)) {
        const item = node('li');
        draw(item,row,load);
        list.append(item);
      }
      root.replaceChildren(rows.length ? list : node('p','Записів немає.'));
      if (offset) root.append(button('Попередні', async () => { offset -= pageSize; await load(); }));
      if (rows.length > pageSize) root.append(button('Наступні', async () => { offset += pageSize; await load(); }));
    }
    return load;
  }
  function action(recipe, kind, note = '') {
    return api.rpc('smak_recipe_action', {p_id:recipe.id,p_revision:recipe.revision,p_action:kind,p_note:note}).then(checked);
  }
  function photoURL(raw) {
    if (/^images\/recipes\/[a-z0-9-]+\.webp$/.test(raw)) return raw;
    const prefix = window.SMAKHUB_CONFIG.supabaseUrl + '/storage/v1/object/public/recipe-photos/';
    return typeof raw === 'string' && raw.startsWith(prefix) ? raw : '';
  }
  function recipeURL(slug) {
    return window.smakRecipeHref(slug);
  }
  function summary(item, recipe, load, moderate) {
    const heading = node('h3');
    heading.append(recipe.status === 'published' ? link(recipe.title,recipeURL(recipe.slug)) : document.createTextNode(recipe.title));
    const controls = node('div');
    controls.className = 'auth-switch';
    controls.append(link('Переглянути й редагувати','author.html?edit=' + encodeURIComponent(recipe.id)));
    if (moderate && recipe.status === 'pending') {
      controls.append(button('Схвалити', async () => {
        await action(recipe,'published'); status.textContent = 'Рецепт опубліковано.'; await load();
      }),button('Відхилити', async () => {
        const note = prompt('Причина відхилення (до 500 символів)');
        if (note === null) return;
        if (!note.trim() || note.trim().length > 500) throw invalid('Вкажіть причину відхилення до 500 символів.');
        await action(recipe,'rejected',note); status.textContent = 'Рецепт повернуто автору.'; await load();
      }));
    }
    controls.append(button('Видалити рецепт', async () => {
      if (!confirm('Видалити рецепт «' + recipe.title + '»?')) return;
      await action(recipe,'delete'); status.textContent = 'Рецепт видалено.'; await load();
    }));
    item.append(heading, node('p',stateLabels[recipe.status]),controls);
    if (recipe.moderation_note) item.append(node('p',recipe.moderation_note));
  }
  async function initAuthor() {
    $('#author-tools').hidden = false;
    $('#staff-link').hidden = !admin;
    const form = $('#recipe-editor');
    const panel = $('#edit-panel');
    const feedback = $('#form-status');
    const fields = form.elements;
    const categories = checked(await api.from('recipe_categories').select('slug,label').order('label'));
    fields.category.replaceChildren(...categories.map(category => new Option(category.label,category.slug)));
    let current = null;
    let upload = null;

    function edit(row) {
      current = row || null;
      upload = null;
      form.reset();
      feedback.textContent = '';
      $('#edit-title').textContent = row ? 'Редагувати рецепт' : 'Новий рецепт';
      for (const name of ['title','description','category','cuisine','minutes','difficulty','servings','cost_band']) {
        if (row) fields[name].value = row[name] ?? '';
      }
      for (const control of form.querySelectorAll('[name=cookware]')) {
        control.checked = Boolean(row?.cookware?.includes(control.value));
      }
      fields.vegetarian.checked = Boolean(row?.vegetarian);
      fields.ingredients.value = row ? row.ingredients.map(parts => parts.join(' | ')).join('\n') : '';
      fields.steps.value = row ? row.steps.join('\n') : '';
      const image = $('#current-photo');
      const src = photoURL(row?.image_path);
      image.hidden = !src;
      if (src) image.src = src;
      else image.removeAttribute('src');
      for (const control of form.querySelectorAll('[name=intent]')) {
        control.hidden = control.value === 'moderator' ? !(admin && row) : !!(admin && row && row.author_id !== user.id);
      }
      panel.hidden = false;
      fields.title.focus();
    }
    $('#new-recipe').addEventListener('click',() => edit(null));
    $('#close-editor').addEventListener('click',() => { panel.hidden = true; });
    const refresh = listView('#owner-recipes', () => api.from('recipes').select('id,slug,title,status,moderation_note,revision')
      .eq('author_id',user.id).order('created_at',{ascending:false}).order('id'), (item,row,load) => summary(item,row,load,false));
    async function getPhoto(file) {
      if (!file?.size) return current?.image_path ?? null;
      if (upload?.file === file) return upload.url;
      const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      if (file.size > 5*1024*1024 || !extensions[file.type]) throw invalid('Виберіть JPEG, PNG або WebP до 5 МБ.');
      const path = user.id + '/' + crypto.randomUUID() + '.' + extensions[file.type];
      const bucket = api.storage.from('recipe-photos');
      checked(await bucket.upload(path,file,{contentType:file.type,upsert:false}));
      upload = {file,url:bucket.getPublicUrl(path).data.publicUrl};
      return upload.url;
    }
    let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const controls = [...form.querySelectorAll('button')];
      controls.forEach(control => { control.disabled = true; });
      try {
        const data = new FormData(form);
        const target = event.submitter?.value || 'pending';
        const state = target === 'moderator' ? current.status : target;
        const ingredients = data.get('ingredients').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
          const parts = line.split('|').map(part => part.trim());
          if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalid('Для кожного продукту вкажіть назву | кількість.');
          return parts;
        });
        const steps = data.get('steps').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!ingredients.length || !steps.length || steps.length > 80 || ingredients.length > 80) throw invalid('Додайте від 1 до 80 інгредієнтів і кроків.');
        feedback.textContent = 'Зберігаємо…';
        const photo = await getPhoto(fields.photo.files[0]);
        if (!photo && state !== 'draft') throw invalid('Додайте фото готової страви.');
        const payload = Object.fromEntries(['title','description','cuisine','category','difficulty','cost_band'].map(name => [name,data.get(name).trim()]));
        Object.assign(payload,{ingredients,steps,image_path:photo,status:state,vegetarian:fields.vegetarian.checked,
          minutes:Number(data.get('minutes')),servings:Number(data.get('servings')),cookware:data.getAll('cookware')});
        const id = checked(await api.rpc('smak_save_recipe',{p_id:current?.id ?? null,p_revision:current?.revision ?? null,p_data:payload}));
        panel.hidden = true;
        status.textContent = state === 'pending' ? 'Рецепт передано на модерацію.' : 'Рецепт збережено.';
        history.replaceState(null,'',location.pathname);
        current = null;
        upload = null;
        await refresh(true);
        $('#new-recipe').focus();
      } catch (error) {
        feedback.textContent = explain(error);
      } finally {
        busy = false;
        controls.forEach(control => { control.disabled = false; });
      }
    });

    await refresh();
    const editId = new URLSearchParams(location.search).get('edit');
    if (editId) {
      const row = checked(await api.from('recipes').select('*').eq('id',editId).single());
      if (!admin && row.author_id !== user.id) throw invalid('Цей рецепт належить іншому автору.');
      edit(row);
    }
  }

  async function initAdmin() {
    if (!admin) throw invalid('Цей розділ доступний модераторам.');
    $('#admin-tools').hidden = false;
    const filter = $('#mod-filter');
    const loadRecipes = listView('#mod-recipes', () => {
      let query = api.from('recipes').select('id,title,slug,status,revision,moderation_note').order('created_at',{ascending:false}).order('id');
      if (filter.elements.status.value) query = query.eq('status',filter.elements.status.value);
      if (filter.elements.title.value.trim()) query = query.ilike('title','%' + filter.elements.title.value.trim() + '%');
      return query;
    }, (item,row,load) => summary(item,row,load,true));
    filter.addEventListener('submit',event => {
      event.preventDefault();
      run(filter.querySelector('button'), () => loadRecipes(true));
    });
    const loadComments = listView('#mod-comments', () => api.from('recipe_comments').select('id,body,recipes(title,slug)')
      .order('created_at',{ascending:false}).order('id'), (item,row,load) => {
      if (row.recipes) item.append(node('strong',row.recipes.title));
      item.append(node('p',row.body),button('Редагувати коментар',async () => {
        const body = prompt('Текст коментаря',row.body);
        if (body === null) return;
        if (!body.trim()) throw invalid('Вкажіть текст коментаря.');
        checked(await api.from('recipe_comments').update({body:body.trim()}).eq('id',row.id).select('id').single());
        await load();
      }),button('Видалити коментар',async () => {
        if (!confirm('Видалити цей коментар?')) return;
        checked(await api.from('recipe_comments').delete().eq('id',row.id).select('id').single());
        await load();
      }));
    });

    const cat = $('#category-form');
    const cats = new Set();
    const loadCategories = listView('#mod-categories', () => api.from('recipe_categories').select('slug,label').order('label').order('slug'),
      (item,row) => {
        cats.add(row.slug);
        item.append(node('span',row.label + ' (' + row.slug + ') '),button('Редагувати назву',async () => {
          cat.elements.slug.value = row.slug; cat.elements.label.value = row.label; cat.elements.label.focus();
        }));
      });
    cat.addEventListener('submit',event => {
      event.preventDefault();
      run(cat.querySelector('button'),async () => {
        const slug = cat.elements.slug.value.trim();
        const label = cat.elements.label.value.trim();
        if (!label) throw invalid('Вкажіть назву категорії.');
        const query = cats.has(slug) ? api.from('recipe_categories').update({label}).eq('slug',slug) : api.from('recipe_categories').insert({slug,label});
        checked(await query.select('slug').single());
        cat.reset(); status.textContent = 'Категорію збережено.'; await loadCategories(true);
      });
    });

    const collection = $('#collection-form');
    const selected = new Map();
    function drawSelection() {
      const list = $('#collection-selected');
      list.replaceChildren();
      for (const [id,title] of selected) {
        const item = node('li',title + ' ');
        item.append(button('Прибрати',async () => { selected.delete(id); drawSelection(); }));
        list.append(item);
      }
    }
    function resetCollection() {
      collection.reset(); collection.elements.id.value = ''; selected.clear(); drawSelection();
      $('#collection-choices').replaceChildren();
    }
    $('#reset-collection').addEventListener('click',resetCollection);
    $('#find-collection-recipes').addEventListener('click',() => run($('#find-collection-recipes'),async () => {
      const results = checked(await api.from('recipes').select('id,title').eq('status','published')
        .ilike('title','%' + collection.elements.search.value.trim() + '%').order('title').limit(24));
      const choices = $('#collection-choices');
      choices.replaceChildren();
      results.forEach(recipe => choices.append(button(recipe.title,async () => {
        if (selected.size >= 24 && !selected.has(recipe.id)) throw invalid('У добірці може бути до 24 рецептів.');
        selected.set(recipe.id,recipe.title); drawSelection();
      })));
      if (!results.length) choices.append(node('p','Записів немає.'));
    }));
    const loadCollections = listView('#mod-collections', () => api.from('recipe_collections').select('*').order('title').order('id'),
      (item,row,load) => {
        item.append(node('strong',row.title + ' '),button('Редагувати добірку',async () => {
          const rows = checked(await api.from('recipes').select('id,title').in('id',row.recipe_ids).eq('status','published'));
          resetCollection();
          collection.elements.id.value = row.id; collection.elements.title.value = row.title;
          const titles = new Map(rows.map(recipe => [recipe.id,recipe.title]));
          row.recipe_ids.forEach(id => { if (titles.has(id)) selected.set(id,titles.get(id)); });
          drawSelection(); collection.elements.title.focus();
        }),button('Видалити добірку',async () => {
          if (!confirm('Видалити добірку?')) return;
          checked(await api.from('recipe_collections').delete().eq('id',row.id).select('id').single());
          resetCollection(); await load();
        }));
      });
    collection.addEventListener('submit',event => {
      event.preventDefault();
      run(collection.querySelector('button:not([type])'),async () => {
        if (!selected.size) throw invalid('Додайте щонайменше один рецепт до добірки.');
        const data = {title:collection.elements.title.value.trim(),recipe_ids:[...selected.keys()]};
        const id = collection.elements.id.value;
        const query = id ? api.from('recipe_collections').update(data).eq('id',id) : api.from('recipe_collections').insert(data);
        checked(await query.select('id').single());
        resetCollection(); status.textContent = 'Добірку збережено.'; await loadCollections(true);
      });
    });

    let offset = 0;
    async function loadMembers() {
      const members = checked(await api.from('smak_members').select('user_id,blocked,is_admin')
        .order('user_id').range(offset,offset+pageSize));
      const profiles = members.length ? checked(await api.from('profiles').select('id,display_name')
        .in('id',members.slice(0,pageSize).map(row => row.user_id))) : [];
      const names = new Map(profiles.map(profile => [profile.id,profile.display_name]));
      const root = $('#mod-users');
      root.replaceChildren();
      for (const row of members.slice(0,pageSize)) {
        const p = node('p',(names.get(row.user_id) || 'Користувач') + ' · ' + row.user_id + ' ');
        if (row.is_admin) p.append(node('strong','Модератор'));
        else p.append(button(row.blocked ? 'Розблокувати' : 'Заблокувати',async () => {
          if (!confirm(row.blocked ? 'Розблокувати користувача?' : 'Заблокувати користувача?')) return;
          checked(await api.from('smak_members').update({blocked:!row.blocked}).eq('user_id',row.user_id).select('user_id').single());
          await loadMembers();
        }));
        root.append(p);
      }
      if (offset) root.append(button('Попередні',async () => { offset -= pageSize; await loadMembers(); }));
      if (members.length > pageSize) root.append(button('Наступні',async () => { offset += pageSize; await loadMembers(); }));
    }
    await Promise.all([loadRecipes(),loadComments(),loadCategories(),loadCollections(),loadMembers()]);
  }

  try {
    api = await window.smakApi;
    const session = checked(await api.auth.getSession()).session;
    if (!session) {
      status.textContent = 'Щоб продовжити, увійдіть в акаунт.';
      $('#editor-login').hidden = false;
      return;
    }
    user = session.user;
    if (!checked(await api.rpc('is_smak_active'))) throw invalid('Для цього акаунта доступ до змін обмежено.');
    admin = checked(await api.rpc('is_smak_admin'));
    if ($('#author-tools')) await initAuthor();
    else await initAdmin();
    status.textContent = '';
  } catch (error) {
    status.textContent = explain(error);
  }
})();
