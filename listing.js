// Collect only visible game links in the listing table, in page order.
function inspectListing() {
  const body=(document.body?.innerText||'').toLowerCase();
  if(/checking if you are human|verify you are human|security check|just a moment/.test(body)) return {kind:'challenge'};
  if(/too many requests|rate limit/.test(body)) return {kind:'limit'};
  const table=document.querySelector('main table.hovertable');
  if(!table) return {kind:'missing'};
  const games=[],seen=new Set();
  for(const a of table.querySelectorAll('a[href]')) {
    if(!a.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    const u=new URL(a.href,location.href);
    if(!['vimm.net','www.vimm.net'].includes(u.hostname) || !/^\/vault\/\d+\/?$/.test(u.pathname)) continue;
    const url='https://vimm.net'+u.pathname.replace(/\/$/,'')+u.search;
    if(seen.has(url))continue;
    seen.add(url);games.push({url,title:a.textContent.trim()});
  }
  return {kind:'ready',games};
}
module.exports=inspectListing;
