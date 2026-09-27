const crypto = require('node:crypto');
function classifyURL(input) {
  const u = new URL(input.trim());
  if (!['https:', 'http:'].includes(u.protocol) || !['vimm.net','www.vimm.net'].includes(u.hostname) || u.username || u.password || u.port) throw Error('Use a Vimm game or listing URL.');
  if (/^\/vault\/\d+\/?$/.test(u.pathname)) return {kind:'game',url:normalizeURL(input)};
  const pretty=/^\/vault\/[a-z][a-z0-9-]*\/(?:[a-z]|number)\/?$/i.test(u.pathname);
  const query=/^\/vault\/?$/.test(u.pathname) && u.searchParams.get('p')==='list' && /^[a-z][a-z0-9-]*$/i.test(u.searchParams.get('system')||'') && /^(?:[a-z]|number)$/i.test(u.searchParams.get('section')||'');
  if (!pretty && !query) throw Error('Use a game page or a letter/number listing URL.');
  return {kind:'listing',url:'https://vimm.net'+u.pathname+u.search};
}
function addInput(state,text) {
  const result={added:0,duplicates:0,invalid:[],lists:0};
  state.listings ||= [];
  for(const value of text.split(/\s+/).filter(Boolean)) {
    try {
      const parsed=classifyURL(value);
      if(parsed.kind==='game') {const r=addURLs(state.queue,parsed.url);result.added+=r.added;result.duplicates+=r.duplicates;}
      else if(state.listings.some(x=>x.url===parsed.url && x.status!=='failed')) result.duplicates++;
      else {state.listings.push({id:crypto.randomUUID(),url:parsed.url,status:'queued',message:'Waiting to read listing'});result.lists++;}
    } catch {result.invalid.push(value);}
  }
  return result;
}
function normalizeURL(input) {
  const u = new URL(input.trim());
  if (!['https:', 'http:'].includes(u.protocol) || !['vimm.net', 'www.vimm.net'].includes(u.hostname) || u.username || u.password || u.port || !/^\/vault\/\d+\/?$/.test(u.pathname)) throw new Error('Use Vimm game-page URLs such as https://vimm.net/vault/12345');
  return 'https://vimm.net' + u.pathname.replace(/\/$/, '') + u.search;
}
function addURLs(queue, text) {
  const known = new Set(queue.map(x => x.url));
  const invalid = []; let added = 0, duplicates = 0;
  for (const line of text.split(/\s+/).filter(Boolean)) {
    try {
      const url = normalizeURL(line);
      if (known.has(url)) { duplicates++; continue; }
      known.add(url); queue.push({id: crypto.randomUUID(), url, title: `Vault ${new URL(url).pathname.split('/').pop()}`, status: 'queued', message: '', received: 0, total: 0}); added++;
    } catch { invalid.push(line); }
  }
  return {added, duplicates, invalid};
}
function recover(state) {
  state.running = false;
  state.listings ||= [];
  for(const item of state.listings) if(['opening','waiting'].includes(item.status)) {item.status='queued';item.message='Waiting to read listing';}
  for (const item of state.queue) if (['opening', 'waiting', 'downloading'].includes(item.status)) {
    item.status = 'failed'; item.message = 'App closed before completion. Retry manually; partial downloads restart.';
  }
  return state;
}
function retryAfter(value, now = Date.now()) {
  if (!value) return now + 5 * 60 * 1000;
  const seconds = Number(value);
  const result = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  return Math.max(now + 30000, Number.isFinite(result) ? result : now + 5 * 60 * 1000);
}
module.exports = {normalizeURL, addURLs, addInput, classifyURL, recover, retryAfter};
