const { test } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fixtures/quick-skills.cjs');

test('plan a never-run action without starting it or overwriting Last action', () => {
  const f = setup();
  assert.match(f.planCard(), /Planned next action/);
  assert.doesNotMatch(f.planCard(), /<option[^>]*>Taming<\/option>/);
  f.savePlan('1', '102');
  assert.match(f.planCard(), /Woodcutting.*Oak Tree/s);
  assert.equal(f.saved().last['1'], undefined);
  assert.equal(f.calls.length, 0);
  assert.match(f.planCard(), /Stop continuous work manually/);
});

test('manual start from explicit idle uses the shared native workflow and clears only the confirmed plan', async () => {
  const f = setup();
  f.current(null);
  f.savePlan('1', '102');
  f.click('data-planned-start');
  await f.until(() => !f.busy());
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 0);
  assert.equal(f.saved().last['1'].actionId, '102');
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.equal(f.h.context.location.pathname, '/status');
});

test('ineligible targets remain saveable and an explicit read-only refresh explains the native block', async () => {
  const f = setup({ unavailable: true });
  f.current(null);
  f.savePlan('4', '103', 10);
  f.click('data-planned-refresh');
  await f.until(() => !f.busy());
  assert.match(f.planCard(), /Native requirements are not met/);
  assert.match(f.planCard(), /data-planned-start[^>]*disabled/);
  assert.equal(f.calls.filter(call => ['start', 'stop'].includes(call[0])).length, 0);
});

test('plans survive reload, remain isolated by character and mode, and can be edited or cleared', () => {
  const f = setup();
  f.savePlan('4', '103', 12);
  f.h.run('AppState.ui.plannedAction.owner = null');
  assert.match(f.planCard(), /Native quantity: 12/);
  f.main.state.user.displayName = 'Other';
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  f.savePlan('6', '104');
  f.main.state.isSolo = true; f.main.state.user.isSolo = true;
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  f.main.state.user.displayName = 'Player'; f.main.state.isSolo = false; f.main.state.user.isSolo = false;
  assert.match(f.planCard(), /Copper Sword/);
  f.click('data-planned-edit');
  assert.match(f.planCard(), /Native quantity \(not guaranteed output\)/);
  f.savePlan('4', '103', 7);
  assert.match(f.planCard(), /Native quantity: 7/);
  f.click('data-planned-clear');
  f.h.run('AppState.ui.plannedAction.owner = null');
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
});

test('missing, rebuilding and inconsistent state never becomes idle; expired finite work remains blocked', () => {
  for (const state of ['missing', 'rebuilding', 'loading-unknown', 'loot-without-action', 'finite', 'continuous']) {
    const f = setup();
    f.current(null); f.savePlan('1', '102');
    if (state === 'missing') delete f.main.state.user.action;
    if (state === 'rebuilding') f.main.state.syncingData = true;
    if (state === 'loading-unknown') delete f.main.action.actionLoading;
    if (state === 'loot-without-action') f.main.action.actionLoot = { ore: { amount: 1 } };
    if (state === 'finite') f.current('4', '103', 10);
    if (state === 'continuous') f.current('2', '101');
    f.h.time(100000000);
    assert.match(f.planCard(), /data-planned-start[^>]*disabled/, state);
    f.click('data-planned-start');
    assert.equal(f.calls.length, 0, state);
  }
});

test('saved finite amount is reused in native quantity units; shortage cancellation preserves it', async () => {
  const f = setup(); f.current(null); f.savePlan('4', '103', 50);
  f.click('data-planned-start');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), /Native quantity \(not guaranteed output\)/);
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  f.click('data-quick-close'); await f.until(() => !f.busy());
  assert.match(f.planCard(), /Native quantity: 50/);
  f.click('data-planned-start');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  f.submit(8); await f.until(() => !f.busy());
  assert.equal(f.calls.find(call => call[0] === 'start')[3], 8);
  assert.equal(f.saved().amounts['4:103'], undefined);
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
});

test('prompt-time action or character changes reject the pending start and retain the original plan', async () => {
  for (const change of ['action', 'identity', 'claim']) {
    const f = setup(); f.current(null); f.savePlan('4', '103', 50);
    f.click('data-planned-start'); await f.until(() => f.panel().includes('data-quick-amount-form'));
    if (change === 'action') f.current('1', '102');
    if (change === 'identity') f.main.state.user.displayName = 'Other';
    if (change === 'claim') f.h.run('AppState.ui.collectingTaming = true');
    f.submit(5); await f.until(() => !f.busy());
    assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false, change);
    assert.equal(JSON.parse(f.h.storage.get('iw-status-planned-action-v1:["Player",false]')).plan.amount, 50);
  }
});

