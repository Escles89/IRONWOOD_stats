const { test } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fixtures/quick-skills.cjs');

test('a completed finite batch uses native target-start collection and confirms its rewards separately', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  assert.match(f.planCard(), /Batch complete/);
  assert.doesNotMatch(f.planCard(), /data-planned-start[^>]*disabled/);
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => ['start', 'stop'].includes(call[0])).map(call => call[0]), ['stop', 'start']);
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.match(f.lastToast().title, /Started Oak Tree/);
  assert.equal(f.lastToast().metrics[0].value, '10');
});

test('a completed batch can start the same recipe with a new native quantity', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } } });
  f.current('4', '103', 10); f.savePlan('4', '103', 5);
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.filter(call => call[0] === 'start').map(call => call.slice(1, 4)), [['4', '103', 5]]);
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.equal(f.calls.some(call => call[0] === 'frame'), false);
});

test('native eligibility still blocks same-recipe restarts of completed work', async () => {
  for (const options of [{ unavailable: true }, { uniqueOwned: true }]) {
    const f = setup({ ...options, completedLoot: { sword: { amount: 10 } } });
    f.current('4', '103', 10); f.savePlan('4', '103', 5);
    f.click('data-planned-start'); await f.until(() => !f.busy());
    assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
    assert.match(f.planCard(), /Native requirements are not met/);
  }
});

test('planned refresh reads current evidence without replaying native work or collecting a completed batch', async () => {
  let replayed = 0;
  const f = setup({ completedLoot: { sword: { amount: 10 } }, onActionSync() { replayed++; } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-refresh'); await f.until(() => !f.busy());
  assert.equal(replayed, 0);
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
  assert.equal(f.calls.some(call => call[0] === 'frame'), false);
  assert.match(f.planCard(), /Batch complete/);
  assert.match(f.planCard(), /checked 0 min ago/);
});

test('read-only evidence preserves identity when native state uses prototype getters', async () => {
  const f = setup(); f.current(null); f.savePlan('1', '102');
  delete f.main.state.isSolo;
  Object.setPrototypeOf(f.main.state, { get isSolo() { return false; } });
  f.click('data-planned-refresh'); await f.until(() => !f.busy());
  assert.match(f.planCard(), /Native start control available/);
  assert.doesNotMatch(f.planCard(), /Character changed/);
});

test('completed batch collection survives a rejected or unconfirmed target start', async () => {
  for (const failure of [{ startFailure: true }, { timeout: true }, { wrongTarget: true }]) {
    const f = setup({ ...failure, completedLoot: { sword: { amount: 10 } } });
    f.current('4', '103', 10); f.savePlan('1', '102');
    f.click('data-planned-start'); f.click('data-planned-start'); f.click('data-quick-loot');
    await f.until(() => !f.busy());
    assert.match(f.planCard(), /data-planned-start/);
    assert.match(f.lastToast().title, /Loot collected.*did not start/);
    assert.equal(f.lastToast().metrics[0].value, '10');
    assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  }
});

test('completed batches with missing or inconsistent evidence remain blocked even after their estimated finish', () => {
  for (const evidence of ['loading', 'missing-loot', 'missing-identity', 'negative', 'fractional', 'unfinished', 'continuous']) {
    const f = setup({ completedLoot: { sword: { amount: 10 } } });
    f.current('4', '103', 10); f.savePlan('1', '102');
    if (evidence === 'loading') f.main.action.actionLoading = true;
    if (evidence === 'missing-loot') delete f.main.action.actionLoot;
    if (evidence === 'missing-identity') delete f.main.state.user.action.startDate;
    if (evidence === 'negative') f.main.action.actionLoot.sword.amount = -1;
    if (evidence === 'fractional') f.main.action.actionLoot.sword.amount = 10.5;
    if (evidence === 'unfinished') f.main.action.actionLoot.sword.amount = 9;
    if (evidence === 'continuous') f.current('2', '101');
    f.h.time(999999999);
    assert.match(f.planCard(), /data-planned-start[^>]*disabled/, evidence);
    f.click('data-planned-start');
    assert.equal(f.calls.length, 0, evidence);
  }
});

test('a replacement batch at native dispatch is never collected even if it too is complete', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } }, beforeNativeStart(runtime) {
    runtime.state.user.action.startDate = '2026-09-27T07:00:00Z';
  } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => ['stop', 'start'].includes(call[0])), false);
  assert.equal(f.main.action.actionLoading, false);
  assert.match(f.planCard(), /data-planned-start/);
});

