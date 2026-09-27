// Run after npm install / pnpm install and Electron's install script.
const fs=require('node:fs');const path=require('node:path');
const target=path.resolve(__dirname,'..','VimmQueue-Windows-1.2.1');
if(fs.existsSync(target))throw Error('Output already exists: '+target);
fs.cpSync(path.join(__dirname,'node_modules','electron','dist'),target,{recursive:true});
fs.renameSync(path.join(target,'electron.exe'),path.join(target,'Vimm Queue.exe'));
const appDir=path.join(target,'resources','app');fs.mkdirSync(appDir,{recursive:true});
for(const file of ['package.json','main.js','queue.js','page.js','listing.js','preload.js','renderer.js','index.html','style.css'])fs.copyFileSync(path.join(__dirname,file),path.join(appDir,file));
fs.copyFileSync(path.join(__dirname,'README.md'),path.join(target,'README.md'));
console.log('Portable app: '+target);
