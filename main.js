const {app, BrowserWindow, ipcMain, dialog, session, shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {addURLs, addInput, recover, retryAfter} = require('./queue');
const inspectPage = require('./page');
const inspectListing = require('./listing');
const TEST = process.env.VIMM_QUEUE_TEST === '1' && !app.isPackaged;
if (TEST) app.setPath('userData', process.env.VIMM_QUEUE_TEST_DATA);
let ui, browser, active, download, timer, inspecting = false, quitting = false, store;
let listing, listWindow, listNextAt=0;
let state = {queue:[], listings:[], running:false, folder:'', delay:30, nextAt:0, blockedUntil:0, notice:'Ready. Paste game or listing URLs to begin.'};
function finishListing(status,message) {
  if(listing){listing.status=status;listing.message=message;}
  listing=null;
  if(listWindow && !listWindow.isDestroyed())listWindow.destroy();
  listWindow=null;listNextAt=Date.now()+15000;save();
}
async function tickListing() {
  if(!listing) {
    if(Date.now()<Math.max(listNextAt,state.blockedUntil))return;
    listing=state.listings.find(x=>x.status==='queued');if(!listing)return;
    listing.status='opening';listing.message='Reading game links…';save();
    const job=listing;
    listWindow=new BrowserWindow({show:!TEST,width:1050,height:800,title:'Vimm Queue — listing',autoHideMenuBar:true,webPreferences:{partition:'persist:vimm',nodeIntegration:false,contextIsolation:true,sandbox:true}});
    listWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const event of ['will-navigate','will-redirect'])listWindow.webContents.on(event,(e,url)=>{if(!trusted(url))e.preventDefault();});
    listWindow.on('closed',()=>{listWindow=null;if(!quitting && listing===job)finishListing('failed','Listing window closed. Retry when ready.');});
    listWindow.loadURL(job.url).catch(e=>{if(listing===job && e.code!=='ERR_ABORTED')finishListing('failed','Could not load listing: '+e.message);});
    return;
  }
  if(!listWindow || listWindow.isDestroyed() || listWindow.webContents.isLoadingMainFrame())return;
  const job=listing;
  const result=await listWindow.webContents.executeJavaScript(`(${inspectListing.toString()})()`);
  if(listing!==job)return;
  if(result.kind==='challenge') {job.status='waiting';job.message='Complete the human check in the listing window.';emit();return;}
  if(result.kind==='limit') {state.blockedUntil=Math.max(state.blockedUntil,Date.now()+300000);finishListing('failed','Site rate limit. Wait five minutes before retrying.');return;}
  if(result.kind!=='ready') {finishListing('failed','No game listing table found. Check the URL and retry.');return;}
  const known=new Set(state.queue.map(x=>x.url));
  const r=addURLs(state.queue,result.games.map(x=>x.url).join('\n'));
  const titles=new Map(result.games.map(x=>[x.url,x.title]));
  for(const game of state.queue)if(!known.has(game.url) && titles.has(game.url))game.title=titles.get(game.url)||game.title;
  finishListing('complete',`${r.added} games added · ${r.duplicates} duplicates skipped`);
}
const trusted = raw => { try { const u=new URL(raw); return u.protocol==='https:' && (u.hostname==='vimm.net' || u.hostname.endsWith('.vimm.net')); } catch {return false;} };
function emit() { if (ui && !ui.isDestroyed()) ui.webContents.send('state', state); }
function save() {
  try { fs.writeFileSync(store+'.tmp', JSON.stringify(state, null, 2)); fs.renameSync(store+'.tmp', store); }
  catch (e) { state.running=false; state.notice='Could not save queue: '+e.message; }
  emit();
}
function stopBrowser() { if (browser && !browser.isDestroyed()) browser.destroy(); browser=null; }
function fail(message) {
  if (active) { active.status='failed'; active.message=message; }
  active=null; download=null; state.running=false; state.notice=message; stopBrowser(); save();
}
function hold(message) { state.running=false; state.notice=message; if(active) active.message=message; save(); }
function safeName(value) {
  let name=path.basename(value.replace(/\\/g,'/')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,180);
  if (!name || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name='game-'+name;
  return name;
}
function uniquePath(name) {
  const parts=path.parse(safeName(name)); let result=path.join(state.folder, parts.base), n=1;
  while(fs.existsSync(result)) result=path.join(state.folder, `${parts.name} (${n++})${parts.ext}`);
  return result;
}
function acceptDownload(event, item, contents) {
  if (!active || download || !browser || contents!==browser.webContents || !trusted(item.getURL()) || !['opening','waiting'].includes(active.status)) { event.preventDefault(); return; }
  if (!/\.(zip|7z|rar|iso|bin|cue|chd|rvz|wbfs|nkit|gz|z64|n64|v64|nes|sfc|smc|gba|gbc|gb|nds|3ds|a26|rom)$/i.test(item.getFilename())) {
    event.preventDefault(); fail('Unexpected file type. Download stopped; inspect the game page in your usual browser.'); return;
  }
  const job=active;
  try { fs.mkdirSync(state.folder,{recursive:true}); item.setSavePath(uniquePath(item.getFilename())); }
  catch(e) {event.preventDefault(); fail('Cannot save download: '+e.message); return;}
  download=item; job.status='downloading'; job.filename=item.getSavePath(); job.message='Downloading'; save();
  item.on('updated', (_e,status) => {
    job.received=item.getReceivedBytes(); job.total=item.getTotalBytes();
    if(status==='interrupted') {job.message='Connection interrupted. Queue paused; cancel and retry when ready.'; state.running=false;}
    emit();
  });
  item.once('done', (_e,status) => {
    if(quitting) return;
    job.received=item.getReceivedBytes(); job.total=item.getTotalBytes();
    if(status!=='completed') {fail('Download '+status+'. Queue paused. Retry this item when ready.'); return;}
    job.status='complete'; job.message='Saved'; active=null; download=null;
    state.nextAt=Date.now()+state.delay*1000; state.notice='Download complete. Waiting before the next game.';
    stopBrowser(); save();
  });
}
async function tick() {
  if(inspecting || quitting) return;
  inspecting=true;
  try {
    if(!active && (listing || state.listings.some(x=>x.status==='queued'))) {await tickListing();return;}
    if(active) {
      if(!browser || browser.isDestroyed()) {if(!download) fail('Game window closed. Queue paused.'); return;}
      if(download || !state.running || active.clicked || browser.webContents.isLoadingMainFrame()) return;
      const job=active;
      const result=await browser.webContents.executeJavaScript(`(${inspectPage.toString()})(false)`);
      if(active!==job) return;
      if(result.title) job.title=result.title.replace(/^Vimm.s Lair:\s*/i,'');
      job.status='waiting';
      if(result.kind==='limit') {state.blockedUntil=Math.max(state.blockedUntil,Date.now()+300000); hold('Vimm reports a download limit. Wait at least five minutes, then resume.'); return;}
      if(result.kind==='unavailable') {fail('This game is unavailable for download. Remove it or retry later.'); return;}
      if(result.kind==='ready') {
        job.clicked=true; job.message='Waiting for the download to begin. If needed, use Show game page.'; save();
        await browser.webContents.executeJavaScript(`(${inspectPage.toString()})(true)`, true);
      } else {
        const msg=result.kind==='challenge' ? 'Complete the human check in the game window; the queue will continue.' : 'Waiting for a Download button. Use Show game page to select a format or start manually.';
        if(job.message!==msg) {job.message=msg; save();}
      }
      return;
    }
    if(!state.running || Date.now()<Math.max(state.nextAt,state.blockedUntil)) return;
    const job=state.queue.find(x=>x.status==='queued');
    if(!job) {state.running=false; state.notice='Queue finished.'; save(); return;}
    active=job; job.status='opening'; job.clicked=false; job.message='Opening game page'; save();
    browser=new BrowserWindow({show:!TEST,width:1050,height:800,title:'Vimm Queue — game page',autoHideMenuBar:true,webPreferences:{partition:'persist:vimm',nodeIntegration:false,contextIsolation:true,sandbox:true}});
    browser.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    browser.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();});
    browser.webContents.on('will-redirect',(event,url)=>{if(!trusted(url))event.preventDefault();});
    browser.on('close',event=>{if(download){event.preventDefault(); browser.hide();}});
    browser.on('closed',()=>{browser=null;});
    browser.webContents.on('render-process-gone',()=>{if(!download)fail('Game page stopped responding. Retry when ready.');});
    browser.loadURL(job.url).catch(e=>{if(active===job && !download && e.code!=='ERR_ABORTED')fail('Could not load game page: '+e.message);});
  } catch(e) { if(listing)finishListing('failed','Could not read listing: '+e.message);else if(active && !download) hold('Could not inspect page. Show the game page, then resume: '+e.message); }
  finally { inspecting=false; }
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{ui?.show(); ui?.focus();});
  app.whenReady().then(()=>{
    store=path.join(app.getPath('userData'),'queue.json');
    state.folder=path.join(app.getPath('downloads'),'Vimm Queue');
    try { if(fs.existsSync(store)) {const loaded=JSON.parse(fs.readFileSync(store,'utf8')); if(!Array.isArray(loaded.queue))throw Error('Invalid queue'); state=recover({...state,...loaded});} }
    catch(e) {dialog.showErrorBox('Saved queue could not be read', 'The original file is preserved. '+e.message); app.quit(); return;}
    const ses=session.fromPartition('persist:vimm');
    ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    ses.setPermissionCheckHandler(()=>false);
    ses.on('will-download',acceptDownload);
    ses.webRequest.onHeadersReceived({urls:['https://vimm.net/*','https://*.vimm.net/*']},(details,callback)=>{
      callback({cancel:false});
      if((!active && !listing) || ![429,503].includes(details.statusCode)) return;
      const headers=details.responseHeaders || {};
      const key=Object.keys(headers).find(k=>k.toLowerCase()==='retry-after');
      state.blockedUntil=Math.max(state.blockedUntil,retryAfter(headers[key]?.[0]));
      if(listing){finishListing('failed',`Server returned ${details.statusCode}. Retry after ${new Date(state.blockedUntil).toLocaleTimeString()}.`);return;}
      hold(`Server returned ${details.statusCode}. Queue paused until at least ${new Date(state.blockedUntil).toLocaleTimeString()}.`);
    });
    ui=new BrowserWindow({show:!TEST,width:1120,height:820,minWidth:800,minHeight:600,backgroundColor:'#10151c',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    ui.webContents.setWindowOpenHandler(({url})=>{
      if(url==='https://vimm.net/')shell.openExternal(url).catch(e=>dialog.showErrorBox('Could not open browser',e.message));
      return {action:'deny'};
    });
    ui.webContents.on('will-navigate',e=>e.preventDefault());
    const uiURL=pathToFileURL(path.join(__dirname,'index.html')).href;
    ipcMain.handle('command',async(event,command,data)=>{
      if(event.sender!==ui.webContents || event.senderFrame.url!==uiURL) throw Error('Untrusted sender');
      let result;
      switch(command) {
        case 'state': return state;
        case 'openVimm': await shell.openExternal('https://vimm.net/'); return;
        case 'add': if(typeof data!=='string')throw Error('Invalid URLs'); result=addInput(state,data); break;
        case 'listingShow': listWindow?.show();listWindow?.focus();break;
        case 'listingRemove': if(listing?.id===data)finishListing('failed','Import cancelled.');state.listings=state.listings.filter(x=>x.id!==data);break;
        case 'listingRetry': {const job=state.listings.find(x=>x.id===data);if(job?.status==='failed'){job.status='queued';job.message='Waiting to read listing';}break;}
        case 'start':
          if(Date.now()<state.blockedUntil)throw Error('Server cooldown is still active.');
          fs.mkdirSync(state.folder,{recursive:true}); fs.accessSync(state.folder,fs.constants.W_OK);
          state.running=true; state.notice='Queue running — one download at a time.'; break;
        case 'pause': state.running=false; state.notice='Paused. An active download will finish; the next will wait.'; break;
        case 'cancel': if(download)download.cancel(); else if(active)fail('Cancelled. Queue paused.'); break;
        case 'retry': {const job=state.queue.find(x=>x.id===data); if(job?.status==='failed'){job.status='queued';job.message='';job.received=0;job.total=0;job.clicked=false;} break;}
        case 'remove': state.queue=state.queue.filter(x=>x.id!==data || x===active); break;
        case 'clear': state.queue=state.queue.filter(x=>x.status!=='complete'); break;
        case 'folder': if(active)throw Error('Pause and finish or cancel the active item before changing folder.'); {const pick=await dialog.showOpenDialog(ui,{properties:['openDirectory','createDirectory'],defaultPath:state.folder}); if(!pick.canceled)state.folder=pick.filePaths[0];} break;
        case 'delay': if(!Number.isFinite(data))throw Error('Invalid delay'); state.delay=Math.max(15,Math.min(3600,Math.round(data))); break;
        case 'show': browser?.show(); browser?.focus(); break;
        case 'openFolder': fs.mkdirSync(state.folder,{recursive:true}); await shell.openPath(state.folder); break;
        case 'import': {const p=await dialog.showOpenDialog(ui,{filters:[{name:'URL list',extensions:['txt']}],properties:['openFile']}); if(!p.canceled)result=addInput(state,fs.readFileSync(p.filePaths[0],'utf8')); break;}
        case 'export': {const p=await dialog.showSaveDialog(ui,{defaultPath:'vimm-queue.txt'}); if(!p.canceled)fs.writeFileSync(p.filePath,state.queue.filter(x=>x.status!=='complete').map(x=>x.url).join('\r\n')); break;}
        default: throw Error('Unknown command');
      }
      save(); return result;
    });
    ui.loadFile(path.join(__dirname,'index.html'));
    ui.on('close',event=>{
      if(download && dialog.showMessageBoxSync(ui,{type:'question',buttons:['Keep downloading','Quit and cancel'],defaultId:0,cancelId:0,message:'A download is active. Quitting cancels it; retrying later starts over.'})===0){event.preventDefault();return;}
      quitting=true; state.running=false; save(); clearInterval(timer); stopBrowser(); if(listWindow)listWindow.destroy(); app.quit();
    });
    save(); timer=setInterval(tick,1500);
    if(TEST) global.__vimmTest={getState:()=>state,acceptDownload,setActive:(job,window)=>{state.queue.push(job);active=job;browser=window;},tick};
  });
}
app.on('window-all-closed',()=>app.quit());
