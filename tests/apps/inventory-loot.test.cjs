const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
const loot = [
  {name:'Coins',image:'/assets/misc/coin.png',amount:500},
  {name:'Wood',image:'https://ironwoodrpg.com/assets/items/wood.png?v=1',amount:12},
  {name:'Divine Wisdom Potion',image:'/assets/items/potion-divine-wisdom.png',amount:3},
  {name:'Challenge Scroll',image:'/assets/items/challenge-scroll.png',amount:1}
];
function seed(h) {
  h.run(`CacheStore.set('inventory',{schema:1,allItems:[{key:'wood.png',name:'Wood',image:'/assets/items/wood.png',amount:100,amountText:'100'}],items:[]}); CacheStore.set('challenges',{schema:4,scrollsAvailable:0,autoCompletesRemaining:9});`);
}
test('a confirmed claim adds cached and new items once, synchronizes potions/scrolls, and preserves snapshot age', () => {
  const h=harness(); seed(h);
  const claim=h.context.beginInventoryLootClaim(loot);
  h.time(100500);
  assert.equal(h.context.applyInventoryLootClaim(claim),true);
  assert.equal(h.context.applyInventoryLootClaim(claim),false);
  const cache=h.run('getCache().inventory');
  assert.equal(cache.allItems.find(i=>i.key==='wood.png').amount,112);
  assert.equal(cache.allItems.find(i=>i.key==='wood.png').amountText,'112');
  assert.equal(cache.allItems.some(i=>i.key==='coin.png'),false);
  assert.equal(cache.items[0].amount,3);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'),1);
  assert.equal(cache.checkedAt,100000);
  assert.equal(cache.lootUpdatedAt,100500);
});
test('partial inventory mounts preserve counts and concurrent full snapshots do not double count a claim', () => {
  const h=harness(); seed(h);
  assert.equal(h.context.collectInventory({querySelectorAll:()=>[]}),false);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),100);
  const claim=h.context.beginInventoryLootClaim(loot);
  h.time(100500);
  h.run(`CacheStore.set('inventory',{schema:1,allItems:[{key:'wood.png',amount:112}],items:[]});`);
  assert.equal(h.context.applyInventoryLootClaim(claim),false);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),112);
  assert.equal(h.run("CacheStore.isFresh('inventory')"),false);
});
function flow({confirm=true,restart=true}={}) {
  let now=100000,stage='active',stoppedAt=0,stops=0,starts=0;
  const stop={textContent:'Stop & Loot',disabled:false,click(){stage='pending';stoppedAt=now;stops++;}};
  const start={disabled:false,click(){starts++;stage=restart?'resumed':'stopped';}};
  const document={querySelector(selector){
    if(selector.includes('action-start')) return stage==='stopped'?start:null;
    if(selector.includes('.bars .fill')) return stage==='resumed'?{}:null;
    return null;
  },querySelectorAll(selector){return selector.includes('action-stop')?[stop]:[];}};
  const h=harness({document,console:{error(){}},location:{pathname:'/skill/10/action/67'}});
  seed(h);
  h.context.loot=loot;
  h.run('readLoot=()=>loot; automationEnabled=()=>true; render=()=>{};');
  h.context.setTimeout=(resolve,ms)=>{now+=ms;h.time(now);if(stage==='pending'&&confirm&&now-stoppedAt>=500)stage='stopped';resolve();};
  return {h,stop,starts:()=>starts,stops:()=>stops};
}
test('dashboard Claim updates inventory after confirmation and only then restarts the action',async()=>{
  const {h,starts,stops}=flow();
  await h.context.collectLootAndContinue();
  assert.equal(stops(),1); assert.equal(starts(),1);
  assert.equal(h.run('getCache().inventory.allItems.find(i=>i.key==="wood.png").amount'),112);
  assert.equal(h.run('AppState.ui.pendingLootClaim'),null);
});
test('failed claims never add inventory; successful claims still count if restarting fails',async()=>{
  for(const options of [{confirm:false},{restart:false}]) {
    const {h}=flow(options);
    await h.context.collectLootAndContinue();
    assert.equal(h.run('getCache().inventory.allItems.find(i=>i.key==="wood.png").amount'),options.confirm===false?100:112);
    assert.equal(h.run('AppState.ui.pendingLootClaim'),null);
  }
});
test('native Stop & Loot updates the cache without starting any action',async()=>{
  const {h,stop,starts}=flow();
  const watching=h.context.observeNativeLootClaim();
  stop.click();
  await watching;
  assert.equal(starts(),0);
  assert.equal(h.run('getCache().inventory.allItems.find(i=>i.key==="wood.png").amount'),112);
});
test('native material counts reconcile cached inventory once per actual quantity change',()=>{
  const h=harness(); seed(h);
  const material=available=>[{name:'Wood',image:'/assets/items/wood.png',available}];
  h.context.recordMaterialChanges(material(80));
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),80);
  const revision=h.run('AppState.ui.cacheRevision');
  h.context.recordMaterialChanges(material(80));
  assert.equal(h.run('AppState.ui.cacheRevision'),revision);
  h.context.recordMaterialChanges(material(78));
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),78);
});
