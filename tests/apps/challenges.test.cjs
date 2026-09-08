const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
function challengeHarness({ confirm = true, load = true, scrolls = 2, required = 1, dailyCounter = true } = {}) {
  let now = 100000, readyAt = now + 500, stage = 'idle', region = 'Mountain', used = 1, selected = false;
  const clicks = [], snapshots = [];
  const h = harness({ console: {error(){}} });
  const text = textContent => ({textContent});
  const row = (name, value) => ({querySelector: selector => text(selector.includes('.name') ? name : value)});
  function root() {
    const thisStage = stage;
    const button = (label, disabled, click) => ({textContent:label, disabled, click() {
      assert.equal(stage, thisStage, 'must not click detached controls'); clicks.push(label); click();
    }});
    const categories = ['Forest', 'Mountain', 'Ocean'].map(name => button(name, region === name, () => {region=name; readyAt=now+400;}));
    return {
      querySelector: selector => selector.includes('categories') ? text(region) : text('Master Challenge'),
      querySelectorAll(selector) {
        if (!load || now < readyAt) return [];
        if (selector === '.card .row') return stage === 'idle' ? [row('Challenge Scroll', `${scrolls} / ${required}`), row('Auto Challenge Completes', `${used} / 10`), ...(dailyCounter ? [row('Daily Scroll Limit','2 / 15')] : [])] : [];
        if (selector === '.categories button') return categories;
        if (selector === '.categories button:disabled') return categories.filter(b => b.disabled);
        if (stage === 'idle') return [button('Start', scrolls < required, () => {stage='active'; readyAt=now+400;})];
        if (stage === 'active') return [button('Auto Complete', false, () => {stage='reward'; readyAt=now+400;})];
        if (stage === 'reward') return [button('Defense', selected, () => {selected=true;}), ...(selected ? [button('Claim', false, () => {stage='pending'; readyAt=now+700;})] : [])];
        return [];
      }
    };
  }
  const doc = {querySelector: () => root()};
  h.context.doc = doc;
  h.context.advance = async ms => {
    now += ms; h.time(now);
    if (stage === 'pending' && now >= readyAt && confirm) {stage='idle'; scrolls -= required; used++; selected=false;}
    snapshots.push(h.run("getCache().challenges?.scrollsAvailable"));
  };
  h.context.setTimeout = (resolve, ms) => { h.context.advance(ms); resolve(); };
  h.run(`automationEnabled = () => true; getChallengePrefs = () => ({region:'Forest',skill:'Defense'}); render = () => {}; synchronizeNativeGame = async () => {}; withPage = async (_path,_selector,task) => task(doc);`);
  return {h, doc, clicks, snapshots, ready() {now=readyAt; h.time(now);}, scrolls:()=>scrolls};
}
test('challenge automation waits for loaded and replaced pages, claims rewards once, and confirms real consumption', async () => {
  const {h,clicks,snapshots,scrolls} = challengeHarness();
  await h.context.automateChallenge();
  assert.equal(scrolls(), 0);
  assert.deepEqual(clicks, ['Forest','Start','Auto Complete','Defense','Claim','Start','Auto Complete','Defense','Claim']);
  assert.equal(h.run('getCache().challenges.lastRun.successful'), true);
  assert.match(h.run('getCache().challenges.lastRun.result'), /Completed 2/);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'), 0);
  assert.ok(!snapshots.includes(null));
});
test('a claim that never confirms preserves counts and reports failure instead of completing a batch', async () => {
  const {h,clicks,scrolls} = challengeHarness({confirm:false});
  await h.context.automateChallenge();
  assert.equal(scrolls(), 2);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'), 2);
  assert.equal(h.run('getCache().challenges.lastRun.successful'), false);
  assert.match(h.run('getCache().challenges.lastRun.result'), /claim was not confirmed/);
  assert.equal(clicks.filter(v=>v==='Start').length, 1);
  assert.equal(h.run('AppState.ui.runningChallenge'), false);
});
test('missing challenge rows preserve existing data and do not start a challenge', async () => {
  const {h,doc,clicks} = challengeHarness({load:false});
  h.run("CacheStore.set('challenges', {schema:4,scrollsAvailable:3,autoCompletesRemaining:9})");
  assert.equal(h.context.collectChallenges(doc), false);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'), 3);
  await h.context.automateChallenge();
  assert.deepEqual(clicks, []);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'), 3);
  assert.match(h.run('getCache().challenges.lastRun.result'), /counts did not finish loading/);
});
test('scroll requirements determine batch size and old or incomplete snapshots refresh', async () => {
  const {h,scrolls} = challengeHarness({scrolls:3, required:2});
  await h.context.automateChallenge();
  assert.equal(scrolls(), 1);
  assert.match(h.run('getCache().challenges.lastRun.result'), /Completed 1/);
  for (const entry of [{schema:3,scrollsAvailable:null},{schema:4,scrollsAvailable:null}]) {
    h.context.entry=entry; h.run("CacheStore.set('challenges', entry)");
    assert.equal(h.run("CacheStore.isFresh('challenges')"), false);
  }
});

