const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
function setup({enabled=true, maxPrice=320000, price=10000, scrolls=0, autoLimit=10, daily=0, coins=2000000,
  confirmed=true, blocked=false, cancel=true, repeatPrice=false, disableOnOpen=false, quoteMissing=false}={}) {
  const h=harness({console:{error(){}}});
  let phase='ready', modal='', autoUsed=0, now=100000, pendingAt=0, region='Forest';
  const clicks=[], prices=[];
  const text=textContent=>({textContent});
  const row=(label,value)=>({querySelector:selector=>text(selector===':scope > .name'||selector===':scope > span'?label:value)});
  const control=(label,disabled,fn)=>({textContent:label,disabled,click(){assert.equal(disabled,false);clicks.push(label);fn();}});
  const buyModal={
    querySelector:()=>text('Challenge Entry'),
    querySelectorAll(selector){
      if(selector==='.row') return quoteMissing?[]:[row('Cost',`${price/1000}K`)];
      if(selector==='button') return [control('Cancel',false,()=>modal=''),control('Buy',coins<price,()=>{
        prices.push(price);modal='';phase='pending';pendingAt=now+400;
      })];
      return [];
    }
  };
  const abandonModal={querySelector:()=>text('Abandon Challenge'),querySelectorAll:()=>[control('Yes',false,()=>{modal='';phase='ready';})]};
  const trash=()=>control('Trash',false,()=>modal='abandon');
  const steps={querySelector:selector=>selector==='.header .name'?text('Steps'):trash()};
  const root={
    querySelector:selector=>text(selector.includes('categories')?region:'Master Challenge'),
    querySelectorAll(selector){
      if(selector==='modal-component')return modal?[modal==='buy'?buyModal:abandonModal]:[];
      if(selector==='.card')return phase==='blocked'?[steps]:[];
      if(selector==='.card .row')return phase==='pending'?[]:[row('Auto Challenge Completes',`${autoUsed} / ${autoLimit}`),row('Daily Scroll Limit',`${daily} / 15`),...(phase==='ready'?[row('Challenge Scroll',`${scrolls} / 1`)]:[])];
      if(selector.startsWith('.categories'))return [control(region,true,()=>{})];
      if(selector!=='button')return [];
      const modalButtons=modal?(modal==='buy'?buyModal:abandonModal).querySelectorAll('button'):[];
      if(phase==='ready') return [control(daily>=15?'Daily Cap 15/15':'Start',scrolls<1||daily>=15,()=>{scrolls--;daily++;phase=blocked?'blocked':'active';}),control('Buy',false,()=>{modal='buy';if(disableOnOpen)enabled=false;}),...modalButtons];
      if(phase==='active') return [control('Auto Complete',false,()=>{autoUsed++;phase='reward';})];
      if(phase==='blocked') return [control('Cannot Auto',true,()=>{}),trash(),...modalButtons];
      if(phase==='reward') return [control('Defense',false,()=>{}),control('Claim',false,()=>phase='ready')];
      return [];
    }
  };
  const doc={querySelector:()=>root};
  h.context.doc=doc;
  h.context.preferences=()=>({region,skill:'Defense',cancelBlocked:cancel,buyScrolls:enabled,maxBuyPrice:maxPrice});
  h.context.setTimeout=(resolve,ms)=>{
    now+=ms;h.time(now);
    if(phase==='pending'&&confirmed&&now>=pendingAt){coins-=price;if(!repeatPrice)price*=2;phase=blocked?'blocked':'active';}
    resolve();
  };
  h.run('getChallengePrefs=preferences; automationEnabled=()=>true; render=()=>{}; synchronizeNativeGame=async()=>{}; withPage=async(_path,_selector,task)=>task(doc);');
  return {h,doc,clicks,prices,scrolls:()=>scrolls,coins:()=>coins,modal:()=>modal};
}

