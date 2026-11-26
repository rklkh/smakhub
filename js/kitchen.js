(function () {
  'use strict';

  const lang = (uk, en) => document.documentElement.lang === 'en' ? en : uk;
  const baseline = {
    borshch: ['standard', ['pot', 'pan']],
    syrnyky: ['standard', ['pan']],
    omelet: ['budget', ['pan']],
    carbonara: ['premium', ['pot', 'pan']],
    'greek-salad': ['standard', []],
    pancakes: ['budget', ['pan']],
    'mug-cake': ['budget', ['microwave']],
    deruny: ['budget', ['pan']]
  };
  const kitchens = {
    noheat: [], pan: ['pan'], pot: ['pot'], 'pan-pot': ['pan', 'pot'], microwave: ['microwave']
  };
  const norm = text => String(text ?? '').trim().normalize('NFC').toLocaleLowerCase('uk');
  function node(tag, text, cls) {
    const out = document.createElement(tag);
    if (text !== undefined) out.textContent = text;
    if (cls) out.className = cls;
    return out;
  }

  window.smakCatalogExtras = function (recipe, params) {
    const value = key => typeof params?.get === 'function' ? params.get(key) : params?.[key];
    const cost = value('cost'), tools = value('tool');
    const slug = recipe.slug || Object.keys(window.SMAKHUB_RECIPES || {}).find(id => window.SMAKHUB_RECIPES[id].title === recipe.title);
    const base = Object.hasOwn(baseline, slug) ? baseline[slug] : [];
    if (cost && cost !== (recipe.cost_band ?? base[0])) return false;
    if (!tools) return true;
    const equipment = recipe.cookware ?? base[1];
    return Object.hasOwn(kitchens, tools) && Array.isArray(equipment) && equipment.every(tool => kitchens[tools].includes(tool));
  };

  function addSelect(parent, key, title, options) {
    const group = node('div', undefined, 'form-group');
    const label = node('label', title);
    const select = node('select');
    select.name = key;
    select.id = 'f-' + key;
    label.htmlFor = select.id;
    for (const [value, text] of options) select.add(new Option(text, value));
    select.value = new URLSearchParams(location.search).get(key) || '';
    group.append(label, select);
    parent.append(group);
  }

  const filterGrid = document.querySelector('.filters-grid');
  if (filterGrid && !document.querySelector('#f-cost')) {
    addSelect(filterGrid, 'cost', 'Орієнтовна вартість', [
      ['', 'Будь-яка вартість'], ['budget', 'Бюджетна'], ['standard', 'Середня'], ['premium', 'Вища']
    ]);
    addSelect(filterGrid, 'tool', 'Чим можна готувати', [
      ['', 'Будь-яке обладнання'], ['noheat', 'Без нагрівання'], ['pan', 'Лише сковорода'],
      ['pot', 'Лише каструля'], ['pan-pot', 'Каструля та сковорода'], ['microwave', 'Лише мікрохвильовка']
    ]);
  }

  const localRecipes = window.SMAKHUB_RECIPES || {};
  if (!document.querySelector('#meal-form')) return;

  const id = name => document.getElementById(name);
  const ingredients = [
    ['Яйця', 'Eggs'], ['Молоко', 'Milk'], ['Картопля', 'Potatoes'], ['Борошно', 'Flour'],
    ['Помідори', 'Tomatoes'], ['Сир', 'Cheese'], ['Цибуля', 'Onion'], ['Морква', 'Carrots'],
    ['Буряк', 'Beetroot'], ['Капуста', 'Cabbage'], ['Олія', 'Oil'], ['Какао', 'Cocoa']
  ];
  const selected = new Map();
  const labelFor = name => {
    const standard = ingredients.find(([uk]) => norm(uk) === norm(name));
    return standard ? lang(...standard) : name;
  };
  const selectedProducts = id('basket-items');
  selectedProducts.setAttribute('translate', 'no');
  id('ingredient-options').setAttribute('translate', 'no');
  function renderBasket() {
    id('ingredient-options').replaceChildren(...ingredients.map(([name]) => {
      const button = node('button', labelFor(name), 'btn btn-outline');
      button.type = 'button';
      button.draggable = true;
      button.setAttribute('aria-pressed', String(selected.has(norm(name))));
      button.addEventListener('click', () => {
        const key = norm(name);
        if (selected.has(key)) selected.delete(key);
        else selected.set(key, name);
        renderBasket();
        Array.from(id('ingredient-options').children).find(item => item.textContent === labelFor(name))?.focus();
      });
      button.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-smakhub-ingredient',name);
      });
      return button;
    }));
    selectedProducts.replaceChildren(...Array.from(selected, ([key, name]) => {
      const li = node('li');
      const button = node('button', labelFor(name) + ' ×', 'btn btn-outline');
      button.type = 'button';
      button.setAttribute('aria-label', lang('Прибрати ', 'Remove ') + labelFor(name));
      button.addEventListener('click', () => {
        selected.delete(key);
        renderBasket();
        (selectedProducts.querySelector('button') || id('ingredient-name')).focus();
      });
      li.append(button);
      return li;
    }));
    id('empty-basket').hidden = selected.size > 0;
    const url = new URL('catalog.html', location.href);
    if (selected.size) url.searchParams.set('ingredients', Array.from(selected.values()).join(', '));
    id('find-meals').href = url.href;
  }
  const basket = id('ingredient-basket');
  basket.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes('application/x-smakhub-ingredient')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    basket.classList.add('drag-active');
  });
  basket.addEventListener('dragleave', () => basket.classList.remove('drag-active'));
  basket.addEventListener('drop', event => {
    event.preventDefault();
    basket.classList.remove('drag-active');
    const name = event.dataTransfer.getData('application/x-smakhub-ingredient');
    if (ingredients.some(([item]) => item === name)) {
      selected.set(norm(name), name);
      renderBasket();
    }
  });
  id('ingredient-form').addEventListener('submit', event => {
    event.preventDefault();
    id('ingredient-name').value.split(',').forEach(raw => {
      const item = raw.trim();
      if (item) selected.set(norm(item),item);
    });
    id('ingredient-name').value = '';
    renderBasket();
  });

  const key = 'smakhub:kitchen:plan:v1';
  let menus = [];
  let bought = new Map();
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(saved?.menus)) menus = saved.menus.filter(meal =>
        typeof meal?.id === 'string' && typeof meal.date === 'string' && typeof meal.title === 'string'
        && typeof meal.slug === 'string' && Array.isArray(meal.ingredients)
        && meal.ingredients.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(v=>typeof v==='string'))
      );
      if (Array.isArray(saved?.bought)) bought = new Map(saved.bought);
    } catch {}
  }
  function write() {
    try {
      localStorage.setItem(key, JSON.stringify({menus,bought:Array.from(bought)}));
      id('plan-status').textContent = '';
    } catch {
      id('plan-status').textContent = lang('Браузер не зберіг зміни. План доступний до закриття сторінки.','Your browser could not save changes. This plan is available until you close the page.');
    }
  }
  function quantitySummary(quantities) {
    const sums = new Map(), notes = new Map();
    for (const raw of quantities) {
      const match = /^(\d+(?:[.,]\d+)?)\s+([^\d+]+)$/.exec(raw.trim());
      if (match) {
        const unit = match[2].trim();
        sums.set(unit, (sums.get(unit) || 0) + Number(match[1].replace(',', '.')));
      } else notes.set(raw, (notes.get(raw) || 0) + 1);
    }
    const parts = [...sums].map(([unit, amount]) => new Intl.NumberFormat(document.documentElement.lang).format(amount) + ' ' + unit);
    for (const [note,times] of notes) parts.push(note + (times > 1 ? ' × ' + times : ''));
    return parts.join(' + ');
  }
  function renderPlan() {
    const list = id('meal-list');
    const shopping = new Map();
    list.replaceChildren();
    const sorted = [...menus].sort((a,b) => a.date.localeCompare(b.date));
    for (const meal of sorted) {
      const li = node('li');
      const date = node('time',new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium'}).format(new Date(meal.date+'T12:00:00')));
      date.dateTime = meal.date;
      const link = node('a', meal.title);
      link.href = 'recipe.html?recipe=' + encodeURIComponent(meal.slug);
      const remove = node('button', lang('Видалити', 'Remove'), 'btn btn-outline');
      remove.type = 'button';
      remove.setAttribute('aria-label', lang('Видалити з меню ', 'Remove from menu ') + meal.title);
      remove.addEventListener('click', () => {
        menus = menus.filter(row => row.id !== meal.id);
        renderPlan();
        write();
      });
      li.append(date,link,remove);
      list.append(li);
      for (const [name,quantity] of meal.ingredients) {
        const product = norm(name);
        const row = shopping.get(product) || {name, quantities: []};
        row.quantities.push(quantity);
        shopping.set(product,row);
      }
    }
    if (!menus.length) list.append(node('li', lang('Меню поки порожнє.', 'Your menu is empty.')));
    const rows = [];
    for (const [product,details] of [...shopping].sort(([a],[b])=>a.localeCompare(b,'uk'))) {
      const fingerprint = JSON.stringify(details.quantities.slice().sort());
      const li = node('li'), label = node('label'), input = node('input');
      input.type = 'checkbox';
      input.checked = bought.get(product) === fingerprint;
      if (!input.checked) bought.delete(product);
      input.addEventListener('change', () => {
        if (input.checked) bought.set(product,fingerprint);
        else bought.delete(product);
        write();
      });
      label.append(input,' ',node('span',labelFor(details.name) + ' — ' + quantitySummary(details.quantities)));
      li.append(label);
      rows.push(li);
    }
    for (const product of bought.keys()) if (!shopping.has(product)) bought.delete(product);
    if (!rows.length) rows.push(node('li', lang('Додайте страву до меню, щоб скласти список покупок.', 'Add a dish to your menu to create a shopping list.')));
    id('shopping-list').replaceChildren(...rows);
  }

  const mealSelect = id('meal-recipe');
  let choices = [];
  let latest = 0;
  function fillOptions(rows) {
    const previous = mealSelect.value;
    choices = rows.filter(row => typeof row.slug === 'string' && typeof row.title === 'string');
    mealSelect.replaceChildren(...choices.map(recipe => new Option(recipe.title,recipe.slug)));
    if (choices.some(row=>row.slug === previous)) mealSelect.value = previous;
    id('meal-form').querySelector('[type="submit"]').disabled = !choices.length;
  }
  async function findChoices() {
    const request = ++latest;
    const term = id('meal-search').value.trim();
    const known = Object.entries(localRecipes).map(([slug,recipe])=>({...recipe,slug})).filter(row=>norm(row.title).includes(norm(term)));
    fillOptions(known);
    id('meal-search-status').textContent = '';
    try {
      const api = await window.smakApi;
      if (!api) return;
      let query = api.from('recipes').select('slug,title,ingredients,servings')
        .eq('status','published').order('title').limit(80);
      if (term) query = query.ilike('title','%'+term.replace(/[\\%_]/g,ch=>'\\'+ch)+'%');
      const result = await query;
      if (request !== latest) return;
      if (result.error) throw result.error;
      fillOptions(result.data || []);
      id('meal-search-status').textContent = !choices.length
        ? lang('За цим запитом немає страв.', 'No dishes match your search.')
        : choices.length === 80 ? lang('Уточніть запит, щоб побачити інші страви.', 'Refine your search to find other dishes.') : '';
    } catch {
      if (request === latest) id('meal-search-status').textContent = lang('Показано доступні в цій версії рецепти.','Showing the recipes included in this version.');
    }
  }
  const today = new Date();
  id('meal-date').value = [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  let timeout;
  id('meal-search').addEventListener('input', () => {
    latest++;
    clearTimeout(timeout);
    timeout = setTimeout(findChoices,180);
  });
  id('meal-form').addEventListener('submit', event => {
    event.preventDefault();
    const recipe = choices.find(row=>row.slug===mealSelect.value);
    if (!recipe || !id('meal-date').value) return;
    const pairs = Array.isArray(recipe.ingredients) ? recipe.ingredients.map(item=>Array.isArray(item)
      ? [String(item[0]??''),String(item[1]??'')] : [String(item?.name ?? item),String(item?.amount ?? '')]).filter(pair=>pair[0]) : [];
    menus.push({id:crypto.randomUUID(),date:id('meal-date').value,slug:recipe.slug,title:recipe.title,ingredients:pairs});
    renderPlan();
    write();
  });
  read();
  renderBasket();
  renderPlan();
  findChoices();
  document.addEventListener('smakhub:language', () => { renderBasket(); renderPlan(); });
})();