function blockedHarness({ cancel = false, label = 'Cannot Auto', confirm = true, initial = 'blocked', allBlocked = false, disableAtModal = false } = {}) {
  let phase = initial, modal = false, scrolls = 2, used = 0, region = 'Forest', selected = false, now = 100000;
  const clicks = [];
  const h = harness({console:{error(){}}});
  const text = textContent => ({textContent});
  const button = (label, disabled, action) => ({textContent:label, disabled, click(){assert.equal(disabled,false); clicks.push(label); action();}});
  const trash = () => button('Trash', false, () => {modal=true; if(disableAtModal) cancel=false;});
  const steps = {querySelector: selector => selector === '.header .name' ? text('Steps') : trash()};
  const modalNode = {querySelector:()=>text('Abandon Challenge'),querySelectorAll:()=>[
    button('No',false,()=>{modal=false;}), button('Yes',false,()=>{if(confirm){modal=false; phase='ready';}})
  ]};
  const row = (name,value) => ({querySelector:selector=>text(selector.includes('.name')?name:value)});
  const root = {
    querySelector:selector=>text(selector.includes('categories')?region:'Master Challenge'),
    querySelectorAll(selector){
      if(selector==='modal-component') return modal?[modalNode]:[];
      if(selector==='.card') return phase==='blocked'?[steps]:[];
      if(selector==='.card .row') return [row('Auto Challenge Completes',`${used} / 10`),row('Daily Scroll Limit','2 / 15'),...(phase==='ready'?[row('Challenge Scroll',`${scrolls} / 1`)]:[])];
      if(selector.startsWith('.categories')) return [button(region,true,()=>{})];
      if(selector!=='button') return [];
      if(phase==='blocked') return [trash(),button(label,true,()=>{})];
      if(phase==='ready') return [button('Start',scrolls===0,()=>{scrolls--;phase=allBlocked?'blocked':'active';})];
      if(phase==='active') return [button('Auto Complete',false,()=>{phase='reward';used++;})];
      if(phase==='reward') return [button('Defense',selected,()=>{selected=true;}),button('Claim',!selected,()=>{phase='ready';selected=false;})];
      return [];
    }
  };
  const doc={querySelector:()=>root};
  h.context.doc=doc;
  h.context.cancelEnabled=()=>cancel;
  h.context.setTimeout=(resolve,ms)=>{now+=ms;h.time(now);resolve();};
  h.run("automationEnabled=()=>true; render=()=>{}; synchronizeNativeGame=async()=>{}; getChallengePrefs=()=>({region:'Forest',skill:'Defense',cancelBlocked:cancelEnabled()}); withPage=async (_path,_selector,task)=>task(doc);");
  return {h,doc,clicks,scrolls:()=>scrolls};
}

test('blocked active pages preserve known counts without Start requirements and show an orange warning', async()=>{
  const {h,doc,clicks}=blockedHarness();
  h.run("CacheStore.set('challenges',{schema:4,scrollsAvailable:2})");
  assert.equal(h.context.collectChallenges(doc).phase,'blocked');
  assert.equal(h.run('getCache().challenges.scrollsAvailable'),2);
  assert.equal(h.run("CacheStore.isFresh('challenges')"),true);
  assert.match(h.context.challengeBlockedIndicator(),/iw-task-icon waiting/);
  assert.doesNotMatch(h.context.challengeBlockedIndicator(),/data-run-challenge/);
  await h.context.automateChallenge();
  assert.deepEqual(clicks,[]);
  assert.match(h.run('getCache().challenges.lastRun.result'),/cancellation is off/);
});