test('buy loop includes the 320K tier, skips 640K, and never invents inventory scrolls',async()=>{
  const {h,prices,coins,scrolls}=setup();
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000,20000,40000,80000,160000,320000]);
  assert.equal(coins(),1370000);
  assert.equal(scrolls(),0);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'),0);
  assert.match(h.run('getCache().challenges.lastRun.result'),/Completed 6 · Bought 6 \(630,000 gold\)/);
});
test('uses existing scrolls first, then reads each paid quote and honors a lower tier',async()=>{
  const {h,prices,clicks,modal}=setup({scrolls:1,maxPrice:40000});
  await h.context.automateChallenge();
  assert.deepEqual(clicks.slice(0,4),['Start','Auto Complete','Defense','Claim']);
  assert.deepEqual(prices,[10000,20000,40000]);
  assert.equal(modal(),'');
  assert.match(h.run('getCache().challenges.lastRun.result'),/80,000 gold exceeds 40,000 limit/);
});
test('an initial quote above the cap is dismissed without spending',async()=>{
  const {h,prices,modal}=setup({price:640000});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[]);
  assert.equal(modal(),'');
});
test('purchase toggle off or no auto-complete allowance never opens Buy',async()=>{
  for(const options of [{enabled:false},{autoLimit:0}]){
    const {h,clicks}=setup(options);
    await h.context.automateChallenge();
    assert.deepEqual(clicks,[]);
  }
});
test('daily scroll cap still allows gold entries without consuming owned scrolls',async()=>{
  const {h,prices,scrolls,clicks}=setup({daily:15,scrolls:2,maxPrice:10000});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000]);
  assert.equal(scrolls(),2);
  assert.ok(!clicks.includes('Start'));
});
test('insufficient gold dismisses the native dialog without buying',async()=>{
  const {h,prices,coins,modal}=setup({coins:5000});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[]);
  assert.equal(coins(),5000);
  assert.equal(modal(),'');
});
test('closed modal without a confirmed active challenge stops after one purchase attempt',async()=>{
  const {h,prices}=setup({confirmed:false});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000]);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),false);
  assert.match(h.run('getCache().challenges.lastRun.result'),/purchase was not confirmed/);
});
test('cancelled paid challenges consume gold but no scrolls and cannot exceed the tier budget',async()=>{
  const {h,prices,scrolls}=setup({blocked:true});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000,20000,40000,80000,160000,320000]);
  assert.equal(scrolls(),0);
  assert.match(h.run('getCache().challenges.lastRun.result'),/Completed 0 · Cancelled 6 · Bought 6/);
});
test('a blocked paid challenge stops purchases when cancellation is off',async()=>{
  const {h,prices,clicks}=setup({blocked:true,cancel:false});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000]);
  assert.ok(!clicks.includes('Trash'));
  assert.equal(h.run('getCache().challenges.phase'),'blocked');
});
test('live permission changes, absent prices and unexpected tiers cannot spend',async()=>{
  for(const options of [{disableOnOpen:true},{quoteMissing:true},{price:15000}]){
    const {h,prices,modal}=setup(options);
    await h.context.automateChallenge();
    assert.deepEqual(prices,[]);
    assert.equal(modal(),'');
  }
});
test('a price that fails to double stops before a second purchase',async()=>{
  const {h,prices}=setup({repeatPrice:true});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000]);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),false);
});
test('stops buying when the auto-complete allowance is used',async()=>{
  const {h,prices}=setup({autoLimit:1});
  await h.context.automateChallenge();
  assert.deepEqual(prices,[10000]);
});
test('purchase preferences default off at 320K, survive other settings, and enforce the hard cap',()=>{
  const h=harness();
  assert.equal(h.run('getChallengePrefs().buyScrolls'),false);
  assert.equal(h.run('getChallengePrefs().maxBuyPrice'),320000);
  h.run("setChallengePrefs({region:'Forest',skill:'Defense',buyScrolls:true,maxBuyPrice:80000});setChallengePrefs({region:'Mountain',skill:'Defense',cancelBlocked:true})");
  assert.equal(h.run('getChallengePrefs().buyScrolls'),true);
  assert.equal(h.run('getChallengePrefs().maxBuyPrice'),80000);
  h.run('setChallengePrefs({...getChallengePrefs(),maxBuyPrice:640000})');
  assert.equal(h.run('getChallengePrefs().maxBuyPrice'),320000);
});


test('mixed-run recap reports bought versus used, gold, completions and allowance',async()=>{
  const {h}=setup({scrolls:1,maxPrice:40000});
  await h.context.automateChallenge();
  const run=h.run('getCache().challenges.lastRun');
  assert.equal(run.scrollsUsed,1);
  assert.equal(run.purchased,3);
  assert.equal(run.completed,4);
  assert.equal(run.goldSpent,70000);
  assert.equal(run.autoCompletesRemaining,6);
  const metrics=h.run('AppState.ui.actionToasts.at(-1).metrics');
  assert.equal(metrics.find(m=>m.label==='Auto-completes left').value,'6');
});

test('a stopped paid run keeps confirmed purchases and the remaining allowance in its recap',async()=>{
  const {h}=setup({blocked:true,cancel:false});
  await h.context.automateChallenge();
  const run=h.run('getCache().challenges.lastRun');
  assert.equal(run.purchased,1);
  assert.equal(run.goldSpent,10000);
  assert.equal(run.scrollsUsed,0);
  assert.equal(run.completed,0);
  assert.equal(run.autoCompletesRemaining,10);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).kind'),'warning');
  assert.match(h.run('AppState.ui.actionToasts.at(-1).detail'),/cancellation is off/);
});

test('challenge batches synchronize once after the frame closes and before the recap',async()=>{
  const {h}=setup({scrolls:1});
  let calls=0,frameOpen=false;
  h.context.withPage=async(_path,_selector,task)=>{frameOpen=true;try{return await task(h.context.doc);}finally{frameOpen=false;}};
  h.context.synchronizeNativeGame=async()=>{
    calls++;
    assert.equal(frameOpen,false);
    assert.equal(h.run('AppState.ui.runningChallenge'),true);
    assert.equal(h.run('AppState.ui.actionToasts.length'),0);
  };
  await h.context.automateChallenge();
  assert.equal(calls,1);
  assert.equal(h.run('getCache().challenges.lastRun.completed'),7);
});

test('no mutation means no game synchronization',async()=>{
  const {h}=setup({enabled:false,scrolls:0});
  let calls=0;h.context.synchronizeNativeGame=async()=>calls++;
  await h.context.automateChallenge();
  assert.equal(calls,0);
});

test('an unconfirmed purchase still synchronizes but is never counted as successful',async()=>{
  const {h}=setup({confirmed:false});
  let calls=0;h.context.synchronizeNativeGame=async()=>calls++;
  await h.context.automateChallenge();
  assert.equal(calls,1);
  assert.equal(h.run('getCache().challenges.lastRun.purchased'),0);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),false);
});

test('a synchronization failure preserves completed totals and makes the recap persistent',async()=>{
  const {h}=setup({scrolls:1,enabled:false});
  h.context.synchronizeNativeGame=async()=>{throw Error('Offline');};
  await h.context.automateChallenge();
  assert.equal(h.run('getCache().challenges.lastRun.completed'),1);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),true);
  assert.equal(h.run('AppState.ui.runningChallenge'),false);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).kind'),'warning');
  assert.match(h.run('AppState.ui.actionToasts.at(-1).warning'),/could not sync/);
});
