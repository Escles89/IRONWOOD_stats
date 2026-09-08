const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup() {
  const h = harness();
  h.time(Date.UTC(2026, 8, 7, 12));
  h.run(`
    setAutomationEnabled(true); setCacheLookupsEnabled(true);
    localStorage.setItem(PREFS_KEY, JSON.stringify(['Mining','Cooking','Fishing','Defense','Farming']));
    render = () => {};
    CacheStore.set('quests', {schema:2, day:dayKey(), completed:5, dailyComplete:true});
    CacheStore.set('adventure', {schema:11, state:'Idle', researchPoints:100, mapCost:10,
      dailyMapsCreated:9, dailyMapsLimit:9, mapsStored:2, mapStorageLimit:20});
  `);
  return h;
}

test('daily reset schedules completed quests and maps despite reusable caches', () => {
  const h = setup();
  for (const key of ['quests', 'adventure']) assert.equal(h.context.dailyAutomationStatus(key).due, false);
  h.time(Date.UTC(2026, 8, 8, 1));
  for (const key of ['quests', 'adventure']) {
    assert.equal(h.run(`needsLookup('${key}')`), false);
    assert.equal(h.context.dailyAutomationStatus(key).due, true);
  }
});

test('daily work respects toggles, quest selection and known map shortages', () => {
  const h = setup();
  h.time(Date.UTC(2026, 8, 8, 12));
  h.run('setAutomationEnabled(false)');
  assert.equal(h.context.dailyAutomationStatus('quests').due, false);
  h.run('setAutomationEnabled(true); setCacheLookupsEnabled(false)');
  assert.equal(h.context.dailyAutomationStatus('adventure').due, false);
  h.run("setCacheLookupsEnabled(true); localStorage.setItem(PREFS_KEY, '[]')");
  assert.equal(h.context.dailyAutomationStatus('quests').due, false);
  h.run("CacheStore.set('adventure', {...getCache().adventure, checkedAt:Date.now(), dailyMapsCreated:0, researchPoints:0})");
  assert.equal(h.context.dailyAutomationStatus('adventure').due, false);
  h.run("CacheStore.set('adventure', {...getCache().adventure, researchPoints:100})");
  assert.equal(h.context.dailyAutomationStatus('adventure').due, true);
});

test('incomplete work is throttled across repeated checks and persisted for reloads', async () => {
  const h = setup();
  h.time(Date.UTC(2026, 8, 8, 12));
  let calls = 0;
  const load = async automate => { assert.equal(automate, true); calls++; };
  await h.context.syncDailyTask('quests', false, load);
  await h.context.syncDailyTask('quests', false, load);
  assert.equal(calls, 1);
  const saved = JSON.parse(h.run('localStorage.getItem(CACHE_KEY)'));
  assert.equal(saved.records.dailyAutomation.quests.retryAt, Date.UTC(2026, 8, 8, 12, 15));
  h.time(Date.UTC(2026, 8, 8, 12, 15));
  await h.context.syncDailyTask('quests', false, load);
  assert.equal(calls, 2);
});

test('completion stops daily lookups and failure of one task does not stop the other', async () => {
  const h = setup();
  h.time(Date.UTC(2026, 8, 8, 12));
  await h.context.syncDailyTask('quests', false, async () => { throw Error('Page unavailable'); });
  assert.match(h.run('getCache().syncError.message'), /quests: Page unavailable/);
  let calls = 0;
  const load = async automate => {
    assert.equal(automate, true); calls++;
    h.run("CacheStore.set('adventure', {...getCache().adventure, checkedAt:Date.now(), dailyMapsCreated:9})");
  };
  await h.context.syncDailyTask('adventure', false, load);
  await h.context.syncDailyTask('adventure', false, load);
  assert.equal(calls, 1);
});

test('minute checks only start synchronization for visible, enabled, pending work', async () => {
  const h = setup();
  h.run('globalThis.calls = 0; syncStale = async () => { calls++; }');
  await h.context.checkDailyAutomations();
  assert.equal(h.run('calls'), 0);
  h.time(Date.UTC(2026, 8, 8, 12));
  h.run('document.hidden = true');
  await h.context.checkDailyAutomations();
  h.run('document.hidden = false; AppState.ui.syncing = true');
  await h.context.checkDailyAutomations();
  assert.equal(h.run('calls'), 0);
  h.run('AppState.ui.syncing = false');
  await h.context.checkDailyAutomations();
  assert.equal(h.run('calls'), 1);
});

test('sync actually runs both daily actions with usable old caches, then stops opening pages', async () => {
  const h = setup();
  h.time(Date.UTC(2026, 8, 8, 12));
  h.run(`
    globalThis.opened = [];
    withPage = async (path, selector, task) => {
      opened.push(path);
      await task({querySelectorAll: () => ['Research Points', 'Daily Map Limit', 'Storage'].map(textContent => ({textContent}))});
    };
    completeSelectedQuests = async () => CacheStore.set('quests', {schema:2, day:dayKey(), dailyComplete:true, completed:5});
    automateMaps = async () => CacheStore.set('adventure', {...getCache().adventure, checkedAt:Date.now(), dailyMapsCreated:9});
    captureAdventureMapDetails = async () => {};
    refreshGuildEventSnapshot = refreshGuildTrialSnapshot = refreshInventorySnapshot = refreshChallengesSnapshot = async () => {};
    SyncCoordinator.refresh = async () => {};
    CacheStore.set('equipped', {});
    CacheStore.set('automations', {schema:4, structures:[]});
  `);
  await h.context.syncStale(false);
  assert.deepEqual(Array.from(h.run('opened')), ['/quests', '/adventure']);
  await h.context.syncStale(false);
  assert.deepEqual(Array.from(h.run('opened')), ['/quests', '/adventure']);
  assert.equal(h.run('AppState.ui.syncing'), false);
});
