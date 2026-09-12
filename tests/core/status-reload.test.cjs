const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('browser reload reopens Status from a native page, while ordinary navigation stays native', () => {
  const h = harness({ location: { pathname: '/inventory' }, performance: { getEntriesByType: () => [{ type: 'reload' }] } });
  assert.equal(h.context.shouldRestoreStatusOnLoad(), true);
  h.context.performance.getEntriesByType = () => [{ type: 'navigate' }];
  assert.equal(h.context.shouldRestoreStatusOnLoad(), false);
  h.context.performance.getEntriesByType = () => [{ type: 'back_forward' }];
  assert.equal(h.context.shouldRestoreStatusOnLoad(), false);
  h.context.location.pathname = '/status';
  assert.equal(h.context.shouldRestoreStatusOnLoad(), true);
});

test('reload restoration waits for the native shell before mounting Status and loading the current action', async () => {
  const h = harness();
  let now = 100000;
  const steps = [];
  h.context.document.querySelector = () => now >= 100300 ? {} : null;
  h.context.setTimeout = (resolve, ms) => { now += ms; h.time(now); resolve(); };
  h.context.createPage = () => steps.push('create');
  h.context.showStatusFromCurrentAction = async () => steps.push('show');
  await h.context.restoreStatusOnLoad();
  assert.ok(now >= 100300);
  assert.deepEqual(steps, ['create', 'show']);
});