test('duplicate clicks and shared combat targets retain exact skill identity', async () => {
  const f = setup(); f.current(null); f.savePlan('8', '104');
  f.click('data-planned-start'); f.click('data-planned-start'); f.click('data-quick-loot');
  await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').map(call => call.slice(1, 3)), [['8', '104']]);
});

test('native starts elsewhere retain the plan; failed, wrong-target and unconfirmed feature starts do too', async () => {
  for (const options of [{ startFailure: true }, { wrongTarget: true }, { timeout: true }, { unavailable: true }]) {
    const f = setup(options); f.current(null); f.savePlan('1', '102');
    f.click('data-planned-start'); await f.until(() => !f.busy());
    assert.match(f.planCard(), /data-planned-start/);
    assert.ok(f.calls.filter(call => call[0] === 'start').length <= 1);
    assert.equal(f.calls.some(call => call[0] === 'stop'), false);
  }
  const f = setup(); f.savePlan('1', '102'); f.current('1', '102');
  assert.match(f.planCard(), /data-planned-start[^>]*disabled/);
  f.current(null);
  assert.match(f.planCard(), /data-planned-start/);
});

test('a native action appearing at dispatch is never stopped to satisfy the idle gate', async () => {
  const f = setup({ beforeNativeStart(runtime) { runtime.state.user.action = { skillId: '2', actionId: '101' }; } });
  f.current(null); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
  assert.match(f.planCard(), /data-planned-start/);
});

test('changed native requirements after the prompt are rechecked before dispatch', async () => {
  const f = setup(); f.current(null); f.savePlan('4', '103', 50);
  f.click('data-planned-start'); await f.until(() => f.panel().includes('data-quick-amount-form'));
  f.main.state.user.equipment = { weapon: { id: 'new-weapon' } };
  f.submit(5); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.planCard(), /requirements changed/i);
});

test('a post-start synchronization error preserves confirmed success and cannot restore the plan', async () => {
  const f = setup({ postStartSyncFailure: true }); f.current(null); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.match(f.lastToast().title, /Started Oak Tree/);
  assert.match(f.lastToast().warning, /synchronization failed/);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
});

test('filters, native form submission, stale ownership and corrupt records remain safe on Status only', () => {
  const f = setup();
  function change(field, value, type = 'change') {
    const target = { dataset: { plannedField: field }, value, matches: selector => selector === `${type === 'input' ? 'input' : 'select'}[data-planned-field]` };
    for (const handler of f.listeners[type]) handler({ target });
  }
  change('skillId', '1'); change('filter', 'oak', 'input');
  assert.match(f.planCard(), /<option value="102"[^>]*>Oak Tree/);
  change('filter', 'not an action', 'input');
  assert.doesNotMatch(f.planCard(), /<option value="102"/);
  change('filter', '', 'input'); change('actionId', '102');
  f.savePlan('1', '102');
  f.h.context.location.pathname = '/inventory'; assert.equal(f.planCard(), '');
  f.h.context.location.pathname = '/status';
  for (const plan of [{ skillId: '15', actionId: '101', amount: null }, { skillId: '1', actionId: '<script>', amount: null }, { skillId: '4', actionId: '103', amount: -1 }]) {
    f.h.storage.set('iw-status-planned-action-v1:["Player",false]', JSON.stringify({ version: 1, plan }));
    f.h.run('AppState.ui.plannedAction.owner = null');
    assert.doesNotMatch(f.planCard(), /data-planned-start/);
  }
});

test('known unmet native level and material requirements disable Start while targets remain saveable', () => {
  const f = setup(); f.current(null);
  f.main.actionCatalog['103'].level = 40;
  f.main.actionSkillLevel = () => 10;
  f.savePlan('4', '103', 8);
  assert.match(f.planCard(), /Requires Smithing level 40; current 10/);
  assert.match(f.planCard(), /data-planned-start[^>]*disabled/);
  f.main.actionSkillLevel = () => 50;
  f.main.state.user.inventory.ore.amount = 0;
  assert.match(f.planCard(), /Insufficient materials/);
  assert.match(f.planCard(), /data-planned-start[^>]*disabled/);
  f.main.state.user.inventory.ore.amount = 100;
  assert.doesNotMatch(f.planCard(), /data-planned-start[^>]*disabled/);
});

test('cancelling during the final read-only state check prevents the native start', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = setup({ beforeSync: () => gate }); f.current(null); f.savePlan('1', '102');
  f.click('data-planned-start');
  await f.until(() => f.calls.some(call => call[0] === 'sync'));
  f.h.context.quickClose();
  release(); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.planCard(), /data-planned-start/);
});