test('new work, identity changes and concurrent claims after collection prevent the target start', async () => {
  for (const change of ['action', 'identity', 'claim']) {
    let f;
    f = setup({ completedLoot: { sword: { amount: 10 } }, afterCollection(runtime) {
      if (change === 'action') f.current('2', '101');
      if (change === 'identity') runtime.state.user.displayName = 'Other';
      if (change === 'claim') f.h.run('AppState.ui.collectingTaming = true');
    } });
    f.current('4', '103', 10); f.savePlan('1', '102');
    f.click('data-planned-start'); await f.until(() => !f.busy());
    assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1, change);
    assert.equal(f.calls.some(call => call[0] === 'start'), false, change);
    assert.match(f.lastToast().title, /Loot collected.*did not start/, change);
    if (change === 'identity') f.main.state.user.displayName = 'Player';
    assert.match(f.planCard(), /data-planned-start/, change);
  }
});

test('completed-batch success stays successful after a later synchronization error', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } }, postStartSyncFailure: true });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.match(f.lastToast().title, /Started Oak Tree/);
  assert.match(f.lastToast().warning, /synchronization failed/);
  assert.equal(f.lastToast().metrics[0].value, '10');
});

test('a batch already collected by the native game starts from confirmed idle without another collection', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } } });
  f.current('4', '103', 10); f.savePlan('1', '102'); f.current(null);
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'stop'), false);
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
});

test('an exact native start response clears the plan even when native rendering fails immediately afterward', async () => {
  const f = setup({ nativePostStartFailure: true, completedLoot: { sword: { amount: 10 } } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.doesNotMatch(f.planCard(), /data-planned-start/);
  assert.match(f.lastToast().title, /Started Oak Tree/);
});

test('a collection response arriving after timeout cannot trigger a late target start', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = setup({ completedLoot: { sword: { amount: 10 } }, beforeCollectionResponse: () => gate });
  const originalStart = f.main.firebase.startAction, originalStop = f.main.firebase.stopAction;
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.match(f.planCard(), /data-planned-start/);
  assert.match(f.lastToast().title, /Action not confirmed/);
  release();
  await f.drainNative();
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.equal(f.main.firebase.startAction, originalStart);
  assert.equal(f.main.firebase.stopAction, originalStop);
  assert.match(f.planCard(), /data-planned-start/);
});

test('failed native collection never starts the target or reports unconfirmed rewards', async () => {
  const f = setup({ stopFailure: true, completedLoot: { sword: { amount: 10 } } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  assert.equal(f.lastToast().metrics.length, 0);
  assert.match(f.planCard(), /data-planned-start/);
});

test('a race rejected at the native collection request releases the live loading state', async () => {
  let reads = 0;
  const f = setup({ completedLoot: { sword: { amount: 10 } }, remoteUser: user => ++reads === 2
    ? { ...user, action: { ...user.action, startDate: '2026-09-27T09:00:00Z' } } : user });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => ['stop', 'start'].includes(call[0])), false);
  assert.equal(f.main.action.actionLoading, false);
});

test('a fresh remote replacement blocks collection even if both mounted runtimes still show the completed batch', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } }, remoteUser: server => ({ ...server, action: { ...server.action, startDate: '2026-09-27T09:00:00Z' } }) });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => ['start', 'stop'].includes(call[0])), false);
  assert.match(f.planCard(), /current action changed/i);
  f.click('data-planned-refresh'); await f.until(() => !f.busy());
  assert.match(f.planCard(), /data-planned-start[^>]*disabled/);
});

test('equipment changes during completed-batch collection reject the pending target', async () => {
  const f = setup({ completedLoot: { sword: { amount: 10 } }, afterCollection(runtime) {
    runtime.state.user.equipment = { weapon: { id: 'changed' } };
  } });
  f.current('4', '103', 10); f.savePlan('1', '102');
  f.click('data-planned-start'); await f.until(() => !f.busy());
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  assert.match(f.lastToast().title, /Loot collected.*did not start/);
});

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
