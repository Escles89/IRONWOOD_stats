const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('state factories isolate mutable values across all four areas', () => {
  const h = harness();
  assert.equal(h.run(`Object.keys(createAppState()).join(',')`), 'live,cache,derived,ui');
  assert.equal(h.run(`const other = createAppState(); other.ui.events.set('x', 1); AppState.ui.events.size`), 0);
});
test('new schema ignores old and malformed data; reset preserves explicit preferences', () => {
  const h = harness();
  h.storage.set('iw-stats-cache-v1', JSON.stringify({ inventory: { allItems: [1] } }));
  h.storage.set('iw-stats-automation-enabled', 'true');
  h.storage.set('iw-stats-cache-lookups-enabled', 'true');
  assert.equal(h.run('Object.keys(CacheStore.get()).length'), 0);
  for (const value of ['{', '[]', 'null', '{"schemaVersion":1,"records":{}}']) {
    h.storage.set('iw-stats-cache-v2', value);
    assert.equal(h.run('Object.keys(CacheStore.get()).length'), 0);
  }
  h.run(`CacheStore.set('inventory', { allItems: [] }); CacheStore.reset()`);
  assert.equal(h.run('Object.keys(CacheStore.get()).length'), 0);
  assert.equal(h.storage.get('iw-stats-automation-enabled'), 'true');
  assert.equal(h.storage.get('iw-stats-cache-lookups-enabled'), 'true');
});
test('cache tracks timestamps, metadata, TTL, explicit expiry, schema and invalidation', () => {
  const h = harness();
  h.run(`CacheStore.set('inventory', { allItems: [] }, { source: '/inventory' })`);
  assert.equal(h.run(`CacheStore.get('inventory').source`), '/inventory');
  assert.equal(h.run(`CacheStore.get('inventory').checkedAt`), 100000);
  assert.equal(h.run(`CacheStore.isFresh('inventory')`), true);
  h.time(3700001);
  assert.equal(h.run(`CacheStore.isFresh('inventory')`), false);
  h.run(`CacheStore.set('mastery', { schema: 1, completeSkills: [] }); CacheStore.set('taming', { schema: 2, expiresAt: 3700010 })`);
  h.time(3700010);
  assert.equal(h.run(`CacheStore.isFresh('taming')`), false);
  h.time(1e12);
  assert.equal(h.run(`CacheStore.isFresh('mastery')`), true);
  h.run(`CacheStore.invalidate('mastery')`);
  assert.equal(h.run(`CacheStore.get('mastery')`), undefined);
  h.run(`CacheStore.set('taming', { schema: 1 })`);
  assert.equal(h.run(`CacheStore.isFresh('taming')`), false);
});
test('event ledger deduplicates without extending TTL and permits events after expiry', () => {
  const h = harness();
  assert.equal(h.run(`EventLedger.record('hit', { amount: 5 }, 1000)`), true);
  h.time(100500);
  assert.equal(h.run(`EventLedger.record('hit', { amount: 5 }, 1000)`), false);
  h.time(101000);
  assert.equal(h.run(`EventLedger.isActive('hit')`), false);
  assert.equal(h.run(`EventLedger.record('hit', {}, 1000)`), true);
});
test('coordinator blocks lookups while disabled, uses fresh cache and joins concurrent loads', async () => {
  const h = harness();
  h.run(`globalThis.loads = 0; globalThis.loader = () => { loads++; CacheStore.set('inventory', { allItems: [] }); };`);
  await h.run(`SyncCoordinator.refresh('inventory', { force: true, load: loader })`);
  assert.equal(h.run('loads'), 0);
  h.storage.set('iw-stats-cache-lookups-enabled', 'true');
  await h.run(`Promise.all([SyncCoordinator.refresh('inventory', { load: loader }), SyncCoordinator.refresh('inventory', { load: loader })])`);
  assert.equal(h.run('loads'), 1);
  await h.run(`SyncCoordinator.refresh('inventory', { load: loader })`);
  assert.equal(h.run('loads'), 1);
  await assert.rejects(h.run(`SyncCoordinator.refresh('inventory', { force: true, load: () => { throw new Error('offline'); } })`), /offline/);
  assert.equal(h.run('AppState.ui.pendingActions.size'), 0);
});
