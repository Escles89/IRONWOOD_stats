const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
const { definitions, user, thresholds } = require('../fixtures/traits.cjs');

function setup() {
  const h = harness({ setTimeout, clearTimeout });
  let server = user();
  const calls = [];
  const state = { user: structuredClone(server), isSolo: false, loadingApp: false, syncingData: false };
  state.user$ = { getValue: () => state.user, next: value => { state.user = value; } };
  const response = value => ({ subscribe(observer) { observer.next(structuredClone(value)); observer.complete(); return { unsubscribe() {} }; } });
  const runtime = { state, traits: definitions(), zone: { run: fn => fn() }, firebase: {
    getUser() { calls.push('read'); return response({ user: server }); },
    unequipTrait(id) { calls.push(`unequip:${id}`); delete server.traits.equippedIds[id]; return response(server.traits); },
    equipTrait(id) { calls.push(`equip:${id}`); server.traits.equippedIds[id] = true; return response(server.traits); },
    claimTraitSet(id) { calls.push(`claim:${id}`); server.traits.sets[id] = true; return response(server.traits); }
  } };
  h.context.quickRuntime = () => runtime;
  h.context.render = () => {};
  const observe = () => h.context.traitsObserve(runtime);
  const sync = () => { state.user = structuredClone(server); };
  return { h, runtime, calls, server, sync, observe,
    model() { return h.context.buildTraitTracking(h.context.readTraits(runtime)); } };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('temporary game synchronization retains observed progress without showing a false unavailable error', () => {
  const { runtime, observe } = setup();
  assert.equal(observe().model.target.level, 100);
  runtime.state.syncingData = true;
  const pending = observe().model;
  assert.equal(pending.available, true);
  assert.equal(pending.stale, true);
  assert.equal(pending.target.level, 100);
  runtime.state.syncingData = false;
  assert.equal(observe().model.stale, false);
});

test('compact Status row signals switches and claims while details live only in the modal', () => {
  const { h, server, sync, observe } = setup();
  server.traits.storage['1'].exp = thresholds[0];
  server.traits.storage['4'].exp = thresholds[0];
  server.traits.storage['5'].exp = thresholds[0];
  sync(); observe();
  const row = h.context.renderTraitsSummaryContent();
  assert.match(row, /Switch 1 · Claim 1/);
  assert.match(row, /iw-traits-mini-bars/);
  assert.doesNotMatch(row, /Region priority|data-traits-to|data-traits-claim|data-traits-refresh/);
  const modal = h.context.renderTraitsModal();
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /Region priority/);
  assert.match(modal, /data-traits-to/);
  assert.match(modal, /data-traits-claim/);
  assert.match(modal, /data-modal-close/);
});

