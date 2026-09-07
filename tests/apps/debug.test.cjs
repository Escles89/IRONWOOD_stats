const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

test('debug separates actual cache writes from the original snapshot timestamp',()=>{
  const h=harness();
  h.run("CacheStore.set('inventory',{schema:1,checkedAt:10,allItems:[],items:[]})");
  const first=h.run("CacheStore.get('inventory').updatedAt");
  assert.ok(first>10);
  assert.equal(h.run("debugCacheRows().find(row=>row.key==='inventory').checkedAt"),10);
  assert.equal(h.run("debugCacheRows().find(row=>row.key==='inventory').updatedAt"),first);
  assert.equal(h.run("JSON.parse(localStorage.getItem(CACHE_KEY)).records.inventory.updatedAt"),first);
});

test('debug reports triggers without treating stale usable data as a scheduled refresh',()=>{
  const h=harness();
  h.run("localStorage.setItem(CACHE_LOOKUPS_KEY,'true'); CacheStore.set('inventory',{schema:1,checkedAt:10,expiresAt:20,allItems:[]})");
  let row=h.run("debugCacheRows().find(row=>row.key==='inventory')");
  assert.equal(row.usable,true);
  assert.equal(row.ageBoundary,20);
  assert.match(row.next,/No timed refresh/);
  h.run('AppState.ui.startupSyncAt=Date.now()+2500');
  assert.match(h.run("debugCacheRows().find(row=>row.key==='challenges').next"),/Startup fallback check/);
  h.run("AppState.ui.lookupActivity.push({path:'/inventory',state:'Running',startedAt:Date.now()})");
  assert.match(h.run("debugCacheRows().find(row=>row.key==='inventory').next"),/running now/);
  h.run("AppState.ui.lookupActivity[0].state='Finished'; localStorage.setItem(CACHE_LOOKUPS_KEY,'false')");
  assert.match(h.run("debugCacheRows().find(row=>row.key==='inventory').next"),/disabled/);
});

test('disabled and throttled debug panels do not read or serialize tracked data',()=>{
  const h=harness();
  let removed=0;
  h.context.removeDebug=()=>removed++;
  h.run("AppState.ui.debugPanel={remove:removeDebug}; getCache=()=>{throw Error('Unexpected cache read')}; updateDebugPanel()");
  assert.equal(removed,1);
  assert.equal(h.run('AppState.ui.debugPanel'),null);
  h.run("localStorage.setItem(DEBUG_KEY,'true'); AppState.ui.page={hidden:false}; AppState.ui.debugPanel={isConnected:true}; AppState.ui.debugUpdatedAt=1000; updateDebugPanel(1500)");
  assert.equal(h.run('AppState.ui.debugUpdatedAt'),1000);
});
