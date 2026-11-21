(async function () {
  'use strict';
  const form = document.querySelector('.filters');
  const grid = document.querySelector('#results-title ~ .card-grid');
  const status = document.querySelector('#results-title + p');
  const chips = document.querySelector('.active-filters');
  const filterCount = document.querySelector('.filter-count');
  const nav = document.createElement('nav');
  nav.className = 'form-actions';
  nav.setAttribute('aria-label','Сторінки каталогу');
  grid.after(nav);
  status.setAttribute('role','status');
  const api = await window.smakApi;
  const categories = new Map(Object.entries({breakfast:'Сніданки', lunch:'Обіди', dinner:'Вечері', dessert:'Десерти'}));
  const aliases = {'яйце':'яйця','помідор':'помідори','огірок':'огірки','ізюм':'родзинки'};
  let sequence = 0;
  function element(tag,text,css) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (css) node.className = css;
    return node;
  }
  function rowCard(row) {
    const item = element('li');
    const article = element('article','','recipe-card');
    const link = element('a');
    link.href = window.smakRecipeHref(row.slug);
    const image = element('img');
    image.src = window.smakImage(row.image_path);
    image.alt = row.title;
    image.width = 640; image.height = 480; image.loading = 'lazy';
    link.append(image);
    const body = element('div','','recipe-card-body');
    const title = element('h3');
    const label = element('a',row.title);
    label.href = link.href;
    title.append(label);
    const details = { easy:'Легко', medium:'Середньо', hard:'Складно' };
    body.append(element('p',categories.get(row.category) || row.category,'recipe-card-cat'),title,
      element('p',row.description),element('p',row.minutes+' хв · '+(details[row.difficulty] || row.difficulty)));
    if (row.image_path) article.append(link);
    article.append(body);
    item.append(article);
    return item;
  }
  function button(label,action) {
    const button = element('button',label,'btn btn-outline');
    button.type = 'button';
    button.addEventListener('click',action);
    return button;
  }
  function renderChips(params) {
    chips.replaceChildren();
    const extra = ['difficulty','vegetarian','cost','tool'];
    const total = extra.filter(key => params.get(key)).length;
    filterCount.textContent = total;
    filterCount.hidden = !total;
    for (const [key, value] of params) {
      const input = form.elements.namedItem(key);
      if (!input || !value || !input.value) continue;
      const label = input.labels?.[0]?.textContent.trim();
      const option = input.selectedOptions?.[0]?.textContent;
      const item = element('li');
      const remove = button(input.type === 'checkbox' ? label : option || value, () => {
        const next = new URLSearchParams(location.search);
        next.delete(key);
        next.delete('page');
        update(next);
        document.querySelector('#results-title').focus();
      });
      remove.removeAttribute('class');
      remove.title = 'Видалити фільтр';
      const mark = element('span','×');
      mark.setAttribute('aria-hidden','true');
      remove.append(mark);
      item.append(remove);
      chips.append(item);
    }
    chips.hidden = chips.childElementCount === 0;
  }
  function paramsFromForm() {
    const params = new URLSearchParams();
    for (const [name,value] of new FormData(form)) if (String(value).trim()) params.set(name,String(value).trim());
    return params;
  }
  function update(params) {
    history.pushState(null,'',location.pathname+(params.size?'?'+params:''));
    load();
  }
  function changePage(page) {
    const p = paramsFromForm();
    if (page>1) p.set('page',page);
    update(p);
    document.querySelector('#results-title').scrollIntoView();
  }
  function bundledResults(args) {
    const normalize = value => value.trim().toLocaleLowerCase('uk');
    return Object.entries(window.SMAKHUB_RECIPES)
      .map(([slug, recipe]) => ({
        ...recipe, slug, minutes: recipe.time, vegetarian: recipe.veg,
        image_path: recipe.image_path === null ? null : 'images/recipes/'+slug+'.webp'
      }))
      .filter(row => normalize(row.title).includes(normalize(args.p_query)) &&
        args.p_terms.every(term => row.ingredients.some(([name]) => normalize(name).includes(normalize(term)))) &&
        (!args.p_category || row.category === args.p_category) &&
        (!args.p_difficulty || row.difficulty === args.p_difficulty) &&
        (!args.p_veg || row.vegetarian) &&
        (!args.p_time || (args.p_time === 61 ? row.minutes > 60 : row.minutes <= args.p_time)) &&
        (!window.smakCatalogExtras || window.smakCatalogExtras(row, {
          cost: args.p_cost, tool: args.p_tool
        })))
      .slice(args.p_offset, args.p_offset+25);
  }
  async function load() {
    const id = ++sequence;
    const p = new URLSearchParams(location.search);
    for (const input of form.elements) if (input.name) {
      if (input.type==='checkbox') input.checked = p.get(input.name)==='1';
      else input.value = p.get(input.name)||'';
    }
    renderChips(p);
    const page = Math.min(100000,Math.max(1,parseInt(p.get('page'),10)||1));
    const terms = (p.get('ingredients')||'').toLocaleLowerCase().split(',').map(t=>t.trim()).filter(Boolean);
    const args = {p_query:p.get('q')||'', p_terms:terms.map(t=>aliases[t]||t), p_category:p.get('category')||'',
      p_time:Number(p.get('time'))||0,p_difficulty:p.get('difficulty')||'',p_veg:p.get('vegetarian')==='1',
      p_cost:p.get('cost')||'',p_tool:p.get('tool')||'',p_offset:(page-1)*24};
    status.textContent = 'Пошук…';
    let data, error;
    try {
      ({data,error} = await api.rpc('search_smak_recipes',args));
    } catch (failure) { error = failure; }
    if (id!==sequence) return;
    nav.replaceChildren();
    grid.replaceChildren();
    if (error || ['localhost', '127.0.0.1'].includes(location.hostname)) data = bundledResults(args);
    const rows = data.slice(0,24);
    grid.append(...rows.map(rowCard));
    status.textContent = rows.length ? 'Рецепти '+(args.p_offset+1)+'–'+(args.p_offset+rows.length) : 'За цими умовами рецептів немає.';
    if (error) nav.append(button('Спробувати ще раз',load));
    if (page>1) nav.append(button('Назад',()=>changePage(page-1)));
    if (data.length>24) nav.append(button('Далі',()=>changePage(page+1)));
  }
  form.addEventListener('submit',e=>{e.preventDefault();update(paramsFromForm());});
  form.addEventListener('reset',()=>setTimeout(()=>update(new URLSearchParams()),0));
  window.addEventListener('popstate',load);
  const options = await api.from('recipe_categories').select('slug,label').order('label');
  if (options.data) {
    const select = form.elements.category;
    select.replaceChildren(select.options[0]);
    for (const category of options.data) {
      categories.set(category.slug,category.label);
      select.add(new Option(category.label,category.slug));
    }
  }
  await load();
})();
