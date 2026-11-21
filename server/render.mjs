const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const list = values => (values || []).map(value =>
  '<li>' + escape(Array.isArray(value) ? value.join(' — ') : value) + '</li>').join('');

export function renderRecipe(template,row,origin,photo,category) {
  const url = escape(origin+'/recipes/'+encodeURIComponent(row.slug));
  const title = escape(row.title);
  const description = escape(row.description);
  const levels = {easy:'Легко',medium:'Середньо',hard:'Складно'};
  const facts = [category,(row.minutes || row.time)+' хв',levels[row.difficulty],row.servings];
  let fact = 0;
  return template
    .replace(/(href|src)="((?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:html|css|js|webp|png))"/g,'$1="/$2"')
    .replace(/<title>.*?<\/title>/,()=>'<title>'+title+' — SmakHub</title>')
    .replace(/<meta name="description" content="[^"]*">/,()=>'<meta name="description" content="'+description+'">\n  <link rel="canonical" href="'+url+'">')
    .replace('<article class="recipe" hidden>','<article class="recipe">')
    .replace('<h1>Рецепт</h1>',()=>'<h1>'+title+'</h1>')
    .replace('<li data-crumb></li>',()=>'<li data-crumb>'+title+'</li>')
    .replace('<p class="lead"></p>',()=>'<p class="lead">'+description+'</p>')
    .replace(/<dd><\/dd>/g,()=>'<dd>'+escape(facts[fact++])+'</dd>')
    .replace('<figure class="recipe-photo" hidden>',photo ? '<figure class="recipe-photo">' : '<figure class="recipe-photo" hidden>')
    .replace('<img src="/images/hero.webp" alt="" width="1200" height="800">',()=>photo ? '<img src="'+escape(photo)+'" alt="'+title+'" width="1200" height="800">' : '<img alt="" width="1200" height="800" src="/images/hero.webp" loading="lazy">')
    .replace('<ul></ul>',()=>'<ul>'+list(row.ingredients)+'</ul>')
    .replace('<ol></ol>',()=>'<ol>'+list(row.steps)+'</ol>');
}