test('enabled cancellation confirms the native trash dialog and then continues the batch',async()=>{
  const {h,clicks,scrolls}=blockedHarness({cancel:true});
  await h.context.automateChallenge();
  assert.deepEqual(clicks,['Trash','Yes','Start','Auto Complete','Defense','Claim','Start','Auto Complete','Defense','Claim']);
  assert.equal(scrolls(),0);
  assert.match(h.run('getCache().challenges.lastRun.result'),/Completed 2 · Cancelled 1/);
  assert.equal(h.run('getCache().challenges.phase'),'ready');
});

test('disabled auto controls are blocked, including an unavailable daily allowance',()=>{
  for(const label of ['Cannot Auto','Auto Complete','Auto Limit 10/10']) {
    const {h,doc}=blockedHarness({label});
    assert.equal(h.context.readChallengePhase(doc),'blocked');
  }
});

test('unconfirmed cancellation stops without starting another scroll or refunding counts',async()=>{
  const {h,clicks,scrolls}=blockedHarness({cancel:true,confirm:false});
  await h.context.automateChallenge();
  assert.deepEqual(clicks,['Trash','Yes']);
  assert.equal(scrolls(),2);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),false);
  assert.match(h.run('getCache().challenges.lastRun.result'),/cancellation was not confirmed/);
});

test('newly started blocked challenges are cancelled within a finite scroll budget',async()=>{
  const {h,clicks,scrolls}=blockedHarness({cancel:true,initial:'ready',allBlocked:true});
  await h.context.automateChallenge();
  assert.deepEqual(clicks,['Start','Trash','Yes','Start','Trash','Yes']);
  assert.equal(scrolls(),0);
  assert.match(h.run('getCache().challenges.lastRun.result'),/Completed 0 · Cancelled 2/);
  assert.equal(h.run('getCache().challenges.scrollsAvailable'),0);
});

test('cancellation permission is rechecked before confirming the native dialog',async()=>{
  const {h,clicks}=blockedHarness({cancel:true,disableAtModal:true});
  await h.context.automateChallenge();
  assert.deepEqual(clicks,['Trash']);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),false);
});

test('cancellation defaults off and survives region preference changes',()=>{
  const h=harness();
  assert.equal(h.run('getChallengePrefs().cancelBlocked'),false);
  h.run("setChallengePrefs({region:'Forest',skill:'Defense',cancelBlocked:true}); setChallengePrefs({region:'Mountain',skill:'Defense'})");
  assert.equal(h.run('getChallengePrefs().cancelBlocked'),true);
});


test('native Start page without a Daily Scroll Limit can run and clears stale daily caps', async()=>{
  const {h,doc,clicks}=challengeHarness({scrolls:1,dailyCounter:false});
  h.run("setCache('challenges',{schema:4,scrollsAvailable:1,autoCompletesRemaining:9,dailyScrollsUsed:15,dailyScrollsLimit:15})");
  await h.context.automateChallenge();
  assert.deepEqual(clicks,['Forest','Start','Auto Complete','Defense','Claim']);
  assert.equal(h.run('getCache().challenges.dailyScrollsUsed'),null);
  assert.equal(h.run('getCache().challenges.lastRun.successful'),true);
  assert.equal(h.run('getCache().challenges.lastRun.scrollsUsed'),1);
  assert.equal(h.run('getCache().challenges.lastRun.autoCompletesRemaining'),8);
  assert.equal(h.run('AppState.ui.actionToasts.at(-1).title'),'Challenge run complete');
});


test('a successful fresh count read hides an obsolete load error without hiding purchase failures',()=>{
  const h=harness();
  const entry={phase:'ready',scrollsAvailable:1,autoCompletesRemaining:10,checkedAt:2000,lastRun:{successful:false,finishedAt:1000,result:'Challenge counts did not finish loading'}};
  assert.equal(h.context.challengeRunError(entry),'');
  entry.lastRun.result='Challenge purchase was not confirmed';
  assert.equal(h.context.challengeRunError(entry),'Challenge purchase was not confirmed');
});
