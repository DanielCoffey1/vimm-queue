const {retryAfter}=require('./queue');
const RETRY_MINUTES=[5,10,20,30];
function planRetry(previousRetries=0, header, now=Date.now()) {
  const count=Number.isInteger(previousRetries) && previousRetries>=0 ? previousRetries : 0;
  const serverUntil=header ? retryAfter(header,now) : now;
  if(count>=RETRY_MINUTES.length)return {exhausted:true,blockedUntil:Math.max(now+30*60000,serverUntil)};
  return {exhausted:false,count:count+1,retryAt:Math.max(now+RETRY_MINUTES[count]*60000,serverUntil)};
}
function relevantResponse(details, webContentsId, clicked) {
  return details.webContentsId===webContentsId && [429,503].includes(details.statusCode) &&
    (details.resourceType==='mainFrame' || (clicked && details.resourceType==='xhr'));
}
module.exports={planRetry,relevantResponse};
