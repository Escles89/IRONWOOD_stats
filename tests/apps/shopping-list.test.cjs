const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(storage = new Map(), configure = () => {}) {
  const listeners = {}, calls = [], errors = [], nodes = new Map();
  const page = { hidden: false, innerHTML: '', style: { setProperty() {} }, contains: () => true, querySelector: () => null, querySelectorAll: () => [] };
  const document = { getElementById: id => nodes.get(id) || null, hidden: false, activeElement: null,
    body: { textContent: '', appendChild(node) { nodes.set(node.id, node); } },
    querySelector: selector => selector === '.iw-shopping-modal [data-modal-close]' ? closeControl : nodes.get(selector.slice(1)) || null,
    querySelectorAll: () => [],
    createElement() { return { innerHTML: '', get content() { return { firstElementChild: { markup: this.innerHTML } }; },
      appendChild(child) { this.innerHTML = child.markup; }, remove() { nodes.delete(this.id); } }; },
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); } };
  const closeControl = { focus() { document.activeElement = this; } };
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
  function render() { currentCatalog(); h.context.render(); assert.deepEqual(errors, []); return page.innerHTML + (nodes.get('iw-global-dialogs')?.innerHTML || ''); }
  function emit(type, attr, value, fields, dataset = {}) {
    currentCatalog();
    const target = { value, dataset: { shoppingOwner: JSON.stringify([user.displayName, runtime.state.isSolo]), ...dataset }, open: value === true, disabled: false,
      focus() { document.activeElement = this; },
      matches: selector => selector === attr, closest: selector => selector === attr ? target : null,
      querySelector: selector => ({ value: fields?.[selector] ?? '' }) };
    for (const callback of listeners[type] || []) callback({ target, key: fields?.key, shiftKey: fields?.shiftKey, preventDefault() {}, stopPropagation() {} });
    return render();
  }
  function save(id = '101', quantity = '100', recipe = '3:30') {
    return emit('submit', '[data-shopping-form]', '', { '[name="item"]': id, '[name="quantity"]': quantity, '[name="recipe"]': recipe });
  }
  const modal = () => nodes.get('iw-global-dialogs')?.innerHTML || '';
  const detail = (key = 'item:101') => emit('click', '[data-shopping-step-link]', '', null, { shoppingStepLink: key });
  render();
  return { modal, detail, document, closeControl, h, runtime, user, storage, page, calls, render, emit, save };
}

test('a saved target subtracts owned finished items and shows direct base costs without gameplay mutations', () => {
  const s = setup();
  assert.match(s.render(), /Target owned quantity/);
  s.save();
  const html = s.detail();
  assert.match(html, /70 to acquire/);
  assert.match(html, /70 base attempts/);
  assert.match(html, /90 Iron Ore/);
  assert.match(html, /128 Charcoal/);
  assert.match(html, /Requires Smelting level 10.*current 1/);
  assert.match(html, /aria-label="Recipe chain"/);
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
  s.save('101', '100', '');
  assert.match(s.detail(), /Choose a current recipe/);
  assert.doesNotMatch(s.render(), /70 base attempts/);
  s.save('101', '100', '3:31');
  s.detail();
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
  s.save();
  let html = s.detail();
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
  assert.match(s.render(), /last observation.*balances unavailable/);
  s.emit('click', '[data-shopping-refresh]');
  assert.deepEqual(s.calls, ['read']);
  s.runtime.action.actionLoading = false;
  delete s.runtime.state.user.inventory;
  assert.match(s.render(), /last observation.*balances unavailable/);
  assert.match(s.render(), /70 to acquire/);
});

test('partial costs, unknown balances and incomplete catalogs leave gaps instead of readiness', () => {
  const s = setup();
  s.runtime.actionCatalog['30'].materials.push({ id: '999', amount: 4 }, { id: '102', amount: null });
  delete s.user.charcoal;
  s.save();
  let html = s.detail();
  assert.match(html, /Unknown item \(999\)/);
  assert.match(html, /Unknown Charcoal/);
  assert.match(html, /Incomplete evidence/);
  assert.doesNotMatch(html, /Base materials covered/);
  s.runtime.actionCatalog['30'].materials = [];
  s.runtime.actionCatalog['30'].charcoal = 0;
  delete s.runtime.skillCatalog['4'];
  s.save('102', '100', '');
  html = s.detail('item:102');
  assert.match(html, /Recipe data unresolved/);
  s.runtime.skillCatalog['4'] = { id: '4', name: 'Smithing', actions: [] };
  assert.match(s.render(), /No current main crafting recipe/);
});

