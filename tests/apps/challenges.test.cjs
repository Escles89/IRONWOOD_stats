const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
function challengeHarness({ confirm = true, load = true, scrolls = 2, required = 1 } = {}) {
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
        if (selector === '.card .row') return stage === 'idle' ? [row('Challenge Scroll', `${scrolls} / ${required}`), row('Auto Challenge Completes', `${used} / 10`), row('Daily Scroll Limit','2 / 15')] : [];
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
  h.run(`automationEnabled = () => true; getChallengePrefs = () => ({region:'Forest',skill:'Defense'}); render = () => {}; withPage = async (_path,_selector,task) => task(doc);`);
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
