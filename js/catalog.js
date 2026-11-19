// Перший робочий пошук: дані восьми карток ЛР2. Після підключення БД джерело буде API.
(function () {
  'use strict';
  var form = document.querySelector('.filters');
  if (!form) return;
  var metadata = {
    borshch: { category: 'lunch', time: 120, difficulty: 'medium', veg: false, ingredients: ['яловичина', 'буряк', 'капуста', 'картопля', 'морква', 'цибуля', 'томатна паста', 'часник', 'олія'] },
    syrnyky: { category: 'breakfast', time: 30, difficulty: 'easy', veg: true, ingredients: ['сир', 'яйця', 'борошно', 'цукор', 'родзинки', 'олія'] },
    omelet: { category: 'breakfast', time: 10, difficulty: 'easy', veg: true, ingredients: ['яйця', 'сир', 'помідори', 'молоко', 'масло'] },
    carbonara: { category: 'dinner', time: 25, difficulty: 'medium', veg: false, ingredients: ['спагеті', 'бекон', 'яйця', 'пармезан'] },
    'greek-salad': { category: 'lunch', time: 15, difficulty: 'easy', veg: true, ingredients: ['помідори', 'огірки', 'перець', 'фета', 'оливки', 'цибуля', 'олія'] },
    pancakes: { category: 'breakfast', time: 30, difficulty: 'easy', veg: true, ingredients: ['молоко', 'яйця', 'борошно', 'цукор', 'олія'] },
    'mug-cake': { category: 'dessert', time: 5, difficulty: 'easy', veg: true, ingredients: ['борошно', 'какао', 'цукор', 'молоко', 'олія', 'розпушувач'] },
    deruny: { category: 'dinner', time: 40, difficulty: 'easy', veg: true, ingredients: ['картопля', 'цибуля', 'яйця', 'борошно', 'олія'] }
  };
  function normalize(value) { return value.trim().toLocaleLowerCase('uk-UA').replace(/[’'ʼ]/g, ''); }
  var aliases = { 'яйце': 'яйця', 'помідор': 'помідори', 'огірок': 'огірки', 'ізюм': 'родзинки', 'кисломолочний сир': 'сир' };
  var items = Array.from(document.querySelectorAll('#results-title ~ .card-grid > li')).map(function (li) {
    var image = li.querySelector('img').getAttribute('src');
    return { li: li, title: normalize(li.querySelector('h3').textContent), data: metadata[image.split('/').pop().replace('.webp', '')] };
  });
  var count = document.querySelector('#results-title + p');
  count.setAttribute('role', 'status');
  var empty = document.createElement('p');
  empty.textContent = 'За цими умовами рецептів немає. Змініть інгредієнти або скиньте фільтри.';
  empty.hidden = true;
  count.after(empty);
  function readUrl() {
    var params = new URLSearchParams(location.search);
    ['q', 'ingredients', 'category', 'time', 'difficulty'].forEach(function (name) { form.elements[name].value = params.get(name) || ''; });
    form.elements.vegetarian.checked = params.get('vegetarian') === '1';
  }
  function apply() {
    var q = normalize(form.elements.q.value);
    var terms = form.elements.ingredients.value.split(',').map(normalize).filter(Boolean).map(function (t) { return aliases[t] || t; });
    var category = form.elements.category.value;
    var time = Number(form.elements.time.value);
    var difficulty = form.elements.difficulty.value;
    var n = 0;
    items.forEach(function (item) {
      var r = item.data;
      var match = r && item.title.includes(q) && (!category || r.category === category) && (!difficulty || r.difficulty === difficulty)
        && (!time || (time === 61 ? r.time > 60 : r.time <= time)) && (!form.elements.vegetarian.checked || r.veg)
        && terms.every(function (t) { return r.ingredients.some(function (i) { return normalize(i).includes(t); }); });
      item.li.hidden = !match;
      if (match) n++;
    });
    count.textContent = 'Знайдено рецептів: ' + n + ' із ' + items.length;
    empty.hidden = n > 0;
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, name) { if (String(value).trim()) params.set(name, String(value).trim()); });
    history.pushState(null, '', location.pathname + (params.size ? '?' + params.toString() : ''));
    apply();
  });
  form.addEventListener('reset', function () {
    setTimeout(function () { history.pushState(null, '', location.pathname); apply(); }, 0);
  });
  window.addEventListener('popstate', function () { readUrl(); apply(); });
  readUrl(); apply();
})();
