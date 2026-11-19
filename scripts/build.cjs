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