test('Trait modal closes with Escape and restores focus to the compact row', () => {
  const { h } = setup();
  let restored = 0, prevented = 0;
  h.context.openTraits({ focus() { restored++; } });
  assert.equal(h.run('AppState.ui.traits.open'), true);
  h.context.handlePreferencesKey({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(h.run('AppState.ui.traits.open'), false);
  assert.equal(restored, 1);
  assert.equal(prevented, 1);
});

test('stale progress is labelled Updating and cannot expose actionable switch alerts', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  runtime.state.syncingData = true; observe();
  assert.match(h.context.renderTraitsSummaryContent(), /Updating/);
  assert.doesNotMatch(h.context.renderTraitsSummaryContent(), /Switch 1/);
  assert.match(h.context.renderTraitsContent(), /data-traits-to="4" disabled/);
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.deepEqual(calls, []);
});

test('only completed or empty training slots get distinct lowest-XP replacements', () => {
  const { server, sync, model } = setup();
  server.traits.storage['1'].exp = thresholds[0];
  server.traits.storage['2'].exp = thresholds[0] - 0.1;
  delete server.traits.equippedIds['3'];
  sync();
  const result = model();
  assert.equal(result.target.level, 100);
  assert.deepEqual(plain(result.recommendations).map(row => [row.from, row.to]), [['1', '3'], ['', '4']]);
  assert.equal(result.rows.find(row => row.trait?.id === '2').replacement, null);
});

test('milestones use raw XP; all regions advance together without waiting for claims', () => {
  const { server, sync, model } = setup();
  for (const level of [0, 1, 2]) {
    for (const trait of Object.values(server.traits.storage)) trait.exp = thresholds[level];
    sync();
    let result = model();
    assert.equal(result.target?.level ?? null, [115, 130, null][level]);
    assert.equal(result.sets.filter(set => set.ready).length, (level + 1) * 4);
    server.traits.storage['7'].exp -= 0.01;
    sync();
    assert.equal(model().target.level, [100, 115, 130][level]);
  }
});

test('preferred region prioritizes shared Defense; then other regions at the same milestone', () => {
  const { h, server, runtime, sync } = setup();
  server.traits.storage['1'].exp = thresholds[0];
  server.traits.storage['2'].exp = thresholds[0];
  server.traits.storage['3'].exp = thresholds[0];
  server.traits.storage['4'].exp = 1000;
  server.traits.storage['5'].exp = 900;
  sync();
  let result = h.context.buildTraitTracking(h.context.readTraits(runtime), 'Forest');
  assert.deepEqual(plain(result.recommendations).map(row => row.to), ['5', '4', '6']);
  server.traits.storage['4'].exp = server.traits.storage['5'].exp = thresholds[0];
  sync();
  result = h.context.buildTraitTracking(h.context.readTraits(runtime), 'Forest');
  assert.deepEqual(plain(result.recommendations).map(row => row.to), ['6', '7']);
  assert.equal(result.target.level, 100);
});

test('displayed replacements remain stable as unequipped XP changes', () => {
  const { h, server, runtime, sync } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync();
  const previous = h.context.buildTraitTracking(h.context.readTraits(runtime));
  assert.equal(previous.recommendations[0].to, '4');
  server.traits.storage['4'].exp = 1000; sync();
  assert.equal(h.context.buildTraitTracking(h.context.readTraits(runtime), '', previous).recommendations[0].to, '4');
  server.traits.storage['4'].exp = thresholds[0]; sync();
  assert.equal(h.context.buildTraitTracking(h.context.readTraits(runtime), '', previous).recommendations[0].to, '5');
});

test('locked traits prevent completion but are never recommended; actual capacity is respected', () => {
  const { server, sync, model } = setup();
  for (const trait of Object.values(server.traits.storage)) trait.exp = thresholds[0];
  delete server.traits.storage['4'];
  server.traits.upgrades.slots = 0;
  server.traits.equippedIds = { '1': true };
  sync();
  const result = model();
  assert.equal(result.rows.length, 1);
  assert.equal(result.target.level, 100);
  assert.equal(result.locked, 1);
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.sets.filter(set => set.region !== 'All' && set.level === 100).every(set => !set.ready));
});

test('malformed XP, incomplete catalogs and loading data fail closed', () => {
  for (const change of [r => { delete r.state.user.traits.storage; }, r => { r.state.user.traits.storage['1'].exp = NaN; },
    r => { r.state.user.traits.storage['1'].exp = -1; }, r => { r.state.user.traits.equippedIds['99'] = true; },
    r => { r.state.loadingApp = true; }, r => { r.state.appActive = false; }, r => { delete r.traits.sets['12']; },
    r => { r.traits.sets['4'].traitIds = ['1']; }, r => { r.state.user.traits.upgrades.slots = 9; }]) {
    const { h, runtime } = setup(); change(runtime);
    assert.equal(h.context.readTraits(runtime), null);
    assert.equal(h.context.buildTraitTracking(h.context.readTraits(runtime)).available, false);
  }
});

test('live XP, paused training and claimed states are reflected without collecting', () => {
  const { h, server, sync, observe, calls } = setup();
  assert.equal(observe().model.training, 'running');
  server.action = null; sync();
  assert.match(h.context.traitTrainingLabel(observe().model), /paused.*no current action/);
  server.action = { skillId: '1', actionId: '1' }; server.gain = 0; sync();
  assert.match(h.context.traitTrainingLabel(observe().model), /paused.*Sigil/);
  for (const id of ['1', '4', '5']) server.traits.storage[id].exp = thresholds[0];
  sync(); assert.equal(observe().model.sets[0].ready, true);
  server.traits.sets['1'] = true; sync();
  assert.equal(observe().model.sets[0].claimed, true);
  assert.equal(observe().model.sets[0].ready, false);
  assert.deepEqual(calls, []);
});