test('duplicate inputs allocate owned stock once; native resources and inventory names remain separate', () => {
  const s = setup();
  s.runtime.catalog['103'] = { id: '103', name: 'Charcoal' };
  s.user.inventory['103'] = { amount: 999 };
  s.runtime.actionCatalog['30'].materials.push({ id: '102', amount: 1 }, { id: '103', amount: 1 });
  s.save();
  const html = s.detail();
  assert.match(html, /160 Iron Ore/);
  assert.match(html, /128 Charcoal/);
  assert.match(html, /data-label="Owned">999/);
  s.runtime.actionCatalog['30'].materials.push({ id: '101', amount: 1 });
  assert.match(s.render(), /Recipe cycle to Iron Bar/);
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
  s.save();
  let html = s.detail();
  assert.match(html, /Uncertain output/);
  assert.match(html, /data-label="Per attempt">2/);
  assert.doesNotMatch(html, /70 base attempts/);
  s.runtime.actionCatalog['30'].drops = [null];
  s.emit('click', '[data-shopping-clear]');
  s.save('101', '100', '');
  html = s.detail();
  assert.match(html, /Recipe data unresolved/);
});

test('invalidated recipes cannot be silently replaced by saving the empty recipe option', () => {
  const s = setup(); s.save();
  s.runtime.actionCatalog['31'] = { ...s.runtime.actionCatalog['30'], id: '31' };
  s.runtime.skillCatalog['3'].actions = [{ id: '31' }];
  s.emit('click', '[data-shopping-edit]');
  assert.match(s.save('101', '100', ''), /Choose a current recipe/);
  assert.match(s.detail(), /Saved recipe is no longer available/);
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
  assert.match(s.save(), /Owned<\/dt><dd>Unknown/);
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
  s.save('101', '100', '');
  assert.match(s.detail(), /70 nominal attempts/);
  s.runtime.actionCatalog['31'] = { ...s.runtime.actionCatalog['30'], id: '31', name: 'Alternative' };
  s.runtime.skillCatalog['3'].actions.push({ id: '31' });
  s.emit('click', '[data-shopping-edit]');
  assert.match(s.render(), /<select name="recipe"/);
});

function addRecipe(s, id, name, actionId, materials, extras = {}) {
  s.runtime.catalog[id] = { id, name };
  s.runtime.actionCatalog[actionId] = { id: actionId, name, level: 1, materials, drops: [{ id, chance: 1000 }], ...extras };
  s.runtime.skillCatalog['3'].actions.push({ id: actionId });
}

test('the editable target expands a multilevel chain, reuses owned intermediates and observes deep balances', () => {
  const s = setup();
  addRecipe(s, '102', 'Iron Ore', '31', [{ id: '103', amount: 3 }], { charcoal: 1 });
  s.runtime.catalog['103'] = { id: '103', name: 'Ore Fragments' };
  s.user.inventory['103'] = { amount: 20 };
  s.save();
  let html = s.detail('item:102');
  assert.match(html, /250 Ore Fragments/);
  assert.match(html, /218 Charcoal/);
  assert.match(html, /aria-label="Recipe chain"/);
  assert.match(html, /Stock used 50.*Required output 90/);
  assert.match(html, /href="\/skill\/3\/action\/31"/);
  s.user.inventory['103'].amount = 100;
  assert.match(s.render(), /170 Ore Fragments/);
  s.emit('click', '[data-shopping-edit]');
  s.save('101', '50');
  html = s.detail('item:102');
  assert.match(html, /Required output 0/);
  assert.doesNotMatch(html, /170 Ore Fragments/);
  assert.deepEqual(s.calls, []);
});

