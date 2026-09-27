const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planRetry,relevantResponse}=require('../retry');
const {recover}=require('../queue');
const inspectPage=require('../page');
test('backoff is 5, 10, 20, 30 minutes and then stops',()=>{
  const now=1000000;
  for(const [index,minutes] of [5,10,20,30].entries())assert.deepEqual(planRetry(index,null,now),{exhausted:false,count:index+1,retryAt:now+minutes*60000});
  assert.equal(planRetry(4,null,now).exhausted,true);
});
test('server cooldown takes precedence over shorter application retry',()=>{
  const now=Date.parse('2026-09-27T12:00:00Z');
  assert.equal(planRetry(0,'3600',now).retryAt,now+3600000);
  assert.equal(planRetry(0,'1',now).retryAt,now+300000);
  assert.equal(planRetry(4,'3600',now).blockedUntil,now+3600000);
});
test('ad/image responses cannot trigger game retries',()=>{
  const detail={webContentsId:5,statusCode:503,resourceType:'image'};
  assert.equal(relevantResponse(detail,5,true),false);
  assert.equal(relevantResponse({...detail,resourceType:'mainFrame'},5,false),true);
  assert.equal(relevantResponse({...detail,resourceType:'xhr'},5,false),false);
  assert.equal(relevantResponse({...detail,resourceType:'xhr'},5,true),true);
  assert.equal(relevantResponse({...detail,resourceType:'mainFrame'},9,true),false);
});
test('pending retries survive restart but do not start themselves',()=>{
  const state=recover({queue:[{status:'retrying',retryCount:2,retryAt:12345}],running:true,blockedUntil:12345});
  assert.equal(state.running,false);assert.equal(state.queue[0].retryAt,12345);assert.equal(state.queue[0].retryCount,2);assert.equal(state.blockedUntil,12345);
});
test('exact overload text is detected on an HTTP-success error page',()=>{
  global.document={body:{innerText:'This server is overloaded. Try back later.'},querySelector:()=>null,title:'Download'};
  try{assert.equal(inspectPage(false).kind,'overload');}finally{delete global.document;}
});