test('region preference persists per character and mode; identity loss clears recommendations', () => {
  const { h, runtime, observe } = setup();
  h.context.setTraitPreference('Forest');
  assert.equal(observe().preference, 'Forest');
  runtime.state.isSolo = true; runtime.state.user.isSolo = true;
  assert.equal(observe().preference, '');
  h.context.setTraitPreference('Ocean');
  runtime.state.isSolo = false; runtime.state.user.isSolo = false;
  assert.equal(observe().preference, 'Forest');
  runtime.state.swappingCharacter = true;
  assert.equal(observe().model.available, false);
  assert.equal(observe().preference, '');
});

test('switch checks server, confirms unequip, checks again, then confirms equip', async () => {
  const { h, server, sync, calls, runtime, observe } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.deepEqual(calls, ['read', 'unequip:1', 'read', 'equip:4']);
  assert.deepEqual(runtime.state.user.traits.equippedIds, { '2': true, '3': true, '4': true });
  assert.equal(h.run('AppState.ui.traits.busy'), false);
  assert.match(h.run('AppState.ui.traits.message'), /equipped for training/);
});

test('server changes invalidate a stale recommendation before unequipping', async () => {
  const { h, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  server.traits.storage['1'].exp = thresholds[0] - 1;
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.ok(calls.every(call => call === 'read'));
  assert.match(h.run('AppState.ui.traits.message'), /changed/);
});

test('partial switch failure exposes retry; retry only equips and never unequips again', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  const goodEquip = runtime.firebase.equipTrait;
  runtime.firebase.equipTrait = () => { calls.push('equip-failed'); throw Error('Offline'); };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.match(h.run('AppState.ui.traits.message'), /slot is empty/);
  assert.equal(h.run('AppState.ui.traits.retry.to'), '4');
  assert.match(h.context.renderTraitsContent(), /Retry equip: Defense XP/);
  runtime.firebase.equipTrait = goodEquip;
  calls.length = 0;
  await h.context.runTraitControl({ type: 'retry' });
  assert.deepEqual(calls, ['read', 'equip:4']);
  assert.equal(h.run('AppState.ui.traits.retry'), null);
});

test('an equip timeout with server success is reconciled instead of repeated', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  runtime.firebase.equipTrait = id => { calls.push(`equip:${id}`); server.traits.equippedIds[id] = true; throw Error('Lost response'); };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.equal(h.run('AppState.ui.traits.retry'), null);
  assert.match(h.run('AppState.ui.traits.message'), /confirmed after checking/);
  assert.equal(calls.filter(call => call === 'equip:4').length, 1);
});

test('failed reconciliation disables changes until a manual refresh succeeds', async () => {
  const { h, runtime, server, sync, observe } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  const get = runtime.firebase.getUser;
  runtime.firebase.unequipTrait = () => { runtime.firebase.getUser = () => { throw Error('Offline'); }; throw Error('Offline'); };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.equal(h.run('AppState.ui.traits.needsRefresh'), true);
  assert.equal(observe().model.available, false);
  runtime.firebase.getUser = get;
  await h.context.refreshTraits();
  assert.equal(h.run('AppState.ui.traits.needsRefresh'), false);
  assert.equal(observe().model.available, true);
});

test('claims require current server readiness and reflect confirmed claim state', async () => {
  const { h, server, sync, observe, calls } = setup();
  for (const id of ['1', '4', '5']) server.traits.storage[id].exp = thresholds[0];
  sync(); observe();
  await h.context.runTraitControl({ type: 'claim', id: '1' });
  assert.deepEqual(calls, ['read', 'claim:1']);
  assert.equal(observe().model.sets[0].claimed, true);
  await h.context.runTraitControl({ type: 'claim', id: '1' });
  assert.equal(calls.length, 2);
});

test('a set claimed elsewhere is reconciled without another claim request', async () => {
  const { h, server, sync, observe, calls } = setup();
  for (const id of ['1', '4', '5']) server.traits.storage[id].exp = thresholds[0];
  sync(); observe();
  server.traits.sets['1'] = true;
  await h.context.runTraitControl({ type: 'claim', id: '1' });
  assert.ok(calls.every(call => call === 'read'));
  assert.equal(observe().model.sets[0].claimed, true);
});