test('a diamond combines shared intermediate demand before allocating stock and rounding verified unit batches', () => {
  const s = setup();
  s.user.inventory = { '104': { amount: 1 }, '105': { amount: 2 } };
  s.user.charcoal = 0;
  s.runtime.actionCatalog['30'].materials = [{ id: '102', amount: 1 }, { id: '103', amount: 1 }];
  addRecipe(s, '102', 'Left Part', '31', [{ id: '104', amount: 1 }]);
  addRecipe(s, '103', 'Right Part', '32', [{ id: '104', amount: 1 }]);
  addRecipe(s, '104', 'Shared Part', '33', [{ id: '105', amount: 3 }]);
  s.runtime.catalog['105'] = { id: '105', name: 'Dust' };
  // Each arm needs one. The shared 1.5 stock leaves 0.5 to produce:
  // rounding after aggregation needs one verified unit attempt, not two.
  s.user.inventory['104'].amount = 1.5;
  s.save('101', '1');
  const html = s.detail('item:104');
  assert.match(html, /1 Dust/);
  assert.match(html, /Required<\/dt><dd>2<\/dd>.*Owned<\/dt><dd>1.5<\/dd>.*To produce<\/dt><dd>0.5<\/dd>/);
  assert.match(html, /Stock used 1.5.*Required output 0.5.*Projected surplus 0.5 \(not owned inventory\)/);
  assert.equal((s.modal().match(/role="dialog"/g) || []).length, 1);
  assert.match(html, /Shared requirement/);
  for (const id of ['101', '102', '103', '104']) assert.ok(html.includes(`data-shopping-node="item:${id}" data-supply="insufficient"`));
  s.emit('click', '[data-shopping-step-link]', '', null, { shoppingStepLink: 'item:104' });
  assert.match(s.modal(), /<h2 id="iw-shopping-step-title">Shared Part<\/h2>/);
  assert.deepEqual(s.calls, []);
});

test('intermediate recipe choices persist, survive target edits and require explicit replacement when invalidated', () => {
  const configure = runtime => {
    runtime.catalog['103'] = { id: '103', name: 'Fragments' };
    for (const [id, amount] of [['31', 3], ['32', 5]]) {
      runtime.actionCatalog[id] = { id, name: `Ore route ${id}`, level: 1, materials: [{ id: '103', amount }], drops: [{ id: '102', chance: 1000 }] };
      runtime.skillCatalog['3'].actions.push({ id });
    }
  };
  const s = setup(new Map(), configure);
  s.save();
  assert.match(s.detail('item:102'), /Recipe for Iron Ore/);
  assert.match(s.render(), /Choose a current recipe/);
  s.emit('change', '[data-shopping-chain-recipe]', '3:32', null, { shoppingRecipeItem: '102' });
  assert.match(s.render(), /450 Fragments/);
  const reload = setup(s.storage, configure);
  assert.match(reload.render(), /450 Fragments/);
  reload.emit('click', '[data-shopping-edit]');
  assert.match(reload.save('101', '110'), /550 Fragments/);
  reload.runtime.skillCatalog['3'].actions = [{ id: '30' }, { id: '31' }];
  assert.match(reload.detail('item:102'), /Saved recipe is no longer available/);
  assert.doesNotMatch(reload.render(), /330 Fragments/);
  reload.emit('change', '[data-shopping-chain-recipe]', '3:31', null, { shoppingRecipeItem: '102' });
  assert.match(reload.render(), /330 Fragments/);
  reload.runtime.skillCatalog['3'].actions = [{ id: '30' }];
  assert.match(reload.detail('item:102'), /Saved recipe is no longer available/);
  assert.deepEqual(reload.calls, []);
});

