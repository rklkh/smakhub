import {renderRecipe} from './render.mjs';
import {project,apiKey} from './public-config.mjs';

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/recipes\/([a-z0-9-]{1,80})\/?$/);
    if (!match || !['GET','HEAD'].includes(request.method)) return env.ASSETS.fetch(request);

    try {
      const endpoint = new URL('/rest/v1/recipes',project);
      endpoint.search = new URLSearchParams({
        select:'slug,title,description,category,minutes,difficulty,servings,ingredients,steps,image_path,recipe_categories(label)',
        slug:'eq.'+match[1],status:'eq.published',limit:'1'
      });
      const result = await fetch(endpoint,{headers:{apikey:apiKey},signal:AbortSignal.timeout(2500)});
      if (!result.ok) throw new Error('Catalog unavailable');
      const [row] = await result.json();
      const html = async path => {
        const response = await env.ASSETS.fetch(new URL(path,url));
        return response.text();
      };
      const headers = {'content-type':'text/html; charset=UTF-8','cache-control':'no-store'};
      if (!row) {
        const body = request.method === 'HEAD' ? null : (await html('/404')).replace(/(href|src)="(?=[a-zA-Z][^:"]*")/g,'$1="/');
        return new Response(body,{status:404,headers});
      }
      let photo = '/images/hero.webp';
      if (/^images\/recipes\/[a-z0-9-]+\.webp$/.test(row.image_path)) photo = '/'+row.image_path;
      if (row.image_path?.startsWith(project+'/storage/v1/object/public/recipe-photos/')) photo = row.image_path;
      const body = request.method === 'HEAD' ? null : renderRecipe(await html('/recipe'),row,url.origin,photo,row.recipe_categories?.label || row.category);
      return new Response(body,{headers});
    } catch {
      return new Response('Каталог тимчасово недоступний.',{status:503,headers:{'Retry-After':'30','Content-Type':'text/plain; charset=utf-8'}});
    }
  }
};
