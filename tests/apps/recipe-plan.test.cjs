const { test } = require('node:test');
const assert = require('node:assert/strict');
const setupQuick = require('../fixtures/quick-skills.cjs');

test('both balance-only choices save with the plan, cancel cleanly, and can return to mixed inputs', () => {
  const f = setup();
  Object.assign(f.rt.actionCatalog['103'], { charcoal: 2, arcanePowder: 50 });
  Object.assign(f.rt.state.user, { charcoal: 0, arcanePowder: 0 });
  f.rt.conversionCatalog = { charcoal: { '202': 1 }, arcanePowder: { '203': 50 } };
  f.rt.state.user.inventory['203'].amount = 1;
  const saved = () => JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan;
  f.open(); f.save('31'); f.click('data-shopping-edit');
  for (const resource of ['charcoal', 'arcanePowder']) {
    f.emit('change', 'data-shopping-conversion', 'balance', { shoppingOwner: '["Player",false]', shoppingResource: resource });
  }
  assert.deepEqual(saved().conversions, {});
  f.save('31');
  assert.deepEqual(saved().conversions, { charcoal: 'balance', arcanePowder: 'balance' });
  assert.match(f.panel(), /Requires Charcoal, Arcane Powder in owned inventory/);
  assert.doesNotMatch(f.panel(), /Saved input unavailable|Spare owned (wood|gems) can supply/);
  f.click('data-shopping-edit');
  f.emit('change', 'data-shopping-conversion', '', { shoppingOwner: '["Player",false]', shoppingResource: 'arcanePowder' });
  f.click('data-shopping-cancel');
  assert.equal(saved().conversions.arcanePowder, 'balance');
  for (const resource of ['charcoal', 'arcanePowder']) {
    f.emit('change', 'data-recipe-conversion', '', { recipeScope: 'active', recipeItem: resource });
  }
  assert.deepEqual(saved().conversions, {});
  assert.match(f.panel(), /Spare owned gems can supply 50 Arcane Powder/);
  f.emit('change', 'data-recipe-conversion', 'balance', { recipeScope: 'active', recipeItem: 'arcanePowder' });
  assert.equal(saved().conversions.arcanePowder, 'balance');
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('mixed gem projections cover calculator demand while crafting still waits for actual powder', () => {
  const f = setup();
  Object.assign(f.rt.catalog, { '206': { id: '206', name: 'Ruby' }, '207': { id: '207', name: 'Onyx' } });
  Object.assign(f.rt.state.user.inventory, { '206': { amount: 2 }, '207': { amount: 1 } });
  f.rt.actionCatalog['103'].arcanePowder = 500;
  f.rt.state.user.arcanePowder = 0;
  f.rt.conversionCatalog = { arcanePowder: { '206': 50, '207': 400 } };
  f.open(); f.save('31');
  assert.match(f.panel(), /Spare owned gems can supply 500 Arcane Powder through manual conversion/);
  assert.match(f.panel(), /Requires Arcane Powder in owned inventory/);
  assert.match(f.panel(), /No ready action/);
  f.rt.state.user.arcanePowder = 500;
  f.render();
  assert.match(f.panel(), /Next · Smithing · Iron Sword/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('gem and wood inputs save together and derive gathering steps without treating conversion output as owned', () => {
  const f = setup();
  Object.assign(f.rt.catalog, { '206': { id: '206', name: 'Ruby', image: 'items/gem-ruby.png' }, '207': { id: '207', name: 'Pine Log', image: 'items/wood-pine.png' } });
  f.rt.actionCatalog['106'] = { id: '106', name: 'Pine Tree', drops: [{ id: '207', chance: 1000 }] };
  f.rt.skillCatalog['1'].actions.push({ id: '106' });
  Object.assign(f.rt.actionCatalog['103'], { arcanePowder: 120, charcoal: 2 });
  Object.assign(f.rt.state.user, { arcanePowder: 0, charcoal: 0 });
  f.rt.conversionCatalog = { arcanePowder: { '206': 50 }, charcoal: { '207': 1 } };
  f.open(); f.save('31'); f.click('data-shopping-edit');
  for (const [resource, item] of [['arcanePowder', '206'], ['charcoal', '207']]) {
    f.emit('change', 'data-shopping-conversion', item, { shoppingOwner: '["Player",false]', shoppingResource: resource });
  }
  f.save('31');
  const saved = JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan;
  assert.deepEqual(saved.conversions, { arcanePowder: '206', charcoal: '207' });
  assert.match(f.panel(), /Next · Woodcutting · Pine Tree/);
  assert.match(f.panel(), /Manual conversion: 3 Ruby → 150 Arcane Powder/);
  assert.match(f.panel(), /Requires Charcoal, Arcane Powder in owned inventory/);
  assert.match(f.panel(), /value="206" data-stock="empty" selected/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

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

function setupRunner(options = {}) {
  let f, sequence = 0;
  f = setup({ ...options, startIdentity: () => ({ startDate: new Date(1800000000000 + sequence++ * 1000).toISOString(), seed: sequence }),
    collectionUser: () => {
      const user = structuredClone(f.rt.state.user);
      for (const [id, item] of Object.entries(f.rt.action.actionLoot)) user.inventory[id] = { amount: (user.inventory[id]?.amount || 0) + item.amount };
      user.action = null;
      return user;
    } });
  f.h.context.navigator = { locks: options.locks || { request: async (name, settings, task) => task({ name }) } };
  f.h.context.automationEnabled = () => true;
  const record = () => JSON.parse(f.h.storage.get('iw-status-recipe-run-v1:["Player",false]') || 'null');
  return { ...f, record, tick: () => f.h.context.recipeRunnerTick(), badge: () => f.h.context.renderRecipeRunnerBadge() };
}

test('Save activates automatic gathering, collection and successive crafting until the target is satisfied', async () => {
  const f = setupRunner(); f.open(); f.save();
  assert.equal(f.record().enabled, true);
  assert.match(f.badge(), /Recipe planner · Waiting/);
  await f.tick();
  assert.equal(f.record().status, 'running', f.record().reason);
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').map(call => call.slice(1, 4)), [['2', '101', undefined]]);
  assert.match(f.badge(), /Recipe planner · Running/);
  f.rt.action.actionLoot = { '203': { amount: 79 } };
  await f.tick();
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 0);
  f.rt.action.actionLoot['203'].amount = 80;
  await f.tick();
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  await f.tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['3', '102', 40]);
  f.rt.action.actionLoot = { '202': { amount: 39 } };
  await f.tick();
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  f.rt.action.actionLoot['202'].amount = 40;
  await f.tick(); await f.tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['4', '103', 70]);
  f.rt.action.actionLoot = { '201': { amount: 70 } };
  await f.tick(); await f.tick();
  assert.equal(f.record().status, 'complete', f.record().reason);
  assert.equal(f.record().enabled, false);
  assert.match(f.badge(), /Recipe planner · Complete/);
  const count = f.calls.length;
  f.rt.state.user.inventory['201'].amount = 0;
  await f.tick();
  assert.equal(f.calls.length, count); // Spending later never restarts a completed run.
});

test('Pause is available during native preparation and revokes the pending automatic start', async () => {
  let f, paused = false;
  f = setupRunner({ beforeSync: () => {
    if (f?.record()?.status === 'starting' && !paused) { paused = true; f.h.context.recipeRunnerPause(); }
  } });
  f.open(); f.save(); await f.tick();
  assert.equal(paused, true);
  assert.equal(f.record().enabled, false);
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.badge(), /Recipe planner · Paused/);
  f.click('data-recipe-run-toggle'); await f.tick();
  assert.equal(f.record().status, 'running', f.record().reason);
});

test('automatic progression waits for unrelated work, pauses on manual action changes, and follows an explicitly saved matching action', async () => {
  const f = setupRunner(); f.open(); f.save();
  f.rt.state.user.action = { skillId: '13', actionId: '105', startDate: '2026-10-17T01:00:00Z' };
  await f.tick();
  assert.equal(f.record().status, 'waiting');
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
  f.rt.state.user.action = null;
  await f.tick();
  assert.equal(f.record().status, 'running', f.record().reason);
  f.rt.state.user.action = { skillId: '13', actionId: '105', startDate: '2026-10-17T02:00:00Z' };
  await f.tick();
  assert.equal(f.record().enabled, false);
  assert.match(f.record().reason, /changed outside/);
  f.rt.state.user.action = { skillId: '2', actionId: '101', startDate: '2026-10-17T03:00:00Z' };
  f.save();
  assert.equal(f.record().status, 'running');
  f.rt.action.actionLoot = { '203': { amount: 80 } };
  await f.tick();
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
});

test('automatic runs coordinate duplicate ticks and another tab through an exclusive browser lock', async () => {
  let release, acquired = false;
  const locks = { request: async (name, settings, task) => {
    assert.equal(settings.ifAvailable, true);
    assert.match(name, /recipe-run.*Player/);
    acquired = true;
    await new Promise(resolve => { release = resolve; });
    return task({ name });
  } };
  const f = setupRunner({ locks }); f.open(); f.save();
  const first = f.tick();
  await f.until(() => acquired);
  await f.tick();
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  release(); await first;
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  const g = setupRunner({ locks: { request: async (name, options, task) => task(null) } });
  g.open(); g.save(); await g.tick();
  assert.equal(g.calls.some(call => ['start', 'stop', 'sync'].includes(call[0])), false);
});

test('manual requirements wait without repeated reads and changed inventory makes the plan ready', async () => {
  const f = setupRunner();
  f.rt.actionCatalog['103'].arcanePowder = 1; f.rt.state.user.arcanePowder = 0;
  f.open(); f.save('31'); await f.tick();
  assert.equal(f.record().status, 'attention');
  assert.equal(f.record().enabled, true);
  const reads = f.calls.filter(call => call[0] === 'sync').length;
  await f.tick(); await f.tick();
  assert.equal(f.calls.filter(call => call[0] === 'sync').length, reads);
  f.rt.state.user.arcanePowder = 1;
  await f.tick();
  assert.equal(f.record().status, 'running', f.record().reason);
});

test('unconfirmed native starts and collections pause without automatic retries', async () => {
  for (const failure of ['startFailure', 'stopFailure']) {
    const f = setupRunner({ [failure]: true }); f.open(); f.save();
    await f.tick();
    if (failure === 'stopFailure') { f.rt.action.actionLoot = { '203': { amount: 80 } }; await f.tick(); }
    assert.equal(f.record().enabled, false, f.record().reason);
    assert.equal(f.record().status, 'attention');
    const count = f.calls.length;
    await f.tick();
    assert.equal(f.calls.length, count);
  }
});

test('disabled automation, hidden tabs, changed plans and unavailable storage cannot dispatch automatic work', async () => {
  const f = setupRunner(); f.open(); f.save();
  f.document.hidden = true; await f.tick();
  assert.equal(f.calls.some(call => ['start', 'stop', 'sync'].includes(call[0])), false);
  f.document.hidden = false; f.h.context.automationEnabled = () => false;
  await f.tick(); assert.equal(f.record().enabled, false);
  f.h.context.automationEnabled = () => true;
  f.h.context.recipeRunnerEnable();
  const key = 'iw-status-planned-action-v1:["Player",false]';
  const changed = JSON.parse(f.h.storage.get(key)); changed.plan.target.quantity = 200;
  f.h.storage.set(key, JSON.stringify(changed));
  await f.tick();
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.record().reason, /saved plan changed/);
  f.save();
  f.h.context.localStorage.setItem = () => { throw Error('Storage full'); };
  await f.tick();
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
});

test('reload resumes a tracked batch, but an interrupted request needs reconciliation before retrying', async () => {
  const f = setupRunner(); f.open(); f.save(); await f.tick();
  const g = setupRunner({ storage: f.h.storage });
  g.rt.state.user = structuredClone(f.rt.state.user);
  g.rt.action.actionLoot = { '203': { amount: 80 } };
  await g.tick();
  assert.equal(g.calls.filter(call => call[0] === 'stop').length, 1);
  assert.equal(g.record().status, 'waiting', g.record().reason);
  const key = 'iw-status-recipe-run-v1:["Player",false]';
  g.h.storage.set(key, JSON.stringify({ ...g.record(), status: 'starting' }));
  const reloaded = setupRunner({ storage: g.h.storage });
  await reloaded.tick();
  assert.equal(reloaded.record().enabled, false);
  assert.match(reloaded.record().reason, /unconfirmed outcome/);
  assert.equal(reloaded.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('native self-collection advances only after fresh inventory progress is confirmed', async () => {
  const f = setupRunner(); f.open(); f.save(); await f.tick();
  f.rt.state.user.action = null;
  f.rt.action.actionLoot = {};
  f.rt.state.user.inventory['203'].amount = 80;
  await f.tick();
  assert.equal(f.record().batch, null);
  await f.tick();
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['3', '102', 40]);
  assert.equal(f.calls.some(call => call[0] === 'stop'), false);
  f.rt.state.user.action = null;
  await f.tick();
  assert.equal(f.record().enabled, false);
  assert.match(f.record().reason, /without confirmed inventory progress/);
});

test('automatic collection is revoked if Pause occurs during its fresh server check', async () => {
  let f, paused = false;
  f = setupRunner({ beforeSync: () => {
    if (f?.record()?.status === 'collecting' && !paused) { paused = true; f.h.context.recipeRunnerPause(); }
  } });
  f.open(); f.save(); await f.tick();
  f.rt.action.actionLoot = { '203': { amount: 80 } };
  await f.tick();
  assert.equal(paused, true);
  assert.equal(f.calls.some(call => call[0] === 'stop'), false);
  assert.equal(f.record().status, 'paused');
});

test('plan icon opens the planner and shows waiting, paused and attention states, including idle', async () => {
  const f = setupRunner(); f.open(); f.save();
  assert.match(f.h.context.renderImportantActionBadges(null), /iw-recipe-runner-badge/);
  assert.match(f.h.context.renderActionBadges({ action: { skillName: 'Mining' }, cache: {} }), /Recipe planner · Waiting/);
  f.click('data-recipe-run-toggle');
  assert.equal(f.record().enabled, false);
  assert.match(f.badge(), /Recipe planner · Paused/);
  const button = { closest: selector => selector === '[data-recipe-open]' ? button : null };
  for (const handler of f.listeners.click) handler({ target: button, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
  assert.match(f.panel(), /Resume automatic plan/);
  assert.equal(f.h.run('AppState.ui.recipePlan.open'), true);
  f.h.context.navigator = {};
  f.click('data-recipe-run-toggle'); await f.tick();
  assert.match(f.badge(), /Needs attention/);
});

test('saving the calculator replaces the active plan and derives only the remaining chain', () => {
  const f = setup(); f.savePlan('2', '101'); f.open(); f.save();
  assert.match(f.panel(), /Active recipe plan/);
  assert.match(f.panel(), /80.*Iron Ore/);
  assert.match(f.panel(), /40.*Iron Bar/);
  assert.match(f.panel(), /70.*Iron Sword/);
  assert.match(f.panel(), /Planned next action/);

  assert.match(f.panel(), /Active recipe plan/);
  assert.match(f.panel(), /Next.*Mining.*Iron Rock/s);
  f.save('200');
  assert.match(f.panel(), /Active recipe plan[\s\S]*Target owned quantity: 200/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('gathering sources, consumed supplies and circular dependencies stay visible while another branch can progress', () => {
  const f = setup(); f.rt.actionCatalog['103'].materials.push({ id: '205', amount: 1 });
  f.rt.actionCatalog['106'] = { ...f.rt.actionCatalog['101'], id: '106', name: 'Deep Iron Rock' };
  f.rt.skillCatalog['2'].actions.push({ id: '106' });
  f.rt.state.user.inventory['204'] = { amount: 100 };
  f.rt.state.user.compost = 0;
  f.open(); f.save();
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
  const f = setup({ route: '/skill/2/action/101' }); f.open(); f.save();
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
  f.open(); f.save(); f.click('data-recipe-start'); await f.until(() => !f.busy());
  f.rt.action.actionLoot = { '203': { amount: 80 } };
  f.open();
  assert.match(f.panel(), /Pending loot: <span[^>]+>80<\/span> \(not owned\)/);
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
  f.open(); f.save();
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
  const f = setup(); f.open(); f.save();
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
  f.open(); f.save();
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
  const f = setup(); f.open(); f.save();
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
  const f = setup({ stopFailure: true }); f.open(); f.save();
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
  f.open(); f.save();
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
  f.open(); f.save();
  assert.match(f.panel(), /40 Seeds/);
  assert.match(f.panel(), /Requires Seeds in owned inventory/);
  f.emit('click', 'data-recipe-select', '', { recipeScope: 'active', recipeItem: '204' });
  assert.match(f.panel(), /Next · Exploring · Seed Patch/);
  f.rt.state.user.inventory['204'].amount = 140; f.render();
  assert.doesNotMatch(f.panel(), /Next · Exploring · Seed Patch/);
  assert.match(f.panel(), /Next · (Mining · Iron Rock|Farming · Chilli)/);
});

test('a saved source cannot silently change after catalog replacement', () => {
  const f = setup(); f.open(); f.save();
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
    const f = setup(options); f.open(); f.save();
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
    f.open(); f.save(); f.click('data-recipe-start'); await f.until(() => !f.busy());
    assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false, change);
  }
});

test('unique crafts require the native one-item limit even after a quantity edit', () => {
  const f = setup(); f.rt.actionCatalog['103'].uniqueCraft = true;
  f.open(); f.save();
  f.emit('change', 'data-recipe-quantity', '2', { recipeScope: 'active', recipeItem: '201' });
  assert.match(f.panel(), /unique craft.*one native quantity/i);
  assert.doesNotMatch(f.panel(), /Next · Smithing · Iron Sword/);
});

test('a restored plan recovers when loading ends and refresh rechecks changed native eligibility', async () => {
  const first = setup(); first.open(); first.save();
  const f = setup({ storage: first.h.storage });
  f.rt.action.actionLoading = true; f.open();
  assert.match(f.panel(), /Current balances unavailable/);
  f.rt.action.actionLoading = false; f.render();
  assert.doesNotMatch(f.panel(), /Current balances unavailable/);
  f.rt.actionCatalog['101'].level = 10;
  f.rt.actionSkillLevel = user => user.traits?.bonus ? 20 : 1;
  f.click('data-recipe-refresh'); await f.until(() => !f.busy());
  assert.match(f.panel(), /Requires Mining level 10/);
  f.rt.state.user.traits = { bonus: true }; f.render();
  assert.match(f.panel(), /Next · Mining · Iron Rock/);
  assert.doesNotMatch(f.panel(), /Requires Mining level 10/);
});

test('a player-selected intermediate batch can progress beneath an unknown total requirement', async () => {
  const f = setup();
  f.rt.actionCatalog['103'].drops[0].amount = 5;
  f.rt.state.user.inventory['202'].amount = 0;
  f.rt.state.user.inventory['203'].amount = 40;
  f.open(); f.save();
  f.emit('change', 'data-recipe-quantity', '20', { recipeScope: 'active', recipeItem: '202' });
  assert.match(f.panel(), /Next · Smelting · Iron Bar/);
  assert.match(f.panel(), /Native quantity: 20/);
  assert.match(f.panel(), /Unknown Iron Bar/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['3', '102', 20]);
});

test('plan observations read relevant balances without enumerating unrelated inventory or loot', () => {
  const f = setup(); f.open(); f.save();
  f.rt.state.user.inventory = new Proxy(f.rt.state.user.inventory, { ownKeys() { assert.fail('Full native inventory traversal'); } });
  f.rt.action.actionLoot = new Proxy({}, { ownKeys() { return []; }, get(target, key) { if (key === 'toJSON') assert.fail('Loot serialization'); return target[key]; } });
  f.render();
  assert.match(f.panel(), /Next · Mining · Iron Rock/);
});

test('live observations preserve an unfinished quantity edit and cannot start its older saved value', () => {
  const f = setup(); f.rt.state.user.inventory['202'].amount = 140;
  f.open(); f.save();
  f.emit('input', 'data-recipe-quantity', '12', { recipeScope: 'active', recipeItem: '201' });
  f.rt.state.user.inventory['203'].amount = 5; f.render();
  assert.match(f.panel(), /aria-label="active quantity for Iron Sword"[^>]*value="12"/);
  assert.match(f.panel(), /Finish editing the native quantity/);
  f.click('data-recipe-start');
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  f.emit('change', 'data-recipe-quantity', '12', { recipeScope: 'active', recipeItem: '201' });
  assert.match(f.panel(), /Native quantity: 12/);
  assert.doesNotMatch(f.panel(), /Finish editing the native quantity/);
});

test('manual resource choices remain selectable when multiple conversion inputs are available', () => {
  const f = setup(); f.rt.actionCatalog['103'].metalParts = 3; f.rt.state.user.metalParts = 0;
  f.rt.conversionCatalog = { metalParts: { '202': 2, '201': 5 } };
  f.open(); f.save();
  assert.match(f.panel(), /Conversion input for Metal Parts/);
  f.emit('change', 'data-recipe-conversion', '202', { recipeScope: 'active', recipeItem: 'metalParts' });
  assert.match(f.panel(), /Manual conversion: 105 Iron Bar → 210 Metal Parts/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('quantity edits have an explicit keyboard-submit control and orphaned drafts do not block plans', () => {
  const f = setup(); f.rt.state.user.inventory['202'].amount = 140;
  f.open(); f.save();
  f.emit('input', 'data-recipe-quantity', '12', { recipeScope: 'active', recipeItem: '201' });
  assert.match(f.panel(), /data-recipe-quantity-form/);
  f.emit('submit', 'data-recipe-quantity-form', '', { recipeScope: 'active', recipeItem: '201' }, { amount: { value: '12' } });
  assert.match(f.panel(), /Native quantity: 12/);
  assert.doesNotMatch(f.panel(), /Finish editing/);
  f.emit('input', 'data-recipe-quantity', '4', { recipeScope: 'active', recipeItem: '201' });
  f.save('200', '202', '3:102');
  assert.doesNotMatch(f.panel(), /Finish editing/);
  f.emit('input', 'data-recipe-quantity', '7', { recipeScope: 'active', recipeItem: '202' });
  f.rt.state.user.inventory['202'].amount = 200; f.render();
  assert.doesNotMatch(f.panel(), /Finish editing/);
});

test('a recipe batch follows the remaining shortfall after outside inventory gains', async () => {
  const f = setup();
  f.rt.state.user.inventory['201'].amount = 3769;
  f.rt.state.user.inventory['202'].amount = 40000;
  f.open(); f.save('18570');
  f.emit('submit', 'data-recipe-quantity-form', '', { recipeScope: 'active', recipeItem: '201' }, { amount: { value: '14801' } });
  f.rt.state.user.inventory['201'].amount = 14801;
  f.click('data-recipe-start');
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.panel(), /next action or quantity changed/);
  f.render();
  assert.match(f.panel(), /3,769 Iron Sword/);
  assert.match(f.panel(), /Native quantity: 3,769/);
  assert.match(f.panel(), /aria-label="active quantity for Iron Sword"[^>]*value="3769"/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').at(-1).slice(1, 4), ['4', '103', 3769]);
});

test('planner separates the active plan from its calculator and reveals step details on demand', () => {
  const f = setup(); f.open(); f.save();
  assert.match(f.panel(), /data-recipe-view="plan"[^>]*aria-pressed="true"/);
  assert.match(f.panel(), /data-recipe-panel="calculator" hidden/);
  assert.match(f.panel(), /aria-label="Details for active Iron Sword"[^>]*aria-expanded="false"/);
  f.click('data-recipe-details', 'active:201');
  assert.match(f.panel(), /aria-label="Details for active Iron Sword"[^>]*aria-expanded="true"/);
  f.render();
  assert.match(f.panel(), /aria-label="Details for active Iron Sword"[^>]*aria-expanded="true"/);
  f.click('data-recipe-view', 'calculator');
  assert.match(f.panel(), /data-recipe-panel="plan" hidden/);
  assert.match(f.panel(), /data-recipe-view="calculator"[^>]*aria-pressed="true"/);
  f.click('data-recipe-view', 'manual');
  assert.match(f.panel(), /data-recipe-panel="calculator" hidden/);
  assert.match(f.panel(), /data-recipe-view="manual"[^>]*aria-pressed="true"/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('Edit opens the saved active recipe and Save updates it directly without Send to planner', () => {
  const f = setup(); f.open(); f.save();
  assert.doesNotMatch(f.panel(), /Send to planner|data-recipe-use/);
  f.click('data-recipe-view', 'calculator');
  f.click('data-shopping-edit');
  assert.match(f.panel(), /data-recipe-view="calculator"[^>]*aria-pressed="true"/);
  assert.match(f.panel(), /data-shopping-quantity[^>]*value="100"/);
  f.save('200');
  assert.match(f.panel(), /data-recipe-view="plan"[^>]*aria-pressed="true"/);
  assert.match(f.panel(), /Active recipe plan[\s\S]*Target owned quantity: 200/);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
});

test('the calculator includes a short planned overview without duplicating start controls', () => {
  const f = setup(); f.open(); f.save();
  f.click('data-recipe-view', 'calculator');
  const calculator = f.panel().split('aria-label="Recipe Calc"')[1].split('</section>')[0];
  assert.match(calculator, /aria-label="Planned overview"/);
  assert.match(calculator, /3 remaining requirements/);
  assert.match(calculator, /80 Iron Ore/);
  assert.match(calculator, /Next/);
  assert.doesNotMatch(calculator, /data-recipe-start|data-recipe-use|data-recipe-open/);
});

test('calculator input edits stay in the draft until Save and Cancel keeps the active inputs', () => {
  const f = setup(); f.rt.actionCatalog['103'].metalParts = 3;
  f.rt.state.user.metalParts = 0; f.rt.conversionCatalog = { metalParts: { '202': 2 } };
  f.open(); f.save();
  const savedPlan = () => JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan;
  f.click('data-shopping-edit');
  f.emit('change', 'data-shopping-conversion', '202', { shoppingOwner: '["Player",false]', shoppingResource: 'metalParts' });
  assert.deepEqual(savedPlan().conversions, {});
  f.save('200');
  assert.deepEqual(savedPlan().conversions, { metalParts: '202' });
  f.click('data-shopping-edit');
  f.emit('change', 'data-shopping-conversion', '', { shoppingOwner: '["Player",false]', shoppingResource: 'metalParts' });
  f.click('data-shopping-cancel');
  assert.deepEqual(savedPlan().conversions, { metalParts: '202' });
});

test('editing the target retains a smaller chosen batch and the planned overview identifies running work', async () => {
  const f = setup(); f.open(); f.save();
  f.emit('change', 'data-recipe-quantity', '10', { recipeScope: 'active', recipeItem: '201' });
  f.click('data-shopping-edit'); f.save('200', '201', '');
  assert.match(f.panel(), /aria-label="active quantity for Iron Sword"[^>]*value="10"/);
  f.click('data-recipe-start'); await f.until(() => !f.busy());
  f.open(); f.click('data-recipe-view', 'calculator');
  const calculator = f.panel().split('aria-label="Recipe Calc"')[1].split('</section>')[0];
  assert.match(calculator, /In progress/);
});