test('uncertain or unresolved intermediate production makes deterministic parent totals nominal', () => {
  const s = setup();
  addRecipe(s, '102', 'Iron Ore', '31', [{ id: '103', amount: 3 }], { failDrops: [{ id: '104', chance: 1000 }] });
  s.runtime.catalog['103'] = { id: '103', name: 'Fragments' };
  s.save();
  let html = s.detail();
  assert.match(html, /70 nominal attempts/);
  assert.match(html, /Uncertain recipe chain/);
  assert.match(html, /270 Fragments/);
  s.runtime.actionCatalog['31'].drops[0].amount = 5;
  html = s.render();
  assert.match(html, /Unknown Fragments/);
  assert.match(html, /70 nominal attempts/);
  assert.doesNotMatch(html, /Base materials covered/);
  s.user.inventory['102'].amount = 200;
  assert.match(s.render(), /70 base attempts/);
  s.user.inventory['102'].amount = 50;
  addRecipe(s, '102', 'Iron Ore', '32', [{ id: '103', amount: 4 }]);
  delete s.runtime.actionCatalog['31'];
  s.runtime.skillCatalog['3'].actions = [{ id: '30' }, { id: '32' }];
  html = s.render();
  assert.match(s.detail('item:102'), /Saved recipe is no longer available/);
  assert.match(html, /70 nominal attempts/);
});

test('cycles stop only the affected branch and incomplete identities remain separate from verified acquisition leaves', () => {
  const s = setup();
  addRecipe(s, '102', 'Iron Ore', '31', [{ id: '101', amount: 1 }, { id: '103', amount: 2 }]);
  s.runtime.catalog['103'] = { id: '103', name: 'Flux' };
  s.save();
  let html = s.detail('item:102');
  assert.match(html, /Recipe cycle to Iron Bar/);
  assert.match(html, /180 Flux/);
  assert.match(s.detail(), /70 nominal attempts/);
  assert.match(html, /Incomplete plan/);
  assert.deepEqual(s.calls, []);
  s.runtime.actionCatalog['31'].materials = [{ id: '999', amount: 1 }, { id: '103', amount: 2 }];
  html = s.render();
  assert.match(html, /Unknown item \(999\)/);
  assert.match(html, /180 Flux/);
  assert.match(s.detail('item:999'), /Recipe data unresolved/);
  assert.doesNotMatch(html, /Base materials covered/);
  s.user.inventory['101'].amount = 100;
  assert.match(s.render(), /Target satisfied/);
  assert.doesNotMatch(s.render(), /Recipe cycle to/);
  s.user.inventory['101'].amount = 0;
  assert.match(s.render(), /100 to acquire/);
});

test('known shared costs remain visible when another branch has unknown output', () => {
  const s = setup();
  s.user.inventory = {};
  s.runtime.actionCatalog['30'].materials = [{ id: '102', amount: 1 }, { id: '103', amount: 1 }];
  addRecipe(s, '102', 'Certain Part', '31', [{ id: '104', amount: 3 }]);
  addRecipe(s, '103', 'Variable Part', '32', [{ id: '104', amount: 4 }], { drops: [{ id: '103', chance: 1000, amount: 5 }] });
  s.runtime.catalog['104'] = { id: '104', name: 'Shared Dust' };
  s.save('101', '10');
  const html = s.detail('item:104');
  assert.match(html, /Unknown Shared Dust/);
  assert.match(html, /Known required subtotal 30; complete requirement unknown/);
  assert.match(s.detail(), /10 nominal attempts/);
  assert.doesNotMatch(html, /Base materials covered/);
});


test('open item details survive new observations, and invalid stored recipe maps are rejected', () => {
  const s = setup(); s.save();
  s.detail();
  s.user.inventory['101'].amount = 40;
  let html = s.render();
  assert.match(s.modal(), /<h2 id="iw-shopping-step-title">Iron Bar<\/h2>/);
  assert.match(s.modal(), /60 base attempts/);
  assert.match(html, /60 to acquire/);
  const key = 'iw-status-shopping-v1:' + JSON.stringify(['Player', false]);
  for (const recipes of [[], { bad: '3:30' }, { '102': 30 }, { '102': '3:broken' }]) {
    s.storage.set(key, JSON.stringify({ version: 1, plan: { itemId: '101', quantity: 100, recipeKey: '3:30', recipes } }));
    assert.doesNotMatch(setup(s.storage).render(), /to acquire/);
  }
});

