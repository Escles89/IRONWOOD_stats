const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

function setup() {
  const calls=[];
  const h=harness({setTimeout,clearTimeout});
  const previous={name:'Test',coins:900,inventory:{scroll:{amount:1}}};
  const user={name:'Test',coins:700,inventory:{scroll:{amount:0},chest:{amount:2}}};
  const runtime={
    state:{user:previous,isSolo:false,syncUser(value){calls.push('user');this.user=value;}},
    firebase:{getUser(){calls.push('fetch');return Promise.resolve({subscribe(observer){observer.next({user,time:100000});observer.complete();return {unsubscribe(){}};}});}},
    action:{handleActionSync(time){calls.push(`action:${time}`);}},
    automations:{handleAutomationSync(time){calls.push(`automations:${time}`);}},
    expedition:{handleExpeditionSync(time){calls.push(`expedition:${time}`);}},
    zone:{run:fn=>fn()},
    catalog:{scroll:{name:'Challenge Scroll',image:'items/challenge-scroll.png'},chest:{name:'Gold Chest',image:'items/gold-chest.png'}}
  };
  h.context.findNativeSyncRuntime=()=>runtime;
  return {h,runtime,calls,user};
}

test('native sync reconciles all game loops and caches exact rewards without navigating',async()=>{
  const {h,runtime,calls,user}=setup();
  const first=h.context.synchronizeNativeGame();
  assert.equal(first,h.context.synchronizeNativeGame());
  await first;
  assert.deepEqual(calls,['fetch','user','action:100000','automations:100000','expedition:100000']);
  assert.equal(runtime.state.user,user);
  assert.equal(h.run('getCache().inventory.allItems.length'),1);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),2);
  assert.equal(h.run('getCache().inventory.allItems[0].approximate'),false);
  assert.equal(h.run('location.pathname'),'/status');
  assert.equal(h.run('AppState.ui.nativeSync.running'),false);
});

test('native sync refuses to apply an invalid response or another character',async()=>{
  for(const response of [{user:{name:'Other',inventory:{}},time:1},{user:{name:'Test'},time:1},{user:{name:'Test',inventory:{}}}, {user:{name:'Test',inventory:{}},time:null}, {user:{name:'Test',inventory:{}},time:true}, {user:{name:'Test',inventory:{}},time:'invalid'}]){
    const {h,runtime,calls}=setup();
    runtime.firebase.getUser=()=>({subscribe(o){o.next(response);return {unsubscribe(){}};}});
    await assert.rejects(h.context.synchronizeNativeGame());
    assert.deepEqual(calls,[]);
    assert.equal(runtime.state.user.coins,900);
  }
});

test('network failure leaves game values intact and allows a later retry',async()=>{
  const {h,runtime,calls}=setup();
  const good=runtime.firebase.getUser;
  runtime.firebase.getUser=()=>({subscribe(o){o.error(Error('Offline'));return {unsubscribe(){}};}});
  await assert.rejects(h.context.synchronizeNativeGame(),/Offline/);
  assert.equal(runtime.state.user.coins,900);
  assert.deepEqual(calls,[]);
  runtime.firebase.getUser=good;
  await h.context.synchronizeNativeGame();
  assert.equal(runtime.state.user.coins,700);
});

test('a timed out native request is unsubscribed and late data cannot be applied',async()=>{
  const {h}=setup();
  let observer,unsubscribed=0;
  const pending=h.context.requestNativeUser({getUser:()=>({subscribe(o){observer=o;return {unsubscribe(){unsubscribed++;}};}})},5);
  await assert.rejects(pending,/timed out/);
  assert.equal(unsubscribed,1);
  observer.next({user:{inventory:{}},time:1});
  assert.equal(h.run('getCache().inventory'),undefined);
});

test('unknown inventory items never overwrite a complete cache with a partial snapshot',()=>{
  const {h,runtime}=setup();
  h.run("setCache('inventory',{schema:1,allItems:[{key:'old.png',amount:42}],items:[]})");
  assert.equal(h.context.cacheSynchronizedInventory({unknown:{amount:8}},runtime.catalog),false);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),42);
});

test('runtime discovery uses native metadata and refuses to bootstrap an application',()=>{
  const h=harness({window:{}});
  assert.throws(()=>h.context.findNativeSyncRuntime(),/unavailable/);
  class State {syncUser(){}} class Firebase {getUser(){}}
  class Action {handleActionSync(){}} class Automation {handleAutomationSync(){}}
  class Expedition {handleExpeditionSync(){}} class Zone {run(){} runOutsideAngular(){}}
  const Types=[State,Firebase,Action,Automation,Expedition,Zone];
  Types.forEach(Type=>Type.ɵprov={});
  const instances=new Map(Types.map(Type=>[Type,new Type()]));
  let platform={_modules:[{injector:{get:Type=>instances.get(Type)}}]};
  function platformFactory(parent,name){const label=`Platform: ${name}`;return ()=>platform||parent(label);}
  const chunks=[[[],{runtime:function(){return 'Platform: syncUser( getUser( handleActionSync( handleAutomationSync( handleExpeditionSync(';},unrelated:function(){}}]];
  const loaded=[];
  const installed=new Set();
  chunks.push=chunk=>{const id=chunk[0][0];if(installed.has(id))return;installed.add(id);chunk[2](id=>{loaded.push(id);return {...Types,platformFactory};});};
  h.context.window.webpackChunkidle_game=chunks;
  const found=h.context.findNativeSyncRuntime();
  assert.equal(found.state,instances.get(State));
  assert.equal(found.zone,instances.get(Zone));
  assert.deepEqual(loaded,['runtime']);
  assert.equal(h.context.findNativeSyncRuntime(),found);
  const frame={webpackChunkidle_game:chunks};
  assert.equal(h.context.findNativeSyncRuntime(frame).state,instances.get(State));
  assert.equal(installed.size,2);
  platform=null;
  h.context.window={webpackChunkidle_game:chunks};
  assert.throws(()=>h.context.findNativeSyncRuntime(),/still loading/);
});

test('server responses are applied inside Angular even after awaiting a native async request',async()=>{
  const {h,runtime}=setup();
  let inZone=false;
  runtime.zone.run=fn=>{inZone=true;try{return fn();}finally{inZone=false;}};
  for(const [object,method] of [[runtime.state,'syncUser'],[runtime.action,'handleActionSync'],[runtime.automations,'handleAutomationSync'],[runtime.expedition,'handleExpeditionSync']]){
    const native=object[method];
    object[method]=function(...args){assert.equal(inZone,true,`${method} must notify mounted native pages inside Angular`);return native.apply(this,args);};
  }
  await h.context.synchronizeNativeGame();
});

// The live getUser response uses an ISO date string, not epoch milliseconds.
test('native ISO server timestamps synchronize Attunement and inventory',async()=>{
  const {h,runtime,user,calls}=setup();
  const time='2026-09-08T09:18:39.000Z';
  user.attunements={slots:{Forest:{exp:0},Mountain:{exp:0},Ocean:{exp:0}}};
  runtime.firebase.getUser=()=>({subscribe(o){o.next({user,time});return {unsubscribe(){}};}});
  await h.context.synchronizeNativeGame();
  assert.equal(runtime.state.user.attunements.slots.Forest.exp,0);
  assert.deepEqual(calls,['user',`action:${time}`,`automations:${time}`,`expedition:${time}`]);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'),2);
});
