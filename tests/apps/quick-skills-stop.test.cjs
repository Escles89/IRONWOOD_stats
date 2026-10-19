const { test } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fixtures/quick-skills.cjs');

test('active skill precedes the plan and other skills, moves on change and disappears when idle', () => {
  const f = setup();
  f.h.context.renderRecipeSummary = () => '<div>PLAN MARKER</div>';
  f.click('data-quick-skills');
  assert.ok(f.panel().indexOf('Copper Rock') < f.panel().indexOf('PLAN MARKER'));
  assert.ok(f.panel().indexOf('PLAN MARKER') < f.panel().indexOf('Woodcutting'));
  assert.equal((f.panel().match(/data-quick-stop /g) || []).length, 1);
  f.current('4', '103', 10);
  assert.ok(f.panel().indexOf('Copper Sword') < f.panel().indexOf('PLAN MARKER'));
  assert.equal((f.panel().match(/<li class="iw-quick-skill/g) || []).length, 16);
  f.current(null);
  assert.doesNotMatch(f.panel(), /data-quick-stop|iw-quick-active/);
  assert.ok(f.panel().indexOf('Woodcutting') < f.panel().indexOf('Mining'));
});

for (const [skillId, actionId, amount] of [['2', '101'], ['4', '103', 20], ['8', '104']]) {
  test(`Stop & Loot ends skill ${skillId}, collects once, and never restarts with automation off`, async () => {
    const f = setup({ route: '/inventory' });
    f.current(skillId, actionId, amount);
    let paused = '';
    f.h.context.recipeRunnerPause = reason => { paused = reason; };
    f.click('data-quick-skills'); f.click('data-quick-stop'); f.click('data-quick-stop');
    await f.until(() => !f.busy());
    assert.deepEqual(f.subscriptions, ['stop']);
    assert.equal(f.main.state.user.action, null);
    assert.equal(f.calls.some(call => ['start', 'quantity-submit', 'amount-dialog'].includes(call[0])), false);
    assert.match(f.lastToast().title, /Stopped .* — loot collected/);
    assert.equal(f.lastToast().kind, 'success');
    assert.match(paused, /stopped the current action/);
    assert.equal(f.h.context.location.pathname, '/inventory');
    assert.equal(f.saved().last[skillId].actionId, actionId);
  });
}

test('stop rejects changed action or character without collecting', async () => {
  for (const change of ['action', 'owner']) {
    const f = setup();
    const ready = f.h.context.quickNativeReady;
    f.h.context.quickNativeReady = async (...args) => {
      const native = await ready(...args);
      if (change === 'action') f.main.state.user.action = { skillId: '1', actionId: '102' };
      else native.runtime.state.user.displayName = 'Other';
      return native;
    };
    f.click('data-quick-skills'); f.click('data-quick-stop');
    await f.until(() => !f.busy());
    assert.deepEqual(f.subscriptions, []);
    assert.equal(f.lastToast().kind, 'warning');
  }
});

test('a failed stop leaves the action running and never reports a successful stop', async () => {
  const f = setup({ stopFailure: true });
  f.click('data-quick-skills'); f.click('data-quick-stop');
  await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, ['stop']);
  assert.equal(f.main.state.user.action.actionId, '101');
  assert.equal(f.lastToast().kind, 'warning');
  assert.doesNotMatch(f.lastToast().title, /^Stopped/);
});

test('a confirmed stop with failed synchronization keeps the confirmed result and shows a warning', async () => {
  const f = setup({ syncFailure: true });
  f.click('data-quick-skills'); f.click('data-quick-stop');
  await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, ['stop']);
  assert.match(f.lastToast().title, /^Stopped/);
  assert.match(f.lastToast().warning, /synchronization failed/);
  assert.equal(f.lastToast().kind, 'warning');
});
