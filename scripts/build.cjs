// Пакуємо тільки публічні файли. SQL, документація, тести, .git і секрети не публікуються.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist);
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))) fs.copyFileSync(path.join(root,name),path.join(dist,name));
for(const name of ['css','js','images']) fs.cpSync(path.join(root,name),path.join(dist,name),{recursive:true,filter:source=>!['.DS_Store','README.md'].includes(path.basename(source))});
console.log('Публічні файли підготовлено в dist/');

(async () => {
  const vm = require('node:vm');
  const publicConfig = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/config.js'),'utf8'),publicConfig);
  const {supabaseUrl,supabasePublishableKey} = publicConfig.window.SMAKHUB_CONFIG;
  fs.writeFileSync(path.join(root,'server/public-config.mjs'),
    'export const project = '+JSON.stringify(supabaseUrl)+';\nexport const apiKey = '+JSON.stringify(supabasePublishableKey)+';\n');
  const {renderRecipe} = await import('../server/render.mjs');
  const recipes = require('../js/recipes.js');
  const template = fs.readFileSync(path.join(root,'recipe.html'),'utf8');
  const category = { breakfast:'Сніданки', lunch:'Обіди', dinner:'Вечері', dessert:'Десерти' };
  const origin = 'https://smakhub.kaliukhromanpc.workers.dev';
  for (const [slug,row] of Object.entries(recipes)) {
    const dir = path.join(dist,'recipes',slug);
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'index.html'),renderRecipe(template,{slug,...row},origin,'/images/recipes/'+slug+'.webp',category[row.category]));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
