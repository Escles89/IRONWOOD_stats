const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(storage = new Map(), configure = () => {}) {
  const listeners = {}, calls = [], errors = [];
  const page = { hidden: false, innerHTML: '', style: { setProperty() {} }, contains: () => true, querySelector: () => null, querySelectorAll: () => [] };
  const document = { hidden: false, body: { textContent: '' }, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); } };
  const user = { displayName: 'Player', isSolo: false, inventory: { '101': { amount: 30 }, '102': { amount: 50 } }, charcoal: 12, skills: { '3': { exp: 0 } } };
  const runtime = { state: { user, isSolo: false, loadingApp: false, syncingData: false, syncUser(value) { this.user = value; } },
    catalog: { '101': { id: '101', name: 'Iron Bar' }, '102': { id: '102', name: 'Iron Ore' } },
    skillCatalog: Object.fromEntries(['3', '4', '11', '12', '10', '16'].map((id, i) => [id, { id, name: ['Smelting', 'Smithing', 'Enchanting', 'Alchemy', 'Cooking', 'Imbuing'][i], actions: id === '3' ? [{ id: '30' }] : [] }])),
    actionCatalog: { '30': { id: '30', name: 'Iron Bar', level: 10, materials: [{ id: '102', amount: 2 }], charcoal: 2, drops: [{ id: '101', chance: 1000 }] } },
    skillLevel: () => 1,
    zone: { run: fn => fn() }, action: { actionLoading: false, handleActionSync() {} }, automations: { handleAutomationSync() {} }, expedition: { handleExpeditionSync() {} },
    firebase: { getUser() { calls.push('read'); return { subscribe(o) { o.next({ user: structuredClone(runtime.state.user), time: 100000 }); o.complete(); return { unsubscribe() {} }; } }; } } };
  configure(runtime);
  const h = harness({ document, page, setTimeout, clearTimeout, console: { error: (...args) => errors.push(args) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  h.context.findNativeSyncRuntime = () => runtime;
  h.run('AppState.ui.page = page; installEventDelegation();');
  let catalogSignature = '';
  function currentCatalog() {
    const signature = JSON.stringify([runtime.catalog, runtime.skillCatalog, runtime.actionCatalog]);
    // Native catalog replacement models loading a changed client build. User
    // balances mutate in place; compiled catalogs are immutable in the game.
    if (signature !== catalogSignature) {
      for (const key of ['catalog', 'skillCatalog', 'actionCatalog']) runtime[key] = structuredClone(runtime[key]);
      catalogSignature = signature;
    }
  }
  function render() { currentCatalog(); h.context.render(); assert.deepEqual(errors, []); return page.innerHTML; }
  function emit(type, attr, value, fields) {
    currentCatalog();
    const target = { value, dataset: { shoppingOwner: JSON.stringify([user.displayName, runtime.state.isSolo]) }, disabled: false,
      matches: selector => selector === attr, closest: selector => selector === attr ? target : null,
      querySelector: selector => ({ value: fields?.[selector] ?? '' }) };
    for (const callback of listeners[type] || []) callback({ target, preventDefault() {}, stopPropagation() {} });
    return render();
  }
  function save(id = '101', quantity = '100', recipe = '3:30') {
    return emit('submit', '[data-shopping-form]', '', { '[name="item"]': id, '[name="quantity"]': quantity, '[name="recipe"]': recipe });
  }
  render();
  return { h, runtime, user, storage, page, calls, render, emit, save };
}

test('a saved target subtracts owned finished items and shows direct base costs without gameplay mutations', () => {
  const s = setup();
  assert.match(s.render(), /Target owned quantity/);
  const html = s.save();
  assert.match(html, /70 to acquire/);
  assert.match(html, /70 base attempts/);
  assert.match(html, /90 Iron Ore/);
  assert.match(html, /128 Charcoal/);
  assert.match(html, /Requires Smelting level 10.*current 1/);
  assert.match(html, /Direct recipe detail/);
  assert.match(html, /href="\/skill\/3\/action\/30"/);
  assert.deepEqual(s.calls, []);
});

test('editing, recipe selection, reload, fulfilled-then-spent targets and clearing preserve character scope', () => {
  const s = setup();
  s.emit('change', '[data-shopping-item]', '101');
  assert.match(s.render(), /Smelting · Iron Bar/);
  s.save();
  const reload = setup(s.storage);
  assert.match(reload.render(), /70 to acquire/);
  reload.user.inventory['101'].amount = 150;
  assert.match(reload.render(), /Target satisfied/);
  reload.user.inventory['101'].amount = 10;
  assert.match(reload.render(), /90 to acquire/);
  reload.emit('click', '[data-shopping-edit]');
  assert.match(reload.render(), /value="101" selected/);
  reload.save('101', '200');
  assert.match(reload.render(), /190 to acquire/);
  reload.runtime.state.isSolo = reload.user.isSolo = true;
  assert.doesNotMatch(reload.render(), /190 to acquire/);
  reload.runtime.state.isSolo = reload.user.isSolo = false;
  assert.match(reload.render(), /190 to acquire/);
  reload.user.displayName = 'Other';
  assert.doesNotMatch(reload.render(), /190 to acquire/);
  reload.user.displayName = 'Player';
  reload.emit('click', '[data-shopping-clear]');
  assert.doesNotMatch(setup(reload.storage).render(), /to acquire/);
  assert.deepEqual(reload.calls, []);
});

test('multiple current recipes require a choice; invalidated choices are retained and obsolete recipes excluded', () => {
  const s = setup();
  s.runtime.actionCatalog['31'] = { ...s.runtime.actionCatalog['30'], id: '31', name: 'Alternative' };
  s.runtime.skillCatalog['3'].actions.push({ id: '31' });
  assert.match(s.save('101', '100', ''), /Choose a current recipe/);
  assert.doesNotMatch(s.render(), /70 base attempts/);
  s.save('101', '100', '3:31');
  assert.match(s.render(), /70 base attempts/);
  s.runtime.skillCatalog['3'].actions.pop();
  assert.match(s.render(), /Saved recipe is no longer available/);
  s.emit('click', '[data-shopping-edit]');
  assert.doesNotMatch(s.render(), /<option value="3:31"/);
  s.emit('change', '[data-shopping-recipe]', '3:30');
  s.save();
  s.runtime.actionCatalog['99'] = { ...s.runtime.actionCatalog['30'], id: '99', name: 'Obsolete' };
  s.emit('click', '[data-shopping-edit]');
  assert.doesNotMatch(s.render(), /Obsolete/);
});

test('variable, failure-prone and malformed outputs never promise a fixed batch', () => {
  const s = setup();
  s.runtime.actionCatalog['30'].drops[0].amount = 5;
  let html = s.save();
  assert.match(html, /Uncertain output/);
  assert.match(html, /1–5.*per successful drop/);
  assert.match(html, /Attempt count unknown/);
  assert.doesNotMatch(html, /70 base attempts/);
  s.runtime.actionCatalog['30'].drops[0].amount = 1;
  s.runtime.actionCatalog['30'].failDrops = [{ id: '102', chance: 1000 }];
  html = s.render();
  assert.match(html, /70 nominal attempts/);
  assert.match(html, /do not guarantee/);
  delete s.runtime.actionCatalog['30'].failDrops;
  s.runtime.actionCatalog['30'].drops[0].minAmount = 2;
  assert.match(s.render(), /Uncertain output/);
});

test('read-only Refresh retains aged observations on failure and refuses collection or character races', async () => {
  const s = setup(); s.save(); s.h.time(400000);
  assert.match(s.render(), /Observed 5 min ago/);
  assert.deepEqual(s.calls, []);
  s.emit('click', '[data-shopping-refresh]');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.calls, ['read']);
  assert.match(s.render(), /Observed 0 min ago/);
  s.runtime.firebase.getUser = () => { throw Error('Offline'); };
  s.emit('click', '[data-shopping-refresh]');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(s.render(), /Refresh unavailable: Offline/);
  assert.match(s.render(), /70 to acquire/);
  s.runtime.action.actionLoading = true;
  assert.match(s.render(), /Last observation.*balances unavailable/);
  s.emit('click', '[data-shopping-refresh]');
  assert.deepEqual(s.calls, ['read']);
  s.runtime.action.actionLoading = false;
  delete s.runtime.state.user.inventory;
  assert.match(s.render(), /Last observation.*balances unavailable/);
  assert.match(s.render(), /70 to acquire/);
});

test('partial costs, unknown balances and incomplete catalogs leave gaps instead of readiness', () => {
  const s = setup();
  s.runtime.actionCatalog['30'].materials.push({ id: '999', amount: 4 }, { id: '102', amount: null });
  delete s.user.charcoal;
  let html = s.save();
  assert.match(html, /Unknown item \(999\)/);
  assert.match(html, /Unknown Charcoal/);
  assert.match(html, /Incomplete evidence/);
  assert.doesNotMatch(html, /Base materials covered/);
  s.runtime.actionCatalog['30'].materials = [];
  s.runtime.actionCatalog['30'].charcoal = 0;
  delete s.runtime.skillCatalog['4'];
  html = s.save('102', '100', '');
  assert.match(html, /Recipe data unresolved/);
  s.runtime.skillCatalog['4'] = { id: '4', name: 'Smithing', actions: [] };
  assert.match(s.render(), /No current main crafting recipe/);
});

test('duplicate inputs allocate owned stock once; native resources and inventory names remain separate', () => {
  const s = setup();
  s.runtime.catalog['103'] = { id: '103', name: 'Charcoal' };
  s.user.inventory['103'] = { amount: 999 };
  s.runtime.actionCatalog['30'].materials.push({ id: '102', amount: 1 }, { id: '103', amount: 1 });
  const html = s.save();
  assert.match(html, /160 Iron Ore/);
  assert.match(html, /128 Charcoal \(native balance\)/);
  assert.match(html, /data-label="Owned">999/);
  s.runtime.actionCatalog['30'].materials.push({ id: '101', amount: 1 });
  assert.match(s.render(), /70 Iron Bar/);
});

test('all native special balances are included without treating absent balances as zero', () => {
  const s = setup();
  Object.assign(s.runtime.actionCatalog['30'], { compost: 1, metalParts: 1, sigilPieces: 1, potionMix: 1, arcanePowder: 1 });
  Object.assign(s.user, { compost: 5, metalParts: 10, sigilPieces: 15, potionMix: 20 });
  const html = s.save();
  for (const expected of ['65 Compost', '60 Metal Parts', '55 Sigil Pieces', '50 Potion Mix', 'Unknown Arcane Powder']) assert.ok(html.includes(expected));
});

test('nested and failure outputs remain plannable but uncertain; malformed catalogs cannot prove noncraftability', () => {
  const s = setup();
  s.runtime.actionCatalog['30'].drops = [{ chance: 1000, drops: [{ id: '101', chance: 1000 }] }];
  let html = s.save();
  assert.match(html, /Uncertain output/);
  assert.match(html, /data-label="Per attempt">2/);
  assert.doesNotMatch(html, /70 base attempts/);
  s.runtime.actionCatalog['30'].drops = [null];
  s.emit('click', '[data-shopping-clear]');
  html = s.save('101', '100', '');
  assert.match(html, /Recipe data unresolved/);
});

test('invalidated recipes cannot be silently replaced by saving the empty recipe option', () => {
  const s = setup(); s.save();
  s.runtime.actionCatalog['31'] = { ...s.runtime.actionCatalog['30'], id: '31' };
  s.runtime.skillCatalog['3'].actions = [{ id: '31' }];
  s.emit('click', '[data-shopping-edit]');
  assert.match(s.save('101', '100', ''), /Choose a current recipe/);
  assert.match(s.render(), /Saved recipe is no longer available/);
});

test('invalid targets and saved records are rejected; pending loot and unfinished queues never cover a target', () => {
  const s = setup();
  for (const quantity of ['0', '-1', '2.5', 'Infinity', '9007199254740992']) {
    assert.match(s.save('101', quantity), /positive whole-number/);
  }
  s.runtime.action.actionLoot = { '101': { amount: 100000 } };
  s.user.action = { skillId: '3', actionId: '30', amount: 100000 };
  assert.match(s.save(), /70 to acquire/);
  const key = 'iw-status-shopping-v1:' + JSON.stringify(['Player', false]);
  s.storage.set(key, JSON.stringify({ version: 1, plan: { itemId: '101', quantity: -1, recipeKey: '3:30' } }));
  assert.doesNotMatch(setup(s.storage).render(), /to acquire/);
  s.runtime.action.actionLoading = true;
  s.emit('click', '[data-shopping-clear]');
  assert.match(s.save(), /Owned Unknown/);
});

test('read-only refresh rejects another character response and planning stays on Status', async () => {
  const s = setup(); s.save();
  for (const method of ['startAction', 'stopAction', 'buyItem']) s.runtime.firebase[method] = () => { throw Error('Mutation forbidden'); };
  s.runtime.firebase.getUser = () => ({ subscribe(o) { o.next({ user: { ...s.user, displayName: 'Other' }, time: 100001 }); return { unsubscribe() {} }; } });
  s.emit('click', '[data-shopping-refresh]');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(s.render(), /Character changed during synchronization/);
  assert.match(s.render(), /70 to acquire/);
  s.h.context.location.pathname = '/skill/3/action/30';
  assert.doesNotMatch(s.render(), /Finished-item shopping list/);
});

test('unchanged observations reuse native recipe discovery and hidden dashboards defer shopping updates', () => {
  const s = setup(); s.save();
  let catalogReads = 0;
  const actions = s.runtime.skillCatalog['3'].actions;
  Object.defineProperty(s.runtime.skillCatalog['3'], 'actions', { get() { catalogReads++; return actions; } });
  for (let i = 0; i < 10; i++) s.h.context.render();
  assert.equal(catalogReads, 0);
  s.page.hidden = true;
  s.user.inventory['101'].amount = 100;
  s.h.context.render();
  assert.match(s.page.innerHTML, /70 to acquire/);
  s.page.hidden = false;
  s.h.context.render();
  assert.match(s.page.innerHTML, /Target satisfied/);
  assert.equal(catalogReads, 0);
});

test('the item picker contains only current craftable outputs and hides a single recipe choice', () => {
  const s = setup();
  s.runtime.catalog['103'] = { id: '103', name: 'Obsolete Potion' };
  s.runtime.catalog['104'] = { id: '104', name: 'Burnt Bar' };
  s.runtime.catalog['105'] = { id: '105', name: 'Common Mining Rune' };
  s.runtime.actionCatalog['99'] = { id: '99', name: 'Obsolete Potion', materials: [], drops: [{ id: '103', chance: 1000 }] };
  s.runtime.actionCatalog['30'].failDrops = [{ id: '104', chance: 1000 }];
  const html = s.render();
  assert.match(html, /<option value="101"/);
  for (const id of ['102', '103', '104', '105']) assert.doesNotMatch(html, new RegExp(`<option value="${id}"`));
  s.emit('change', '[data-shopping-item]', '101');
  assert.doesNotMatch(s.render(), /<select name="recipe"/);
  assert.match(s.save('101', '100', ''), /70 nominal attempts/);
  s.runtime.actionCatalog['31'] = { ...s.runtime.actionCatalog['30'], id: '31', name: 'Alternative' };
  s.runtime.skillCatalog['3'].actions.push({ id: '31' });
  s.emit('click', '[data-shopping-edit]');
  assert.match(s.render(), /<select name="recipe"/);
});
