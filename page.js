// Executed only in the sandboxed Vimm page. No direct download URL extraction.
function inspectPage(click) {
  // Turn only recognized transient server alerts into app-readable status.
  // Other alerts keep their normal behavior. This does not alter the request.
  if(typeof window!=='undefined' && !window.__vimmQueueAlertInstalled) {
    const originalAlert=window.alert;
    window.alert=function(message) {
      const text=String(message);
      if(/this server is overloaded|too many requests|finish your current downloads?|already downloading|one download at a time/i.test(text)) {
        window.__vimmQueueServerAlert=text;
        let note=document.getElementById('vimm-queue-server-message');
        if(!note){note=document.createElement('p');note.id='vimm-queue-server-message';note.setAttribute('role','alert');document.body.prepend(note);}
        note.textContent=text;
        return;
      }
      return originalAlert.apply(window,arguments);
    };
    window.__vimmQueueAlertInstalled=true;
  }
  const body = document.body?.innerText || '';
  const text = (body+' '+(typeof window!=='undefined'?window.__vimmQueueServerAlert||'':'')).toLowerCase();
  const title = document.querySelector('h1')?.textContent?.trim() || document.title;
  if (/server is overloaded|server.*temporarily unavailable|server.*too busy/.test(text)) return {kind:'overload', title};
  if (/checking if you are human|verify you are human|security check|just a moment/.test(text)) return {kind:'challenge', title};
  if (/too many requests|finish your current download|download limit|already downloading|one download at a time|please wait.*download/.test(text)) return {kind:'limit', title};
  if (/download.*(?:removed|unavailable|disabled)|not available for download|at the request of/.test(text)) return {kind:'unavailable', title};
  // Prefer the site's download form. Exact button text avoids mirror/ad links.
  const forms = [...document.forms].filter(f => /^(dl_form|download-form|download_form)$/i.test(f.id || f.name) || f.querySelector('[name="mediaId"]'));
  let buttons = forms.flatMap(f => [...f.querySelectorAll('button, input[type="submit"]')]);
  if (!buttons.length) buttons = [...document.querySelectorAll('button, input[type="submit"]')];
  buttons = buttons.filter(b => /^download(?:\s*\([^)]*\))?$/i.test((b.innerText || b.value || '').trim()) && !b.disabled && b.getClientRects().length);
  if (buttons.length !== 1) return {kind:'manual', title};
  if (click) buttons[0].click();
  return {kind:click ? 'clicked' : 'ready', title};
}
module.exports = inspectPage;
