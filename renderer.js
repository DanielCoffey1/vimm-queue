const $=id=>document.getElementById(id);
const bridge=window.queueApp;
const desktopAvailable=typeof bridge?.command==='function' && typeof bridge?.subscribe==='function';
const desktopRequired='Download controls need the desktop app. Extract the entire ZIP and open Vimm Queue.exe. If you already opened the EXE, close it and extract a fresh copy; its desktop connection did not load.';
let latest, page=0;
const PAGE=50;
async function command(name,data) {if(!desktopAvailable){$('feedback').textContent=desktopRequired;return;}try{return await bridge.command(name,data);}catch(e){$('feedback').textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}}
function feedback(result) {if(!result)return; $('feedback').textContent=`${result.added} games added · ${result.lists||0} listings to read · ${result.duplicates} duplicates skipped`+(result.invalid.length?` · ${result.invalid.length} invalid: ${result.invalid.slice(0,3).join(', ')}`:'');}
function bytes(value){return value>=1073741824?(value/1073741824).toFixed(2)+' GB':value>=1048576?(value/1048576).toFixed(1)+' MB':(value/1024).toFixed(1)+' KB';}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function render(state) {
  latest=state; $('folderPath').textContent=state.folder;
  const imports=document.createDocumentFragment();
  for(const list of state.listings||[]) {
    const row=node('div',undefined,'item');const detail=node('div',undefined,'detail');
    detail.append(node('div',list.url,'url'),node('div',list.message,'message'));row.append(detail,node('span',list.status,'badge '+list.status));
    if(['opening','waiting'].includes(list.status)){const show=node('button','Show listing');show.onclick=()=>command('listingShow');row.append(show);}
    if(list.status==='failed'){const retry=node('button','Retry import');retry.onclick=()=>command('listingRetry',list.id);row.append(retry);}
    const remove=node('button',['complete','failed'].includes(list.status)?'Dismiss':'Cancel import');remove.onclick=()=>command('listingRemove',list.id);row.append(remove);imports.append(row);
  }
  $('listings').replaceChildren(imports);
  if(document.activeElement!==$('delay'))$('delay').value=state.delay;
  const active=state.queue.find(x=>['opening','waiting','downloading'].includes(x.status));
  $('count').textContent=state.queue.length;
  $('summary').textContent=`${state.queue.filter(x=>x.status==='queued').length} queued · ${state.queue.filter(x=>x.status==='complete').length} completed · ${state.queue.filter(x=>x.status==='failed').length} need attention`;
  $('start').disabled=state.running || Date.now()<state.blockedUntil;
  $('start').textContent=active?'▶ Resume queue':'▶ Start queue';
  $('pause').disabled=!state.running; $('cancel').disabled=!active; $('show').disabled=!active;
  let notice=active?.message || state.notice;
  const wait=Math.ceil((Math.max(state.nextAt,state.blockedUntil)-Date.now())/1000);
  if(wait>0)notice+=` Waiting ${wait}s.`;
  $('notice').textContent=notice;
  page=Math.min(page,Math.max(0,Math.ceil(state.queue.length/PAGE)-1));
  const fragment=document.createDocumentFragment();
  state.queue.slice(page*PAGE,(page+1)*PAGE).forEach((job,index)=>{
    const row=node('div',undefined,'item'); row.append(node('div',String(page*PAGE+index+1).padStart(2,'0'),'number'));
    const detail=node('div',undefined,'detail');detail.append(node('div',job.title,'title'),node('div',job.url,'url'));
    if(job.message)detail.append(node('div',job.message,'message'));
    if(job.status==='downloading'){
      const progress=node('progress');progress.max=job.total||1;if(job.total)progress.value=job.received;
      detail.append(progress,node('div',bytes(job.received)+(job.total?' / '+bytes(job.total):''),'message'));
    }
    row.append(detail,node('span',job.status,'badge '+job.status));
    if(job.status==='failed'){const retry=node('button','Retry');retry.onclick=()=>command('retry',job.id);row.append(retry);}
    if(job!==active){const remove=node('button','Remove');remove.onclick=()=>command('remove',job.id);row.append(remove);}
    fragment.append(row);
  });
  if(!state.queue.length)fragment.append(node('div','Your queue starts here. Add game-page URLs above.','empty'));
  $('items').replaceChildren(fragment);
  $('pageLabel').textContent=state.queue.length?`Page ${page+1} of ${Math.ceil(state.queue.length/PAGE)}`:'No fixed queue limit';
  $('prev').disabled=page===0;$('next').disabled=(page+1)*PAGE>=state.queue.length;
}
$('add').onclick=async()=>{const text=$('urls').value;const r=await command('add',text);feedback(r);if(r)$('urls').value=r.invalid.join('\n');};
$('import').onclick=async()=>feedback(await command('import'));
for(const id of ['start','pause','cancel','folder','openFolder','show','export','clear'])$(id).onclick=()=>command(id);
$('openVimm').onclick=event=>{if(desktopAvailable){event.preventDefault();command('openVimm');}};
$('delay').onchange=()=>command('delay',Number($('delay').value));
$('prev').onclick=()=>{page--;render(latest);};$('next').onclick=()=>{page++;render(latest);};
if(desktopAvailable){bridge.subscribe(render);command('state').then(state=>{if(state)render(state);});}
else {
  $('feedback').textContent=desktopRequired;
  $('notice').textContent='Browser preview — launch Vimm Queue.exe to use the download queue.';
  for(const control of document.querySelectorAll('button, textarea, input'))control.disabled=true;
}
setInterval(()=>{if(latest)render(latest);},1000);