test('a milestone reached between unequip and equip stops the obsolete replacement', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  const unequip = runtime.firebase.unequipTrait;
  runtime.firebase.unequipTrait = id => {
    const result = unequip(id);
    server.traits.storage['4'].exp = thresholds[0];
    return result;
  };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.equal(calls.filter(call => call.startsWith('equip:')).length, 0);
  assert.match(h.run('AppState.ui.traits.message'), /slot is empty/);
  assert.equal(h.run('AppState.ui.traits.retry'), null);
});

test('manual refresh can recover missing local Trait data from a valid server observation', async () => {
  const { h, runtime, observe, calls } = setup();
  delete runtime.state.user.traits;
  assert.equal(observe().model.available, false);
  await h.context.refreshTraits();
  assert.equal(observe().model.available, true);
  assert.deepEqual(calls, ['read']);
});

test('synchronization starting during a read prevents a subsequent Trait mutation', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  const get = runtime.firebase.getUser;
  runtime.firebase.getUser = () => { runtime.state.syncingData = true; return get(); };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.ok(calls.every(call => call === 'read'));
  assert.equal(observe().model.available, false);
});

test('character change during an async check prevents mutations and clears old-character UI', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  runtime.firebase.getUser = () => { runtime.state.user.displayName = 'Another'; return { subscribe(o) { o.next({ user: server }); return { unsubscribe() {} }; } }; };
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  assert.deepEqual(calls, []);
  assert.equal(h.run('AppState.ui.traits.message'), '');
  assert.equal(h.run('AppState.ui.traits.busy'), false);
});

test('double clicks and other quick actions cannot overlap a Trait mutation', async () => {
  const { h, runtime, server, sync, observe, calls } = setup();
  server.traits.storage['1'].exp = thresholds[0]; sync(); observe();
  let resolve;
  const get = runtime.firebase.getUser;
  runtime.firebase.getUser = () => new Promise(done => { resolve = () => done(get()); });
  const first = h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.context.quickBusy(), true);
  await h.context.runTraitControl({ type: 'switch', from: '1', to: '4' });
  await assert.rejects(h.context.synchronizeNativeGame(), /Trait change/);
  runtime.firebase.getUser = get; resolve();
  await first;
  assert.equal(calls.filter(call => call.startsWith('unequip')).length, 1);
});

test('native request timeout unsubscribes; late responses cannot update state', async () => {
  const { h, runtime } = setup();
  let observer, unsubscribed = 0;
  runtime.firebase.equipTrait = () => ({ subscribe(value) { observer = value; return { unsubscribe() { unsubscribed++; } }; } });
  await assert.rejects(h.context.requestTraitMutation(runtime, 'equipTrait', '4', h.context.quickOwner(runtime), 5), /timed out/);
  assert.equal(unsubscribed, 1);
  observer.next({});
  assert.equal(runtime.state.user.traits.equippedIds['4'], undefined);
});

test('panel escapes native names, shows accessible progress and preserves ready claims after completion', () => {
  const { h, runtime, server, sync, observe } = setup();
  runtime.traits.catalog['1'].name = '<img onerror=bad>';
  for (const trait of Object.values(server.traits.storage)) trait.exp = thresholds[2];
  sync(); observe();
  const markup = h.context.renderTraitsContent();
  assert.match(markup, /&lt;img onerror=bad&gt;/);
  assert.match(markup, /training complete/);
  assert.equal((markup.match(/data-traits-claim=/g) || []).length, 12);
  assert.equal((markup.match(/data-traits-to=/g) || []).length, 0);
  assert.match(markup, /aria-label="Trait set progress"/);
});

test('discovery follows named native bindings and rejects ambiguous modules', () => {
  const { h } = setup();
  const native = definitions(), data = { catalog: native.catalog, sets: native.sets };
  const calc = { level: native.level, gain: native.gain, claim: native.canClaim, capacity: native.capacity };
  function Page() { this.TRAIT_DATA=data.catalog;this.TRAIT_SET_DATA=data.sets;this.calcTraitLevel=calc.level;this.calcTraitExpGain=calc.gain;this.canClaimTraitSet=calc.claim;this.equipLimit$=this.user$.pipe((0,other.map)(u=>(0,calc.capacity)(u))); }
  assert.equal(h.context.discoverNativeTraits(Page, [data, calc]).capacity, calc.capacity);
  assert.equal(h.context.discoverNativeTraits(Page, [data, calc, { ...data }]), null);
  assert.equal(h.context.discoverNativeTraits(Page, [data]), null);
});
