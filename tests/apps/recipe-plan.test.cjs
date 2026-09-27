const { test } = require('node:test');
const assert = require('node:assert/strict');
const setupQuick = require('../fixtures/quick-skills.cjs');

function setup(options = {}) {
  let f;
  f = setupQuick({ ...options, remoteUser: user => options.remoteUser?.(user) || structuredClone(f.main.state.user) });
  f.current(null);
  const rt = f.main;
  rt.catalog = Object.fromEntries([['201', 'Iron Sword'], ['202', 'Iron Bar'], ['203', 'Iron Ore'], ['204', 'Seeds'], ['205', 'Chilli']].map(([id, name]) => [id, { id, name }]));
  rt.actionCatalog = {
    '101': { id: '101', name: 'Iron Rock', drops: [{ id: '203', chance: 1000 }] },
    '102': { id: '102', name: 'Iron Bar', materials: [{ id: '203', amount: 2 }], drops: [{ id: '202', chance: 1000 }] },
    '103': { id: '103', name: 'Iron Sword', materials: [{ id: '202', amount: 2 }], drops: [{ id: '201', chance: 1000 }] },
    '105': { id: '105', name: 'Chilli', materials: [{ id: '204', amount: 1 }], compost: 2, drops: [{ id: '205', chance: 1000 }] }
  };
  for (const skill of Object.values(rt.skillCatalog)) skill.actions = [];
  for (const [skill, action] of [['2', '101'], ['3', '102'], ['4', '103'], ['13', '105']]) rt.skillCatalog[skill].actions.push({ id: action });
  rt.state.user.inventory = { '201': { amount: 30 }, '202': { amount: 100 }, '203': { amount: 0 } };
  rt.craftLimit = (user, recipe) => Math.min(...recipe.materials.map(m => Math.floor((user.inventory[m.id]?.amount || 0) / m.amount)));
  rt.actionSkillLevel = () => 100;
  function emit(type, attribute, value = '', dataset = {}, fields = {}) {
    const target = { value, dataset: { recipeOwner: JSON.stringify([f.rt?.state.user.displayName || rt.state.user.displayName, rt.state.isSolo]), ...dataset }, elements: fields, disabled: false,
      matches: selector => selector === `[${attribute}]`, closest: selector => selector.includes(`[${attribute}]`) ? target : null,
      querySelector: selector => ({ value: fields[selector] || '' }) };
    for (const handler of f.listeners[type] || []) handler({ target, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    f.render();
    return f.panel();
  }
  function open() { f.click('data-quick-skills'); f.click('data-recipe-open'); return f.panel(); }
  function save(quantity = '100', item = '201', recipe = '4:103') {
    return emit('submit', 'data-shopping-form', '', { shoppingOwner: '["Player",false]' }, { '[name="item"]': item, '[name="quantity"]': quantity, '[name="recipe"]': recipe });
  }
  return { ...f, emit, open, save, rt };
}

test('calculator preview keeps a manual plan until activation and derives only the remaining chain', () => {
  const f = setup(); f.savePlan('2', '101'); f.open(); f.save();
  assert.match(f.panel(), /Preview recipe plan/);
  assert.match(f.panel(), /80.*Iron Ore/);
  assert.match(f.panel(), /40.*Iron Bar/);
  assert.match(f.panel(), /70.*Iron Sword/);
  assert.match(f.panel(), /Planned next action/);
  f.click('data-recipe-use');
  assert.match(f.panel(), /Active recipe plan/);
  assert.match(f.panel(), /Next.*Mining.*Iron Rock/s);
  f.save('200');
  assert.match(f.panel(), /Active recipe plan[\s\S]*Target owned quantity: 100/);
  assert.match(f.panel(), /Preview recipe plan[\s\S]*Target owned quantity: 200/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('gathering sources, consumed supplies and circular dependencies stay visible while another branch can progress', () => {
  const f = setup(); f.rt.actionCatalog['103'].materials.push({ id: '205', amount: 1 });
  f.rt.actionCatalog['106'] = { ...f.rt.actionCatalog['101'], id: '106', name: 'Deep Iron Rock' };
  f.rt.skillCatalog['2'].actions.push({ id: '106' });
  f.rt.state.user.inventory['204'] = { amount: 100 };
  f.rt.state.user.compost = 0;
  f.open(); f.save(); f.click('data-recipe-use');
  assert.match(f.panel(), /Choose a source/);
  assert.match(f.panel(), /Seeds/);
  assert.match(f.panel(), /Compost/);
  f.emit('change', 'data-recipe-source', '2:106', { recipeScope: 'active', recipeItem: '203' });
  assert.match(f.panel(), /Next · Mining · Deep Iron Rock/);
  f.rt.actionCatalog['101'].materials = [{ id: '203', amount: 1 }];
  f.emit('change', 'data-recipe-source', '2:101', { recipeScope: 'active', recipeItem: '203' });
  assert.match(f.panel(), /circular dependency/);
  assert.match(f.panel(), /No ready action/);
  f.rt.state.user.compost = 140;
  f.render();
  assert.match(f.panel(), /Next · Farming · Chilli/);
});

test('Start next from a native page starts exactly the displayed gathering step and retains the plan', async () => {
  const f = setup({ route: '/skill/2/action/101' }); f.open(); f.save(); f.click('data-recipe-use');
  assert.match(f.panel(), /data-recipe-start/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').map(call => call.slice(1, 4)), [['2', '101', undefined]]);
  assert.equal(f.calls.some(call => call[0] === 'stop' || call[0] === 'frame'), false);
  assert.equal(f.h.context.location.pathname, '/skill/2/action/101');
  f.open();
  assert.match(f.panel(), /Active recipe plan/);
  assert.match(f.panel(), /In progress.*Iron Rock/s);
  assert.match(f.panel(), /Required acquisition: 80/);
  assert.doesNotMatch(f.panel(), /data-recipe-start(?![^>]*disabled)[^>]*>/);
});

test('explicit collection credits observed inventory, replans, and leaves the following action waiting', async () => {
  let f;
  f = setup({ collectionUser: () => ({ ...structuredClone(f.rt.state.user), action: null, inventory: { ...structuredClone(f.rt.state.user.inventory), '203': { amount: 80 } } }) });
  f.open(); f.save(); f.click('data-recipe-use'); f.click('data-recipe-start'); await f.until(() => !f.busy());
  f.rt.action.actionLoot = { '203': { amount: 80 } };
  f.open();
  assert.match(f.panel(), /Pending loot: 80 \(not owned\)/);
  f.click('data-recipe-collect'); await f.until(() => !f.busy());
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  assert.match(f.panel(), /Next · Smelting · Iron Bar/);
  assert.match(f.panel(), /Native quantity: 40/);
  assert.match(f.lastToast().title, /Collected/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['3', '102', 40]);
});

test('uncertain native quantities stay adjustable without inventing an exact output batch', async () => {
  const f = setup(); f.rt.actionCatalog['103'].drops[0].amount = 5;
  f.open(); f.save(); f.click('data-recipe-use');
  assert.match(f.panel(), /Uncertain yield/);
  assert.match(f.panel(), /Choose a native quantity/);
  f.emit('change', 'data-recipe-quantity', '10', { recipeScope: 'active', recipeItem: '201' });
  assert.match(f.panel(), /Next · Smithing · Iron Sword/);
  assert.match(f.panel(), /Native quantity: 10/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['4', '103', 10]);
  assert.equal(JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan.kind, 'recipe');
});

test('changed displayed steps are presented again instead of silently starting a replacement', () => {
  const f = setup(); f.open(); f.save(); f.click('data-recipe-use');
  f.rt.state.user.inventory['203'] = { amount: 80 };
  // The old DOM still displays Iron Rock when this click arrives.
  f.click('data-recipe-start');
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.panel(), /next action or quantity changed/);
  assert.match(f.panel(), /Next · Smelting · Iron Bar/);
});

test('a completed finite batch must be collected separately before its dependent recipe can start', async () => {
  let f;
  f = setup({ collectionUser: () => ({ ...structuredClone(f.rt.state.user), action: null, inventory: { '201': { amount: 30 }, '202': { amount: 140 } } }) });
  f.rt.state.user.action = { skillId: '3', actionId: '102', amount: 40, startDate: '2026-09-27T06:00:00Z' };
  f.rt.action.actionLoot = { '202': { amount: 40 } };
  f.open(); f.save(); f.click('data-recipe-use');
  assert.match(f.panel(), /Collect completed work before starting next/);
  f.click('data-recipe-start');
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
  f.click('data-recipe-collect'); await f.until(() => !f.busy());
  assert.match(f.panel(), /Next · Smithing · Iron Sword/);
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['4', '103', 70]);
});

test('recipe plans persist across reloads, isolate owners, and become satisfied without losing their target', () => {
  const f = setup(); f.open(); f.save(); f.click('data-recipe-use');
  const reload = setup({ storage: f.h.storage }); reload.open();
  assert.match(reload.panel(), /Active recipe plan/);
  reload.rt.state.user.inventory['201'].amount = 100; reload.render();
  assert.match(reload.panel(), /Target satisfied/);
  assert.doesNotMatch(reload.panel(), /data-recipe-start/);
  reload.rt.state.user.inventory['201'].amount = 99; reload.render();
  assert.match(reload.panel(), /Next · Smithing · Iron Sword/);
  assert.match(reload.panel(), /Native quantity: 1/);
  reload.rt.state.isSolo = reload.rt.state.user.isSolo = true; reload.render();
  assert.doesNotMatch(reload.panel(), /Active recipe plan/);
  reload.rt.state.isSolo = reload.rt.state.user.isSolo = false; reload.render();
  assert.match(reload.panel(), /Active recipe plan/);
  reload.rt.state.user.displayName = 'Other'; reload.render();
  assert.doesNotMatch(reload.panel(), /Active recipe plan/);
  reload.rt.state.user.displayName = 'Player'; reload.render();
  assert.match(reload.panel(), /Active recipe plan/);
});

test('failed collection and partial observations retain the plan and never start later work', async () => {
  const f = setup({ stopFailure: true }); f.open(); f.save(); f.click('data-recipe-use');
  f.rt.state.user.action = { skillId: '2', actionId: '101' }; f.rt.action.actionLoot = { '203': { amount: 80 } }; f.render();
  f.click('data-recipe-collect'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.panel(), /Plan kept/);
  assert.match(f.lastToast().title, /not confirmed/);
  delete f.rt.state.user.inventory; f.render();
  assert.match(f.panel(), /Current balances unavailable/);
  assert.match(f.panel(), /Active recipe plan/);
});

test('explicit planner refresh observes external inventory without replaying or collecting native work', async () => {
  let reads = 0;
  const f = setup({ remoteUser: user => ({ ...structuredClone(f.rt.state.user), inventory: { '201': { amount: 100 } } }), onActionSync() { reads++; } });
  f.open(); f.save(); f.click('data-recipe-use');
  f.click('data-recipe-refresh'); await f.until(() => !f.busy());
  assert.match(f.panel(), /Target satisfied/);
  assert.equal(reads, 0);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('shared gathering supplies are allocated once and a ready alternative can be selected explicitly', () => {
  const f = setup();
  f.rt.actionCatalog['103'].materials.push({ id: '205', amount: 1 }, { id: '204', amount: 1 });
  f.rt.actionCatalog['107'] = { id: '107', name: 'Seed Patch', drops: [{ id: '204', chance: 1000 }] };
  f.rt.skillCatalog['17'].actions.push({ id: '107' });
  f.rt.state.user.inventory['204'] = { amount: 100 }; f.rt.state.user.compost = 140;
  f.open(); f.save(); f.click('data-recipe-use');
  assert.match(f.panel(), /40 Seeds/);
  assert.match(f.panel(), /Requires Seeds in owned inventory/);
  f.emit('click', 'data-recipe-select', '', { recipeScope: 'active', recipeItem: '204' });
  assert.match(f.panel(), /Next · Exploring · Seed Patch/);
  f.rt.state.user.inventory['204'].amount = 140; f.render();
  assert.doesNotMatch(f.panel(), /Next · Exploring · Seed Patch/);
  assert.match(f.panel(), /Next · (Mining · Iron Rock|Farming · Chilli)/);
});

test('a saved source cannot silently change after catalog replacement', () => {
  const f = setup(); f.open(); f.save(); f.click('data-recipe-use');
  f.rt.actionCatalog = { ...f.rt.actionCatalog, '106': { ...f.rt.actionCatalog['101'], id: '106', name: 'New Rock' } };
  f.rt.skillCatalog = { ...f.rt.skillCatalog, '2': { ...f.rt.skillCatalog['2'], actions: [{ id: '106' }] } };
  f.render();
  assert.match(f.panel(), /Saved recipe is no longer available/);
  const active = f.panel().split('Active recipe plan')[1].split('Preview recipe plan')[0];
  assert.match(active, /Choose a source/);
  assert.doesNotMatch(f.panel().split('Active recipe plan')[0], /Next · Mining · New Rock/);
});

test('manual conversions remain requirements until the converted resource is observed', () => {
  const f = setup(); f.rt.actionCatalog['103'].metalParts = 3;
  f.rt.state.user.metalParts = 0;
  f.rt.conversionCatalog = { metalParts: { '202': 2 } };
  f.open(); f.save();
  f.emit('change', 'data-shopping-conversion', '202', { shoppingOwner: '["Player",false]', shoppingResource: 'metalParts' });
  f.click('data-recipe-use');
  assert.match(f.panel(), /Manual conversion: 105 Iron Bar → 210 Metal Parts/);
  assert.match(f.panel(), /290 Iron Ore/);
  f.rt.state.user.metalParts = 210; f.render();
  const active = f.panel().split('Active recipe plan')[1].split('Preview recipe plan')[0];
  assert.doesNotMatch(active, /Manual conversion:/);
  assert.match(active, /80 Iron Ore/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('failed or unconfirmed starts retain the recipe plan and never advance it', async () => {
  for (const options of [{ startFailure: true }, { timeout: true }, { wrongTarget: true }]) {
    const f = setup(options); f.open(); f.save(); f.click('data-recipe-use');
    f.click('data-recipe-start'); f.click('data-recipe-start'); await f.until(() => !f.busy());
    assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
    assert.equal(f.calls.some(call => call[0] === 'stop'), false);
    assert.equal(JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan.kind, 'recipe');
  }
});

test('native start revalidates source identity and fresh remote supplies before dispatch', async () => {
  for (const change of ['character', 'supplies', 'activity']) {
    let f;
    f = setup({ beforeNativeStart(runtime) {
      if (change === 'character') runtime.state.user.displayName = 'Other';
      if (change === 'activity') runtime.state.user.action = { skillId: '3', actionId: '102', amount: 1 };
      if (change === 'supplies') runtime.state.user.inventory['201'].amount = 100;
    } });
    f.open(); f.save(); f.click('data-recipe-use'); f.click('data-recipe-start'); await f.until(() => !f.busy());
    assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false, change);
  }
});

test('unique crafts require the native one-item limit even after a quantity edit', () => {
  const f = setup(); f.rt.actionCatalog['103'].uniqueCraft = true;
  f.open(); f.save(); f.click('data-recipe-use');
  f.emit('change', 'data-recipe-quantity', '2', { recipeScope: 'active', recipeItem: '201' });
  assert.match(f.panel(), /unique craft.*one native quantity/i);
  assert.doesNotMatch(f.panel(), /Next · Smithing · Iron Sword/);
});
