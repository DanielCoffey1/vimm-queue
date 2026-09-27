const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeURL,addURLs,recover,retryAfter}=require('../queue');
const {classifyURL,addInput}=require('../queue');
test('listing URL forms and mixed input',()=>{
  for(const url of ['https://vimm.net/vault/Xbox/A','https://vimm.net/vault/?p=list&system=Xbox&section=number'])assert.equal(classifyURL(url).kind,'listing');
  for(const url of ['https://vimm.net.evil.test/vault/Xbox/A','https://vimm.net/vault/?p=rating&id=1','https://vimm.net/vault/Xbox'])assert.throws(()=>classifyURL(url));
  const state={queue:[],listings:[]};
  const result=addInput(state,'https://vimm.net/vault/1 https://vimm.net/vault/Xbox/A https://vimm.net/vault/Xbox/A invalid');
  assert.deepEqual(result,{added:1,lists:1,duplicates:1,invalid:['invalid']});assert.equal(state.listings[0].status,'queued');
  assert.equal(recover({queue:[],listings:[{status:'waiting'}]}).listings[0].status,'queued');
});
test('only Vimm game URLs; normalize while preserving format query',()=>{
  assert.equal(normalizeURL('http://www.vimm.net/vault/123/?format=rvz'),'https://vimm.net/vault/123?format=rvz');
  for(const bad of ['file:///etc/passwd','https://vimm.net.evil.com/vault/1','https://evil.com/vault/1','https://vimm.net/vault/NES','https://user:pass@vimm.net/vault/1','https://vimm.net:8443/vault/1'])assert.throws(()=>normalizeURL(bad));
});
test('unbounded application queue, deduplication, invalid input reporting',()=>{
  const queue=[];const result=addURLs(queue,Array.from({length:20000},(_,i)=>`https://vimm.net/vault/${i}`).join('\n'));
  assert.equal(result.added,20000);assert.equal(queue.length,20000);
  assert.deepEqual(addURLs(queue,'https://vimm.net/vault/1 invalid'),{added:0,duplicates:1,invalid:['invalid']});
});
test('restart never silently re-downloads an active game',()=>{
  const state=recover({running:true,queue:[{status:'downloading'},{status:'queued'},{status:'complete'}]});
  assert.equal(state.running,false);assert.deepEqual(state.queue.map(x=>x.status),['failed','queued','complete']);
});
test('server retry delays support seconds and dates, with conservative fallback',()=>{
  const now=Date.parse('2026-09-27T12:00:00Z');
  assert.equal(retryAfter('120',now),now+120000);
  assert.equal(retryAfter('Sun, 27 Sep 2026 12:10:00 GMT',now),now+600000);
  assert.equal(retryAfter('nonsense',now),now+300000);
  assert.equal(retryAfter('-1',now),now+30000);
});
