const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

function setup({xp=[10,20,30],unconfirmed=-1,missing=-1,selectionFails=-1}={}) {
  const h=harness({console:{error(){}}});
  let active=-1, now=100000, pending=-1, completeAt=0, frameOpen=false;
  const amounts=[...xp], clicks=[],syncs=[];
  const text=textContent=>({textContent});
  const name=i=>`Slot ${i+1}`;
  const slot=i=>({click(){if(selectionFails!==i)active=i;},querySelector(selector){
    if(selector===':scope > .name') return {childNodes:[text(name(i))]};
    if(selector==='.amount') return text(amounts[i]===null?'':String(amounts[i]));
  }});
  const cards=[{querySelector:()=>text('Slots'),querySelectorAll:()=>amounts.map((_,i)=>slot(i))}];
  const button={textContent:'Collect',disabled:false,click(){
    clicks.push(active);pending=active;completeAt=now+450;
    if(missing===active)amounts[active]=null;
  }};
  const doc={
    querySelector:selector=>selector.includes('row-active')&&active>=0?slot(active):null,
    querySelectorAll:selector=>selector==='attunement-page .card'?cards
      :selector==='attunement-page .card > button.row'?amounts.map((_,i)=>slot(i))
      :selector==='attunement-page button'?[button]:[]
  };
  h.context.doc=doc;
  h.context.setTimeout=(resolve,ms)=>{
    now+=ms;h.time(now);
    if(pending>=0&&now>=completeAt&&pending!==unconfirmed&&pending!==missing){amounts[pending]=0;pending=-1;}
    resolve();
  };
  h.context.withPage=async(_path,_selector,task)=>{frameOpen=true;try{return await task(doc);}finally{frameOpen=false;}};
  h.context.synchronizeNativeGame=async()=>{
    assert.equal(frameOpen,false);
    assert.equal(h.run('AppState.ui.collectingAttunementLoot'),true);
    assert.equal(h.run('AppState.ui.actionToasts.length'),0);
    syncs.push([...amounts]);
  };
  h.run("automationEnabled=()=>true;render=()=>{};collectAttunement=async()=>{};");
  return {h,clicks,syncs,amounts};
}

test('Attunement collects all slots then synchronizes the main game before its recap',async()=>{
  const {h,clicks,syncs}=setup();
  await h.context.collectAllAttunementLoot();
  assert.deepEqual(clicks,[0,1,2]);
  assert.deepEqual(syncs,[[0,0,0]]);
  assert.equal(h.run('getCache().attunement.lastClaim.collected'),3);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).kind'),'success');
  assert.equal(h.run('AppState.ui.collectingAttunementLoot'),false);
});

test('partial failure still syncs confirmed and possibly accepted Attunement claims',async()=>{
  const {h,clicks,syncs}=setup({unconfirmed:1});
  await h.context.collectAllAttunementLoot();
  assert.deepEqual(clicks,[0,1]);
  assert.equal(syncs.length,1);
  assert.equal(h.run('getCache().attunement.lastClaim.collected'),1);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).kind'),'warning');
});

test('a loading XP row is not treated as a confirmed collection',async()=>{
  const {h,syncs}=setup({missing:0});
  await h.context.collectAllAttunementLoot();
  assert.equal(syncs.length,1);
  assert.equal(h.run('getCache().attunement.lastClaim.collected'),0);
  assert.match(h.run('getCache().attunement.lastClaim.error'),/did not confirm/);
});

test('a slot selection timeout never collects the wrong slot',async()=>{
  const {h,clicks,syncs}=setup({selectionFails:0});
  await h.context.collectAllAttunementLoot();
  assert.deepEqual(clicks,[]);
  assert.deepEqual(syncs,[]);
  assert.match(h.run('getCache().attunement.lastClaim.error'),/Could not select/);
});

test('empty Attunement slots require no state refresh or hidden inventory read',async()=>{
  const {h,clicks,syncs}=setup({xp:[0,0,0]});
  await h.context.collectAllAttunementLoot();
  assert.deepEqual(clicks,[]);
  assert.deepEqual(syncs,[]);
  assert.equal(h.run('getCache().attunement.lastClaim.collected'),0);
});

