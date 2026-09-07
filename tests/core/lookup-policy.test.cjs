const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
test('expired usable snapshots do not trigger hidden reads; explicit refresh and missing data can',async()=>{
  const h=harness();
  h.run(`cacheLookupsEnabled=()=>true; globalThis.loads=0; globalThis.loader=()=>{loads++;CacheStore.set('inventory',{schema:1,allItems:[]});}; CacheStore.set('inventory',{schema:1,allItems:[],expiresAt:100001});`);
  h.time(1e9);
  assert.equal(h.run("CacheStore.isFresh('inventory')"),false);
  assert.equal(h.run("needsLookup('inventory')"),false);
  await h.run("SyncCoordinator.refresh('inventory',{load:loader})");
  assert.equal(h.run('loads'),0);
  await h.run("SyncCoordinator.refresh('inventory',{force:true,load:loader})");
  assert.equal(h.run('loads'),1);
  h.run("CacheStore.invalidate('inventory')");
  await h.run("SyncCoordinator.refresh('inventory',{load:loader})");
  assert.equal(h.run('loads'),2);
});
test('opening feature panels reuses old snapshots without creating hidden pages',async()=>{
  const h=harness();
  h.run(`cacheLookupsEnabled=()=>true; render=()=>{}; withPage=()=>{throw Error('Unexpected hidden lookup');};
    CacheStore.set('challenges',{schema:4,scrollsAvailable:1,autoCompletesRemaining:9,expiresAt:100001});
    CacheStore.set('taming',{schema:2,expiresAt:100001});
    CacheStore.set('automations',{schema:4,structures:[],expiresAt:100001});
    CacheStore.set('guildEvent',{schema:9,state:'Completed',expiresAt:100001});
    CacheStore.set('guildTrial',{schema:4,state:'Available',refreshAt:100001,expiresAt:100001});
    CacheStore.set('adventure',{schema:11,state:'Idle',researchPoints:100,mapCost:10,dailyMapsCreated:1,dailyMapsLimit:9,mapsStored:2,mapStorageLimit:20,expiresAt:100001});
  `);
  h.time(1e9);
  await h.context.refreshChallengesSnapshot();
  await h.context.refreshTamingSnapshot();
  await h.context.refreshAutomationsSnapshot();
  await h.context.refreshGuildEventSnapshot();
  await h.context.refreshGuildTrialSnapshot();
  await h.context.refreshAdventureSnapshot();
});
test('known daily resets are calculated without changing observed inventory or fetching new data',()=>{
  const h=harness();
  const cache={quests:{day:'1970-01-01',completed:5,dailyComplete:true,quests:[{done:true}]},
    challenges:{checkedAt:100000,scrollsAvailable:3,autoCompletesUsed:10,autoCompletesLimit:10,autoCompletesRemaining:0,dailyScrollsUsed:15},
    adventure:{checkedAt:100000,dailyMapsCreated:9,mapsComplete:true,mapsStored:4},
    inventory:{allItems:[{key:'wood.png',amount:50}]}};
  const next=h.context.projectStatusCache(cache,100000000);
  assert.equal(next.quests.completed,0);
  assert.equal(next.challenges.autoCompletesRemaining,10);
  assert.equal(next.challenges.scrollsAvailable,3);
  assert.equal(next.adventure.dailyMapsCreated,0);
  assert.equal(next.adventure.mapsStored,4);
  assert.equal(next.inventory,cache.inventory);
  assert.equal(cache.quests.completed,5);
  assert.equal(cache.challenges.autoCompletesRemaining,0);
});