test('the icon tree shows dependencies and propagates an insufficient leaf to its parent icons', () => {
  const s = setup();
  s.runtime.catalog['101'].image = 'items/iron-bar.png';
  addRecipe(s, '102', 'Iron Ore', '31', [{ id: '103', amount: 3 }]);
  s.runtime.catalog['103'] = { id: '103', name: 'Fragments', image: 'items/fragments.png' };
  s.user.charcoal = 1000;
  let html = s.save();
  assert.match(html, /class="iw-shopping-tree"/);
  assert.match(html, /<ul class="iw-shopping-branches"[^>]*>/);
  assert.match(html, /data-shopping-node="item:101" data-supply="insufficient"/);
  assert.match(html, /data-shopping-node="item:102" data-supply="insufficient"/);
  assert.match(html, /data-shopping-node="item:103" data-supply="insufficient"/);
  assert.match(html, /src="\/assets\/items\/iron-bar.png"/);
  assert.match(html, /Materials insufficient/);
  s.user.inventory['103'] = { amount: 1000 };
  html = s.render();
  assert.match(html, /data-shopping-node="item:101" data-supply="covered"/);
  assert.match(html, /data-shopping-node="item:102" data-supply="covered"/);
  s.user.inventory['103'].amount = null;
  assert.match(s.render(), /data-shopping-node="item:101" data-supply="unknown"/);
});


