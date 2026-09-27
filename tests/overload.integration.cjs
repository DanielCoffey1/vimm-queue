// Local HTTP fixtures exercise Chromium's real network events. No live site requests.
const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const source=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'vimm-queue-test-'));
async function until(fn,label){const end=Date.now()+16000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(label);}
(async()=>{
  const fixture={hits:[],success:false,active:0,max:0};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');fixture.hits.push(url.pathname);
    const html=body=>{res.setHeader('Content-Type','text/html');res.end(`<html><body>${body}</body></html>`);};
    if(url.pathname==='/vault/1')return html('<h1>Page error fixture</h1><form id="dl_form" action="/error"><button>Download</button></form>');
    if(url.pathname==='/error' && !fixture.success)return html('This server is overloaded. Try back later.');
    if(url.pathname==='/vault/2')return html('<h1>Popup fixture</h1><button onclick="alert(\'This server is overloaded. Try back later.\')">Download</button>');
    if(url.pathname==='/vault/3'){res.writeHead(429,{'Retry-After':'3600'});return res.end('Too many requests');}
    if(url.pathname==='/vault/4')return html('<h1>Image failure fixture</h1><img src="/broken.png"><form id="dl_form" action="/file.zip"><button>Download</button></form>');
    if(url.pathname==='/broken.png'){res.writeHead(503,{'Content-Type':'image/png'});return res.end();}
    if(url.pathname==='/vault/5')return html('<h1>XHR failure fixture</h1><button onclick="fetch(\'/busy\')">Download</button>');
    if(url.pathname==='/busy'){res.writeHead(503);return res.end('Server busy');}
    if(url.pathname==='/error' || url.pathname==='/file.zip') {
      fixture.active++;fixture.max=Math.max(fixture.max,fixture.active);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="fixture.zip"','Content-Length':'5120'});
      let chunks=0;const timer=setInterval(()=>{if(chunks++<5)res.write(Buffer.alloc(1024));else{clearInterval(timer);res.end();}},100);
      res.on('close',()=>{clearInterval(timer);fixture.active--;});return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const launch=()=>_electron.launch({executablePath:require('electron'),args:[source],env:{...process.env,VIMM_QUEUE_TEST:'1',VIMM_QUEUE_TEST_DATA:data,VIMM_QUEUE_TEST_ORIGIN:origin}});
  try{
    const app=await launch();
    try{
      const page=await app.firstWindow();await page.waitForSelector('#urls');
      await app.evaluate(({session},folder)=>{
        global.__vimmTest.getState().folder=folder;
        session.fromPartition('persist:vimm').protocol.handle('https',()=>new Response('Network disabled in local test',{status:403}));
      },path.join(data,'downloads'));
      const cmd=(name,value)=>page.evaluate(([n,v])=>window.queueApp.command(n,v),[name,value]);
      const state=()=>cmd('state');
      const job=async id=>(await state()).queue.find(x=>x.url.endsWith('/'+id));
      const add=async id=>{await cmd('pause');await cmd('add','https://vimm.net/vault/'+id);await app.evaluate((_electron,{origin,id})=>{global.__vimmTest.getState().queue.find(x=>x.url==='https://vimm.net/vault/'+id).url=origin+'/vault/'+id;},{origin,id});};
      const expire=()=>app.evaluate(()=>{const s=global.__vimmTest.getState();s.blockedUntil=0;s.nextAt=0;for(const q of s.queue)q.retryAt=0;});
      await add(1);await cmd('start');
      await until(async()=>(await job(1)).status==='retrying','HTTP 200 overload after click was not handled');
      assert.equal((await job(1)).retryCount,1);assert((await job(1)).retryAt>Date.now()+290000);
      const hits=fixture.hits.length;await app.evaluate(()=>global.__vimmTest.tick());assert.equal(fixture.hits.length,hits);
      await cmd('pause');await expire();await app.evaluate(()=>global.__vimmTest.tick());assert.equal(fixture.hits.length,hits);
      fixture.success=true;await cmd('start');
      await until(async()=>(await job(1)).status==='complete','Retry did not eventually complete');
      assert.equal(fs.statSync(path.join(data,'downloads','fixture.zip')).size,5120);
      await add(2);await expire();await cmd('start');
      await until(async()=>(await job(2)).status==='retrying','Alert overload was not handled');assert.equal((await job(2)).retryCount,1);
      for(let count=2;count<=4;count++){
        await expire();await until(async()=>{const q=await job(2);return q.status==='retrying'&&q.retryCount===count;},'Retry '+count+' was not scheduled');
      }
      await expire();await until(async()=>(await job(2)).status==='failed','Retry cap did not stop requests');assert.equal((await state()).running,false);
      await add(4);await expire();await cmd('start');
      await until(async()=>(await job(4)).status==='complete','Unrelated image response incorrectly stopped download');
      assert.equal((await job(4)).retryCount,undefined);assert.equal(fixture.max,1);
      await add(5);await expire();await cmd('start');
      await until(async()=>(await job(5)).status==='retrying','XHR 503 not handled');await cmd('cancel');
      await add(3);await expire();await cmd('start');
      await until(async()=>(await job(3)).status==='retrying','HTTP 429 not handled');assert((await job(3)).retryAt>Date.now()+3590000);
      await cmd('pause');await cmd('start');await app.evaluate(()=>global.__vimmTest.tick());assert.equal((await job(3)).status,'retrying','Resume bypassed cooldown');
      console.log('PASS: post-click HTML overload, alert overload, bounded retries, pause/resume, Retry-After, XHR 503, unrelated image 503, serial downloads.');
    }finally{await app.close();}
    const reopened=await launch();
    try{
      const page=await reopened.firstWindow();await page.waitForSelector('#urls');const s=await page.evaluate(()=>window.queueApp.command('state'));
      const pending=s.queue.find(x=>x.url.endsWith('/3'));assert.equal(s.running,false);assert.equal(pending.status,'retrying');assert.equal(pending.retryCount,1);assert(pending.retryAt>Date.now());
      console.log('PASS: restart retains pending retry and server cooldown, with queue stopped.');
    }finally{await reopened.close();}
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