test('sync failure keeps confirmed Attunement totals and shows a separate warning',async()=>{
  const {h}=setup();
  h.context.synchronizeNativeGame=async()=>{throw Error('Offline');};
  await h.context.collectAllAttunementLoot();
  assert.equal(h.run('getCache().attunement.lastClaim.collected'),3);
  assert.equal(h.run('getCache().attunement.lastClaim.successful'),true);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).kind'),'warning');
  assert.match(h.run('AppState.ui.actionToasts.at(-1).warning'),/could not sync/);
  assert.equal(h.run('AppState.ui.collectingAttunementLoot'),false);
});

test('Attunement recap preserves exact rewards for each collected category',async()=>{
  const {h}=setup();
  let index=0,restored=0;
  const categories=[['Forest','Farming'],['Mountain','Mining'],['Ocean','Enchanting']];
  h.context.readAttunementRewardCategory=(_doc,_slot,name)=>({name,region:categories[index][0],skill:categories[index][1]});
  h.context.observeAttunementReward=()=>{const i=index++;return {read:()=>({xp:11708+i,shards:i,rewards:[{name:`Reward ${i}`,image:'/assets/items/challenge-scroll.png',amount:5+i}]}),restore(){restored++;}};};
  await h.context.collectAllAttunementLoot();
  assert.equal(restored,3);
  assert.equal(h.run('getCache().attunement.lastClaim.categories[0].xp'),11708);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).groups[0].title'),'Forest · Farming');
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).groups[2].metrics.at(-1).value'),'7');
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).metrics.length'),0);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).groups[0].xp'),'11,708');
});

test('native reward observer forwards one subscription, without duplicating a claim',async()=>{
  const h=harness();
  class Observable {
    constructor(subscribe){this.source=subscribe;}
    subscribe(observer){return this.source(observer);}
  }
  let requests=0,subscriptions=0,unsubscribed=0;
  const response={user:{},exp:11708,points:3,loot:{chest:{amount:2}}};
  const firebase={async lootAttunement(slot){assert.equal(this,firebase);assert.equal(slot,'Forest');requests++;return new Observable(o=>{subscriptions++;o.next(response);o.complete();return {unsubscribe(){unsubscribed++;}};});}};
  const original=firebase.lootAttunement;
  h.context.findNativeSyncRuntime=()=>({firebase,catalog:{chest:{name:'Gold Chest',image:'items/gold-chest.png'}}});
  const receipt=h.context.observeAttunementReward({});
  const stream=await firebase.lootAttunement('Forest');
  assert.equal(subscriptions,0);
  const received=[];
  const subscription=stream.subscribe({next:value=>received.push(value),error:assert.fail,complete(){}});
  assert.equal(requests,1);
  assert.equal(subscriptions,1);
  assert.equal(received[0],response);
  assert.equal(receipt.read().xp,11708);
  assert.equal(receipt.read().rewards[0].amount,2);
  subscription.unsubscribe();assert.equal(unsubscribed,1);
  receipt.restore();assert.equal(firebase.lootAttunement,original);
});

test('native reward errors stay errors and produce no fabricated reward receipt',async()=>{
  const h=harness();
  class Observable {constructor(fn){this.fn=fn;}subscribe(o){return this.fn(o);}}
  const failure=Error('Rejected');
  const firebase={lootAttunement:()=>new Observable(o=>{o.error(failure);})};
  h.context.findNativeSyncRuntime=()=>({firebase});
  const receipt=h.context.observeAttunementReward({});
  const stream=await firebase.lootAttunement('Forest');
  let seen;stream.subscribe({next:assert.fail,error:error=>seen=error,complete:assert.fail});
  assert.equal(seen,failure);
  assert.equal(receipt.read(),null);
  receipt.restore();
});

test('a successful receipt with omitted optional awards reports zero, not unknown',async()=>{
  const h=harness();
  class Observable {constructor(fn){this.fn=fn;}subscribe(o){return this.fn(o);}}
  const firebase={lootAttunement:()=>new Observable(o=>{o.next({user:{},exp:83,loot:{}});o.complete();})};
  h.context.findNativeSyncRuntime=()=>({firebase,catalog:{}});
  const receipt=h.context.observeAttunementReward({});
  const stream=await firebase.lootAttunement('Forest');
  stream.subscribe({next(){},error:assert.fail,complete(){}});
  assert.equal(receipt.read().xp,83);
  assert.equal(receipt.read().shards,0);
  assert.equal(receipt.read().rewards.length,0);
  receipt.restore();
});