test('the shopping list is the last card on Status', () => {
  const s = setup();
  const html = s.save();
  const cards = [...html.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.equal(cards.at(-1), 'iw-card iw-shopping-card');
  assert.ok(html.indexOf('iw-shopping-card') > html.indexOf('iw-potion-card'));
});

test('native recipe links navigate through the game router without starting production', async () => {
  const s = setup(); s.save();
  const routes = [];
  s.runtime.router = { async navigateByUrl(route) { routes.push(route); return true; } };
  s.emit('click', '[data-shopping-native-recipe]', '', null, { shoppingNativeRecipe: '3:30' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(routes, ['/skill/3/action/30']);
  assert.deepEqual(s.calls, []);
  assert.equal(s.page.hidden, true);
});

test('opening the native recipe already behind Status reveals it without another navigation', async () => {
  const s = setup(); s.save();
  s.runtime.router = { url: '/skill/3/action/30', async navigateByUrl() { throw Error('Already on this route'); } };
  s.emit('click', '[data-shopping-native-recipe]', '', null, { shoppingNativeRecipe: '3:30' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.page.hidden, true);
  assert.deepEqual(s.calls, []);
});

test('special resources use the native item artwork instead of initials', () => {
  const s = setup();
  Object.assign(s.runtime.actionCatalog['30'], { metalParts: 8, sigilPieces: 16, arcanePowder: 2, compost: 1, potionMix: 1 });
  const html = s.save();
  for (const name of ['metal-parts', 'sigil-pieces', 'arcane-powder', 'charcoal', 'compost', 'potion-mix']) {
    assert.ok(html.includes(`src="/assets/items/${name}.png"`), name);
  }
  assert.doesNotMatch(html, /aria-hidden="true">(?:MP|SP|AP)<\/span>/);
});


test('the compact icon tree opens one step in a modal and Escape returns focus to its icon', () => {
  const s = setup(); s.save();
  assert.doesNotMatch(s.page.innerHTML, /<table|<details|Stock used|Shared requirements are combined|Click an item for step details|native balance/);
  assert.match(s.page.innerHTML, /aria-haspopup="dialog"/);
  assert.match(s.page.innerHTML, /Target<\/dt><dd>100<\/dd>.*Owned<\/dt><dd>30/);
  assert.equal(s.modal(), '');
  s.detail('resource:charcoal');
  assert.match(s.modal(), /role="dialog" aria-modal="true"/);
  assert.match(s.modal(), /<h2 id="iw-shopping-step-title">Charcoal<\/h2>/);
  assert.match(s.modal(), /data-label="Required">140/);
  assert.match(s.modal(), /data-label="Owned">12/);
  assert.equal(s.document.activeElement, s.closeControl);
  assert.doesNotMatch(s.page.innerHTML, /<table/);
  s.emit('keydown', '', '', { key: 'Escape' });
  assert.equal(s.modal(), '');
  assert.equal(s.document.activeElement.dataset.shoppingStepLink, 'resource:charcoal');
  s.detail();
  assert.match(s.modal(), /70 base attempts/);
  s.user.inventory['101'].amount = 40;
  s.render();
  assert.match(s.modal(), /60 base attempts/);
  s.user.displayName = 'Other';
  s.render();
  assert.equal(s.modal(), '');
});

test('resource balances and inventory items with the same name remain distinguishable in details', () => {
  const s = setup();
  s.runtime.catalog['103'] = { id: '103', name: 'Charcoal' };
  s.user.inventory['103'] = { amount: 999 };
  s.runtime.actionCatalog['30'].materials.push({ id: '103', amount: 1 });
  s.save();
  assert.match(s.detail(), /Charcoal<small>Resource balance<\/small>/);
  assert.match(s.modal(), /Charcoal<small>Inventory<\/small>/);
  s.detail('resource:charcoal');
  assert.match(s.modal(), /Resource balance · Materials insufficient/);
  s.detail('item:103');
  assert.match(s.modal(), /Inventory · Covered by owned stock/);
});

function conversionFixture(runtime) {
  runtime.conversionCatalog = { metalParts: { '103': 3 }, potionMix: { '104': 6 } };
  Object.assign(runtime.catalog, { '103': { id: '103', name: 'Copper Body' }, '104': { id: '104', name: 'Basic Health Potion' } });
  runtime.state.user.metalParts = 2;
  runtime.state.user.potionMix = 1;
  runtime.state.user.inventory = { '103': { amount: 1 }, '102': { amount: 1 } };
  runtime.actionCatalog['30'].materials = [{ id: '102', amount: 1 }];
  delete runtime.actionCatalog['30'].charcoal;
  runtime.actionCatalog['30'].metalParts = 4;
  runtime.actionCatalog['30'].potionMix = 5;
  runtime.skillCatalog['4'].actions.push({ id: '40' });
  runtime.actionCatalog['40'] = { id: '40', name: 'Copper Body', materials: [{ id: '102', amount: 2 }], drops: [{ id: '103', chance: 1000 }] };
}

test('saved conversion inputs expand recipes, round fixed yields and share source stock with the whole plan', () => {
  const s = setup(new Map(), conversionFixture);
  s.save('101', '3');
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  s.emit('change', '[data-shopping-conversion]', '104', null, { shoppingResource: 'potionMix' });
  // 12 parts - 2 owned => 4 bodies; 1 owned => craft 3, costing 6 ore.
  // Root also needs 3 ore; 1 owned is used once => 8 missing ore.
  assert.match(s.render(), /8 Iron Ore/);
  assert.match(s.render(), /3 Basic Health Potion/); // ceil((15 - 1) / 6)
  assert.match(s.detail('resource:metalParts'), /4 conversions/);
  assert.match(s.modal(), /Projected surplus 2/);
  assert.match(s.modal(), /1 Copper Body → 3 Metal Parts/);
  assert.match(s.detail('resource:potionMix'), /Projected surplus 4/);
  assert.match(s.render(), /data-shopping-node="item:103"/);
  const reload = setup(s.storage, conversionFixture);
  assert.match(reload.render(), /8 Iron Ore/);
  reload.emit('click', '[data-shopping-clear]');
  reload.save('101', '3');
  assert.match(reload.render(), /8 Iron Ore/);
  reload.user.displayName = 'Other';
  reload.save('101', '3');
  assert.doesNotMatch(reload.render(), /data-shopping-node="item:103"/);
  assert.deepEqual(s.calls, []);
});

test('conversion defaults can be set before a target, removed, and retained visibly when native inputs disappear', () => {
  const s = setup(new Map(), conversionFixture);
  s.detail('defaults');
  assert.match(s.modal(), /Default inputs/);
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  const reload = setup(s.storage, conversionFixture);
  reload.save('101', '3');
  assert.match(reload.render(), /8 Iron Ore/);
  reload.runtime.conversionCatalog = { ...reload.runtime.conversionCatalog, metalParts: {} };
  assert.match(reload.detail('resource:metalParts'), /Saved conversion input is unavailable/);
  assert.match(reload.modal(), /Saved input unavailable/);
  assert.match(reload.render(), /Incomplete plan/);
  reload.emit('change', '[data-shopping-conversion]', '', null, { shoppingResource: 'metalParts' });
  assert.match(reload.render(), /10 Metal Parts/);
  assert.doesNotMatch(reload.render(), /data-shopping-node="item:103"/);
});

test('conversion cycles remain uncertain and covered balances do not consume conversion sources', () => {
  const s = setup(new Map(), runtime => {
    conversionFixture(runtime);
    runtime.actionCatalog['40'].metalParts = 1;
  });
  s.save('101', '3');
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  assert.match(s.detail('item:103'), /Recipe cycle to Metal Parts/);
  assert.match(s.render(), /Incomplete plan/);
  s.user.metalParts = 12;
  assert.doesNotMatch(s.render(), /Incomplete plan/);
  assert.match(s.detail('resource:metalParts'), /0 conversions/);
  assert.match(s.modal(), /Stock used 12.*Required output 0/);
});

test('partly unknown conversion demand preserves known source and ingredient subtotals', () => {
  const s = setup(new Map(), runtime => {
    conversionFixture(runtime);
    runtime.catalog['105'] = { id: '105', name: 'Uncertain Intermediate' };
    runtime.actionCatalog['30'].materials = [{ id: '105', amount: 1 }];
    runtime.skillCatalog['4'].actions.push({ id: '41' });
    runtime.actionCatalog['41'] = { id: '41', name: 'Uncertain Intermediate', metalParts: 1, materials: [], drops: [{ id: '105', chance: 1000, amount: 2 }] };
  });
  s.save('101', '3');
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  assert.match(s.detail('item:103'), /Known required subtotal 4; complete requirement unknown/);
  assert.match(s.detail('item:102'), /Known required subtotal 6; complete requirement unknown/);
  assert.match(s.render(), /Incomplete plan/);
});

function woodFixture(runtime) {
  runtime.conversionCatalog = { charcoal: { '106': 1, '107': 8 } };
  Object.assign(runtime.catalog, { '106': { id: '106', name: 'Pine Log', image: 'items/wood-pine.png' }, '107': { id: '107', name: 'Ancient Log', image: 'items/wood-ancient.png' } });
  runtime.state.user.inventory = { '106': { amount: 3 }, '107': { amount: 2 } };
  runtime.state.user.charcoal = 1;
  runtime.actionCatalog['30'].materials = [{ id: '107', amount: 1 }];
  runtime.actionCatalog['30'].charcoal = 12;
}

test('Charcoal uses all spare wood types after reserving recipe stock and observes changing wood balances', () => {
  const s = setup(new Map(), woodFixture);
  s.save('101', '1');
  // 12 required - 1 charcoal owned; one Ancient Log is reserved for crafting.
  // The other Ancient Log (8) and three Pine Logs (3) cover all 11.
  assert.match(s.render(), /Materials covered/);
  assert.match(s.detail('resource:charcoal'), /11 from wood · 0 still to acquire/);
  assert.match(s.modal(), /Ancient Log/);
  assert.match(s.modal(), /Pine Log/);
  assert.match(s.detail('item:107'), /Required<\/th>/);
  s.user.inventory['106'].amount = 2;
  assert.match(s.render(), /1 Charcoal/);
  assert.match(s.detail('resource:charcoal'), /10 from wood · 1 still to acquire/);
  assert.deepEqual(s.calls, []);
});

test('Charcoal conversion rounds whole logs, reports surplus and never counts pending loot or unknown stock', () => {
  const s = setup(new Map(), runtime => {
    woodFixture(runtime);
    runtime.actionCatalog['30'].materials = [];
    runtime.actionCatalog['30'].charcoal = 10;
  });
  s.save('101', '1');
  assert.match(s.detail('resource:charcoal'), /16 from wood · 0 still to acquire · Projected surplus 7/);
  assert.match(s.render(), /Materials covered/);
  s.user.inventory['107'].amount = null;
  assert.match(s.detail('resource:charcoal'), /3 from wood · Unknown still to acquire/);
  assert.match(s.modal(), /Some available wood balances are unknown/);
  assert.match(s.render(), /Incomplete plan/);
  delete s.user.inventory['107'];
  s.user.loot = { '107': { amount: 1000 } };
  assert.match(s.render(), /6 Charcoal/);
  s.user.charcoal = 10;
  assert.match(s.detail('resource:charcoal'), /0 from wood · 0 still to acquire/);
  assert.doesNotMatch(s.render(), /data-shopping-node="item:106"/);
});

test('shared Charcoal demand across multiple recipes uses each log balance only once', () => {
  const s = setup(new Map(), runtime => {
    woodFixture(runtime);
    runtime.actionCatalog['30'].materials = [{ id: '108', amount: 1 }];
    runtime.actionCatalog['30'].charcoal = 10;
    runtime.catalog['108'] = { id: '108', name: 'Handle' };
    runtime.skillCatalog['4'].actions.push({ id: '42' });
    runtime.actionCatalog['42'] = { id: '42', name: 'Handle', materials: [{ id: '107', amount: 1 }], charcoal: 10, drops: [{ id: '108', chance: 1000 }] };
  });
  s.save('101', '1');
  assert.match(s.render(), /8 Charcoal/);
  assert.match(s.detail('resource:charcoal'), /Required 20 · Owned 1/);
  assert.match(s.modal(), /11 from wood · 8 still to acquire/);
});

test('Recipe Calc keeps Inputs in Edit and preserves expanded recipe details during observations', () => {
  const s = setup();
  s.save();
  assert.match(s.render(), /Recipe Calc<sup>™<\/sup>/);
  assert.doesNotMatch(s.page.innerHTML, /data-shopping-step-link="defaults"/);
  s.emit('click', '[data-shopping-edit]');
  assert.match(s.page.innerHTML, /data-shopping-step-link="defaults"/);
  s.emit('click', '[data-shopping-cancel]');
  s.detail();
  s.emit('toggle', '[data-shopping-recipe-details]', true, null, { shoppingStep: 'item:101' });
  s.user.inventory['101'].amount = 40;
  s.render();
  assert.match(s.modal(), /data-shopping-recipe-details[^>]* open/);
  assert.match(s.modal(), /60 base attempts/);
  s.emit('toggle', '[data-shopping-recipe-details]', false, null, { shoppingStep: 'item:101' });
  assert.doesNotMatch(s.modal(), /data-shopping-recipe-details[^>]* open/);
});

test('Can make now counts additional output independently of target and observes inventory changes', () => {
  const s = setup();
  s.save('101', '31');
  assert.match(s.render(), /Can make now<\/dt><dd>6<\/dd>/);
  s.save('101', '1000');
  assert.match(s.render(), /Can make now<\/dt><dd>6<\/dd>/);
  s.user.charcoal = 100;
  assert.match(s.render(), /Can make now<\/dt><dd>25<\/dd>/);
  assert.deepEqual(s.calls, []);
});

test('capacity includes saved conversions and reserves shared wood for the full chain', () => {
  const s = setup(new Map(), runtime => {
    conversionFixture(runtime);
    runtime.state.user.inventory['102'].amount = 20;
    runtime.state.user.inventory['104'] = { amount: 2 };
  });
  s.save('101', '1');
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  s.emit('change', '[data-shopping-conversion]', '104', null, { shoppingResource: 'potionMix' });
  assert.match(s.render(), /Can make now<\/dt><dd>2<\/dd>/);
  const wood = setup(new Map(), woodFixture);
  wood.save('101', '10');
  assert.match(wood.render(), /Can make now<\/dt><dd>1<\/dd>/);
  wood.user.inventory['107'].amount = 0;
  assert.match(wood.render(), /Can make now<\/dt><dd>0<\/dd>/);
});

test('capacity exposes uncertain limits and preserves a proven lower bound from owned intermediates', () => {
  const s = setup(new Map(), runtime => {
    conversionFixture(runtime);
    runtime.state.user.inventory['102'].amount = 20;
    runtime.state.user.potionMix = 100;
    runtime.actionCatalog['40'].drops[0].amount = 2;
  });
  s.save('101', '1');
  s.emit('change', '[data-shopping-conversion]', '103', null, { shoppingResource: 'metalParts' });
  assert.match(s.render(), /Can make now<\/dt><dd>≥ 1<\/dd>/);
  assert.match(s.render(), /Exact capacity unknown/);
  s.runtime.actionCatalog['30'].drops[0].amount = 2;
  assert.match(s.render(), /Can make now<\/dt><dd>Unknown<\/dd>/);
});
