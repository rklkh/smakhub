'use strict';

window.smakRecipeReady = (async function () {
  const pathSlug = location.pathname.match(/^\/recipes\/([^/]+)\/?$/)?.[1];
  const slug = pathSlug || new URLSearchParams(location.search).get('recipe') || 'borshch';
  const article = document.querySelector('.recipe');
  const missing = document.querySelector('#missing-recipe');
  const api = await window.smakApi;
  const { data:row, error } = await api.from('recipes').select('*').eq('slug',slug).eq('status','published').maybeSingle();
  const fallback = Object.hasOwn(window.SMAKHUB_RECIPES,slug) && window.SMAKHUB_RECIPES[slug];
  const recipe = row || (error && fallback);
  if (!recipe) {
    article.hidden = true;
    missing.hidden = false;
    if (error) missing.querySelector('h1').textContent = 'Не вдалося завантажити рецепт';
    document.title = missing.querySelector('h1').textContent + ' — SmakHub';
    return false;
  }
  const categories = {breakfast:'Сніданок',lunch:'Обід',dinner:'Вечеря',dessert:'Десерт'};
  const difficulty = {easy:'Легко',medium:'Середньо',hard:'Складно'};
  const category = row ? (await api.from('recipe_categories').select('label').eq('slug',row.category).maybeSingle()).data?.label : null;
  document.title = recipe.title + ' — SmakHub';
  document.querySelector('meta[name="description"]').content = recipe.description;
  article.querySelector('h1').textContent = recipe.title;
  document.querySelector('[data-crumb]').textContent = recipe.title;
  article.querySelector('.lead').textContent = recipe.description;
  const facts = [category || categories[recipe.category] || recipe.category, (recipe.minutes || recipe.time) + ' хв', difficulty[recipe.difficulty], recipe.servings];
  article.querySelectorAll('.recipe-facts dd').forEach((el,i) => el.textContent = facts[i]);
  const image = article.querySelector('.recipe-photo img');
  image.src = window.smakImage(row ? row.image_path : 'images/recipes/'+slug+'.webp');
  image.alt = recipe.title;
  function fill(selector,values) {
    article.querySelector(selector).replaceChildren(...values.map(value => {
      const li = document.createElement('li');
      li.textContent = Array.isArray(value) ? value.join(' — ') : value;
      return li;
    }));
  }
  fill('.recipe-ingredients ul',recipe.ingredients);
  fill('.recipe-steps ol',recipe.steps);
  article.querySelector('[data-save-recipe]').dataset.saveRecipe = slug;
  article.hidden = false;
  missing.hidden = true;
  window.smakCurrent = {slug,recipe};
  window.dispatchEvent(new CustomEvent('smak:recipe',{detail:window.smakCurrent}));
  document.dispatchEvent(new CustomEvent('smak:recipe',{detail:window.smakCurrent}));
  return true;
})().catch(() => {
  document.querySelector('#missing-recipe').hidden = false;
  document.querySelector('#missing-recipe h1').textContent = 'Не вдалося завантажити рецепт';
  return false;
});
