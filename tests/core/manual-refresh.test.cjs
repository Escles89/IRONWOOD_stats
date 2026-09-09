const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
function setup(){
 const h=harness();
 h.run(`
 setCacheLookupsEnabled(false); setAutomationEnabled(true);
 globalThis.loads=[]; globalThis.toasts=[];
 syncCacheRefreshButton=()=>{}; render=()=>{}; captureVisibleCaches=()=>{};
 showActionToast=t=>toasts.push(t);
 withPage=async(path,selector,load)=>{loads.push(path);if(!cacheLookupsEnabled())throw Error('lookup disabled');return load({});};
 waitFor=async()=>{}; waitForQuestRows=async()=>{}; collectAdventure=()=>{}; captureAdventureMapDetails=async()=>{};
 divineConsumables=()=>[];storeEquippedDivine=()=>{}; collectTaming=()=>{};collectAttunement=()=>{};collectMastery=()=>{};
 refreshGuildEventSnapshot=async force=>loads.push('event:'+force);
 refreshInventorySnapshot=async force=>loads.push('inventory:'+force);
 refreshChallengesSnapshot=async force=>loads.push('challenges:'+force);
 refreshAutomationsSnapshot=async force=>loads.push('house:'+force);
 refreshGuildTrialSnapshot=async force=>loads.push('trials:'+force);
 completeSelectedQuests=()=>{throw Error('Must not automate quests');};
 automateMaps=()=>{throw Error('Must not create maps');};
 `);
 return h;
}
test('manual refresh reads every source with fallback off without changing that preference',async()=>{
 const h=setup();await h.context.refreshAllCachedData();
 assert.equal(h.run('loads.length'),11);
 assert.equal(h.context.cacheLookupsEnabled(),false);
 assert.equal(h.run('AppState.ui.syncing'),false);
 assert.equal(h.run('toasts[0].kind'),'success');
});
test('manual refresh continues after a source fails and reports it',async()=>{
 const h=setup();h.run("refreshInventorySnapshot=async()=>{throw Error('offline');}");
 await h.context.refreshAllCachedData();
 assert.equal(h.run("loads.includes('trials:true')"),true);
 assert.equal(h.run('AppState.ui.manualCacheRefresh'),false);
 assert.match(h.run('toasts[0].detail'),/Inventory/);
});
test('manual refresh cannot start a second overlapping sync',async()=>{
 const h=setup();h.run('AppState.ui.syncing=true');await h.context.refreshAllCachedData();assert.equal(h.run('loads.length'),0);
});
