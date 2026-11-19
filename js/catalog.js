(async function () {
  'use strict';
  const form = document.querySelector('.filters');
  const grid = document.querySelector('#results-title ~ .card-grid');
  const status = document.querySelector('#results-title + p');
  const nav = document.createElement('nav');
  nav.className = 'form-actions';
  nav.setAttribute('aria-label','Сторінки каталогу');
  grid.after(nav);
  status.setAttribute('role','status');
  const api = await window.smakApi;
  const categories = new Map();
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
    article.append(link,body);
    item.append(article);
    return item;
  }
  function button(label,action) {
    const button = element('button',label,'btn btn-outline');
    button.type = 'button';
    button.addEventListener('click',action);
    return button;
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
  async function load() {
    const id = ++sequence;
    const p = new URLSearchParams(location.search);
    for (const input of form.elements) if (input.name) {
      if (input.type==='checkbox') input.checked = p.get(input.name)==='1';
      else input.value = p.get(input.name)||'';
    }
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
    if (error) {
      status.textContent = 'Не вдалося завантажити каталог.';
      nav.append(button('Спробувати ще раз',load));
      return;
    }
    const rows = data.slice(0,24);
    grid.append(...rows.map(rowCard));
    status.textContent = rows.length ? 'Рецепти '+(args.p_offset+1)+'–'+(args.p_offset+rows.length) : 'За цими умовами рецептів немає.';
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
