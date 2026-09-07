const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('unchanged ticks and loot quantities skip inventory derivation; cache changes rebuild', () => {
  const h = harness();
  h.run(`
    CacheStore.set('inventory', { allItems: [{ key: 'wood.png', amount: 10 }], items: [] });
    globalThis.snapshot = { action: null, loot: [{ name:'Wood', image:'/wood.png', amount:1 }], consumables:[], materials:[], masteryProgress:{}, finiteQueue:null };
    SourceAdapter.capture = () => Object.assign(AppState.live, snapshot);
    AppState.ui.page = { hidden:false, innerHTML:'', style:{setProperty(){}}, querySelector(){return null;} };
    StatusRenderer.render(AppState);
    globalThis.inventoryReads = 0;
    globalThis.items = CacheStore.get('inventory').allItems;
    Object.defineProperty(CacheStore.get('inventory'), 'allItems', { configurable:true, enumerable:true, get() { inventoryReads++; return items; } });
    globalThis.liveUpdates = 0;
    StatusRenderer.updateLive = () => { liveUpdates++; };
    StatusRenderer.render(AppState);
    snapshot.loot[0].amount = 2;
    StatusRenderer.render(AppState);
  `);
  assert.equal(h.run('inventoryReads'), 0);
  assert.equal(h.run('liveUpdates'), 2);
  assert.ok(h.run('AppState.ui.lastSignature.length') < 2000);
  h.run(`CacheStore.set('mastery', { completeSkills: ['Defense'] }); inventoryReads = 0; StatusRenderer.render(AppState)`);
  assert.ok(h.run('inventoryReads') > 0);
});

test('hidden tabs skip source capture entirely', () => {
  const h = harness();
  h.run(`document.hidden = true; AppState.ui.page = { hidden:false }; SourceAdapter.capture = () => { throw Error('unexpected capture'); }; StatusRenderer.render(AppState)`);
});

test('frame scheduler coalesces requests, cancels hidden work, and refreshes on return', () => {
  const frames = new Map();
  let id = 0;
  const h = harness({ window: { requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(key) { frames.delete(key); } } });
  h.run(`AppState.ui.page = {hidden:false}; globalThis.renders = 0; StatusRenderer.render = () => { renders++; }; scheduleStatusRender(); scheduleStatusRender()`);
  assert.equal(frames.size, 1);
  h.run('document.hidden = true; handleStatusVisibility()');
  assert.equal(frames.size, 0);
  h.run('scheduleStatusRender()');
  assert.equal(frames.size, 0);
  h.run('document.hidden = false; handleStatusVisibility()');
  assert.equal(frames.size, 1);
  const fn = [...frames.values()][0]; frames.clear(); fn();
  assert.equal(h.run('renders'), 1);
  assert.equal(h.run('AppState.ui.renderFrame'), null);
  h.run('AppState.ui.page.hidden = true; scheduleStatusRender()');
  assert.equal(frames.size, 0);
});
