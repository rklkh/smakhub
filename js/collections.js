(async function () {
  const section = document.getElementById('curated');
  if (!section) return;
  const api = await window.smakApi;
  const {data} = await api.from('recipe_collections').select('title,recipe_ids').limit(20);
  if (!data?.length) return;
  const ids = [...new Set(data.flatMap(group=>group.recipe_ids))];
  if (!ids.length) return;
  const {data:recipes} = await api.from('recipes').select('id,title,slug').in('id',ids).eq('status','published');
  const byId = new Map((recipes||[]).map(r=>[r.id,r]));
  for (const group of data) {
    const list = document.createElement('ul');
    list.className = 'category-list';
    for (const id of group.recipe_ids) {
      const recipe = byId.get(id);
      if (!recipe) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.textContent = recipe.title;
      a.href = window.smakRecipeHref(recipe.slug);
      li.append(a); list.append(li);
    }
    if (list.childElementCount) {
      const h = document.createElement('h2');
      h.textContent = group.title;
      section.append(h,list); section.hidden = false;
    }
  }
})();
