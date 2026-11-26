(() => {
  'use strict';
  const find = selector => document.querySelector(selector);
  const en = () => document.documentElement.lang === 'en';
  const pick = (uk, english) => en() ? english : uk;
  const href = slug => window.smakRecipeHref?.(slug) || '/recipe.html?recipe=' + encodeURIComponent(slug);
  const currentUser = async api => data(await api.auth.getSession()).session?.user || null;
  const recipePage = find('article.recipe');
  const account = find('#account-member');
  const home = find('#featured-title');
  if (!recipePage && !account && !home) return;

  function data(response) {
    if (response.error) throw response.error;
    return response.data;
  }
  function el(tag, cls) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    return element;
  }
  function label(node, uk, english) {
    node.dataset.communityUk = uk;
    node.dataset.communityEn = english;
    node.textContent = pick(uk, english);
    return node;
  }
  function text(tag, uk, english, cls) { return label(el(tag, cls), uk, english); }
  function section(parent, uk, english) {
    const block = el('section', 'section community');
    block.setAttribute('translate','no');
    block.append(text('h2', uk, english));
    parent.append(block);
    return block;
  }
  function status(parent) {
    const node = el('p', 'form-hint');
    node.setAttribute('role','status');
    parent.append(node);
    return node;
  }
  function failure(message) {
    label(message, 'Не вдалося виконати запит. Перевірте з’єднання та спробуйте ще раз.', 'Request failed. Check your connection and try again.');
  }
  function links(parent, rows) {
    const list = el('ul');
    for (const row of rows) {
      const item = el('li');
      const link = el('a');
      link.href = href(row.slug);
      link.textContent = row.title;
      item.append(link);
      list.append(item);
    }
    parent.append(list);
  }
  function input(form, name, uk, english, type='text', required=false, max) {
    const wrap = el('label', 'form-group');
    wrap.append(text('span', uk, english));
    const field = el(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    if (field.tagName === 'INPUT') field.type = type;
    field.name = name;
    field.required = required;
    if (max) field.maxLength = max;
    wrap.append(field);
    form.append(wrap);
    return field;
  }
  function option(field, value, uk, english) {
    const opt = text('option', uk, english);
    opt.value = value;
    field.append(opt);
  }
  function submit(form, uk, english, action) {
    const button = text('button', uk, english, 'btn');
    button.type = 'submit';
    form.append(button);
    const message = status(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      label(message,'Зачекайте…','Please wait…');
      try { await action(message); }
      catch { failure(message); }
      finally { button.disabled = false; }
    });
    return message;
  }

  document.addEventListener('smakhub:language', () => {
    document.querySelectorAll('[data-community-uk]').forEach(node => {
      node.textContent = pick(node.dataset.communityUk, node.dataset.communityEn);
    });
  });

  function recovery(api) {
    const guest = find('#account-guest');
    const panel = el('details', 'community');
    panel.setAttribute('translate','no');
    panel.append(text('summary', 'Забули пароль?', 'Forgot your password?'));
    const form = el('form','form');
    const email = input(form,'email','Електронна пошта','Email','email',true,254);
    email.autocomplete = 'email';
    submit(form,'Надіслати посилання','Send recovery link', async message => {
      const redirect = new URL('/account',location.origin);
      redirect.searchParams.set('mode','recovery');
      data(await api.auth.resetPasswordForEmail(email.value.trim(), {redirectTo: redirect.href}));
      label(message,'Якщо акаунт існує, на цю пошту надійде посилання.','If this account exists, a recovery link will be emailed.');
    });
    panel.append(form);
    guest.append(panel);
    let prompted = false;
    function promptReset() {
      if (prompted) return;
      prompted = true;
      const reset = section(find('#main .container'),'Новий пароль','New password');
      const next = el('form','form');
      const password = input(next,'new_password','Новий пароль','New password','password',true);
      const confirmation = input(next,'confirm_password','Повторіть пароль','Confirm password','password',true);
      password.minLength = confirmation.minLength = 8;
      password.autocomplete = confirmation.autocomplete = 'new-password';
      const validate = () => confirmation.setCustomValidity(confirmation.value && confirmation.value !== password.value ? pick('Паролі не збігаються','Passwords do not match') : '');
      [password,confirmation].forEach(field=>field.addEventListener('input',validate));
      submit(next,'Зберегти новий пароль','Save new password',async message=>{
        data(await api.auth.updateUser({password:password.value}));
        next.reset();
        label(message,'Пароль оновлено.','Password updated.');
        next.querySelectorAll('label,button').forEach(n=>n.hidden=true);
        history.replaceState(null,'',location.pathname);
      });
      reset.append(next);
      reset.scrollIntoView({block:'center'});
      password.focus();
    }
    api.auth.onAuthStateChange((event,session)=>{
      if (event === 'PASSWORD_RECOVERY' || (session && new URLSearchParams(location.search).get('mode') === 'recovery')) setTimeout(promptReset,0);
    });
    if (new URLSearchParams(location.search).get('mode') === 'recovery') {
      currentUser(api).then(user=>{ if (user) promptReset(); }).catch(()=>{});
    }
  }

  async function profile(api,user,container) {
    const sectionNode = section(container,'Профіль та вподобання','Profile and preferences');
    const form = el('form','form');
    const name = input(form,'display_name','Ім’я','Name','text',true,80);
    const skill = input(form,'skill','Кулінарні навички','Cooking skills','select');
    option(skill,'beginner','Початківець','Beginner');
    option(skill,'intermediate','Середній рівень','Intermediate');
    option(skill,'advanced','Досвідчений','Advanced');
    const cuisines = input(form,'cuisines','Улюблені кухні через кому','Favorite cuisines, comma separated','text',false,300);
    const exclusions = input(form,'excluded_foods','Які продукти виключити з рекомендацій?','Ingredients to exclude from suggestions','text',false,600);
    const info = status(sectionNode);
    try {
      const row = data(await api.from('profiles').select('display_name,skill,cuisines,excluded_foods').eq('id',user.id).single());
      for (const field of [name,skill,cuisines,exclusions]) field.value = row[field.name] || '';
      const greet = () => {
        if (row.display_name && container.isConnected) label(find('#account-greeting'),'Вітаємо, ' + row.display_name + '!','Welcome, ' + row.display_name + '!');
      };
      greet();
      submit(form,'Зберегти профіль','Save profile',async message=>{
        const updated = data(await api.from('profiles').update({
          display_name:name.value.trim(),skill:skill.value,cuisines:cuisines.value.trim(),excluded_foods:exclusions.value.trim()
        }).eq('id',user.id).select('display_name').single());
        row.display_name=updated.display_name;
        greet();
        label(message,'Профіль оновлено.','Profile updated.');
      });
      sectionNode.append(form);
    } catch { failure(info); }
  }
  async function historyList(api,user,parent) {
    const block = section(parent,'Нещодавно переглянуті','Recently viewed');
    try {
      const rows = data(await api.from('recipe_history').select('recipes!inner(title,slug,status)').eq('user_id',user.id)
        .eq('recipes.status','published').order('viewed_at',{ascending:false}).limit(30));
      if (rows.length) links(block,rows.map(row=>row.recipes));
      else block.append(text('p','Тут з’являться переглянуті вами рецепти.','Recipes you open will appear here.'));
    } catch { failure(status(block)); }
  }
  function accountFeatures(api,user) {
    const previous = find('#community-account');
    if (previous?.dataset.user === user?.id) return;
    previous?.remove();
    if (!user) return;
    const container = el('div');
    container.id = 'community-account';
    container.dataset.user = user.id;
    account.append(container);
    void profile(api,user,container);
    void historyList(api,user,container);
  }
  async function suggestions(api,parent,recipeId) {
    const block = section(parent, recipeId ? 'Схожі рецепти':'Рекомендовано для вас', recipeId ? 'Similar recipes':'Recommended for you');
    try {
      const rows = data(await api.rpc('smak_suggestions',{p_recipe:recipeId}));
      if (rows.length) links(block,rows);
      else block.append(text('p','Поки немає рецептів за цими вподобаннями.','No recipes match these preferences yet.'));
    } catch { failure(status(block)); }
  }
  async function ratings(api,parent,recipeId,user) {
    const block = section(parent,'Оцінка рецепта','Recipe rating');
    const summary = status(block);
    async function refresh() {
      const [score] = data(await api.rpc('smak_recipe_score',{p_recipe:recipeId}));
      if (score?.votes) label(summary,'Середня оцінка: ' + score.mean + ' / 5 (' + score.votes + ')','Average rating: ' + score.mean + ' / 5 (' + score.votes + ')');
      else label(summary,'Ще немає оцінок.','No ratings yet.');
    }
    try {
      await refresh();
      if (!user) return;
      const row = data(await api.from('recipe_ratings').select('stars').eq('user_id',user.id).eq('recipe_id',recipeId).maybeSingle());
      const form = el('form','form');
      const field = input(form,'stars','Ваша оцінка','Your rating','select',true);
      for (let stars=1;stars<=5;stars++) option(field,String(stars),'★'.repeat(stars),'★'.repeat(stars));
      field.value = String(row?.stars || 5);
      submit(form,'Зберегти оцінку','Save rating',async message=>{
        data(await api.from('recipe_ratings').upsert({user_id:user.id,recipe_id:recipeId,stars:Number(field.value)},{onConflict:'user_id,recipe_id'}));
        label(message,'Оцінку збережено.','Rating saved.');
        await refresh();
      });
      block.append(form);
    } catch { failure(summary); }
  }
  async function comments(api,parent,recipeId,user) {
    const block = section(parent,'Коментарі','Comments');
    const list = el('ul');
    const hint = status(block);
    const more = text('button','Попередні коментарі','Older comments','btn btn-outline');
    more.type='button';
    more.hidden=true;
    block.append(list,more);
    let offset=0;
    async function load(reset) {
      more.disabled=true;
      try {
        const from=reset?0:offset;
        const rows=data(await api.from('recipe_comments').select('id,body,created_at').eq('recipe_id',recipeId)
          .order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,from+19));
        if (reset) list.replaceChildren();
        for (const row of rows) {
          const li=el('li');
          const time=el('time');
          time.dateTime=row.created_at;
          label(time,new Date(row.created_at).toLocaleDateString('uk-UA'),new Date(row.created_at).toLocaleDateString('en-GB'));
          const p=el('p');
          p.textContent=row.body;
          li.append(time,p); list.append(li);
        }
        offset=from+rows.length;
        more.hidden=rows.length<20;
        label(hint,offset?'':'Поки немає коментарів.',offset?'':'No comments yet.');
      } catch { failure(hint); }
      finally { more.disabled=false; }
    }
    more.addEventListener('click',()=>load(false));
    await load(true);
    if (!user) return;
    const form=el('form','form');
    const field=input(form,'body','Ваш коментар','Your comment','textarea',true,2000);
    submit(form,'Опублікувати коментар','Post comment',async message=>{
      if (!field.value.trim()) { label(message,'Введіть текст.','Enter a comment.'); return; }
      data(await api.from('recipe_comments').insert({recipe_id:recipeId,user_id:user.id,body:field.value.trim()}));
      form.reset();
      label(message,'Коментар опубліковано.','Comment posted.');
      await load(true);
    });
    block.append(form);
  }
  function share(parent,slug) {
    const panel=section(parent,'Поділитися рецептом','Share recipe');
    const button=text('button','Скопіювати посилання','Copy link','btn btn-outline');
    button.type='button';
    const message=status(panel);
    panel.append(button);
    button.addEventListener('click',async()=>{
      const url=new URL(href(slug),location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        label(message,'Посилання скопійовано.','Link copied.');
      } catch {
        let field=panel.querySelector('input');
        if (!field) { field=el('input'); field.readOnly=true; field.setAttribute('aria-label','URL'); panel.append(field); }
        field.value=url; field.focus(); field.select();
        label(message,'Скопіюйте виділене посилання.','Copy the selected link.');
      }
    });
  }
  let seenSlug;
  async function setupRecipe(detail) {
    const slug=detail?.slug;
    if (!slug || slug===seenSlug || !recipePage) return;
    seenSlug=slug;
    find('#community-recipe')?.remove();
    const parts=el('div');
    parts.id='community-recipe';
    recipePage.append(parts);
    share(parts,slug);
    try {
      const api=await window.smakApi;
      const user=await currentUser(api);
      const row=data(await api.from('recipes').select('id').eq('status','published').eq('slug',slug).maybeSingle());
      if (!parts.isConnected || !row) return;
      if (user) {
        const result=await api.from('recipe_history').upsert({user_id:user.id,recipe_id:row.id,viewed_at:new Date().toISOString()},{onConflict:'user_id,recipe_id'});
        if(result.error) label(status(parts),'Історію переглядів не оновлено.','Viewing history was not updated.');
      }
      await Promise.all([ratings(api,parts,row.id,user),comments(api,parts,row.id,user),suggestions(api,parts,row.id)]);
    } catch { failure(status(parts)); }
  }
  document.addEventListener('smak:recipe',e=>void setupRecipe(e.detail));
  window.addEventListener('smak:recipe',e=>void setupRecipe(e.detail));
  if (window.smakCurrent) void setupRecipe(window.smakCurrent);
  async function init() {
    const api=await window.smakApi;
    if (!api) return;
    if (account) {
      recovery(api);
      api.auth.onAuthStateChange((event,session)=>setTimeout(()=>accountFeatures(api,session?.user),0));
      accountFeatures(api,await currentUser(api));
    }
    if (home && await currentUser(api)) await suggestions(api,home.parentElement.parentElement,null);
  }
  init().catch(()=>{ if(account) failure(status(account)); });
})();
