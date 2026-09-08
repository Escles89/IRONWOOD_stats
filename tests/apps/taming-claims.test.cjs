const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup({ idle = false, unavailable = false, pathname = '/status' } = {}) {
  const h = harness({ location: { pathname }, console: { error() {} } });
  let now = 100000, route = 'skill', mountedAt = Infinity, loot = 12;
  const visits = [], shown = [];
  const collect = { textContent: 'Collect', disabled: false, click() { loot = 0; } };
  const expedition = {
    querySelector: selector => ({ textContent: selector.includes('.interval') ? '1h / 24h' : 'Expedition' }),
    querySelectorAll: () => [{ textContent: String(loot) }]
  };
  const taming = { querySelector: () => ({ textContent: 'Taming' }), click() {
    route = 'taming'; h.context.location.pathname = '/taming'; visits.push(route);
  } };
  const shortcut = { click() { route = 'loading'; mountedAt = now + 400; visits.push('action'); } };
  h.context.document = {
    querySelector(selector) {
      if (selector === 'taming-page') return route === 'taming' ? {} : null;
      if (selector.startsWith('nav-component action-component')) return idle ? null : shortcut;
      if (selector.startsWith('skill-page action-component')) return route === 'skill' ? {} : null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'nav-component button') return [taming];
      if (selector === 'taming-page button') return unavailable ? [] : [collect];
      if (selector === 'taming-page .card') return [expedition];
      return [];
    }
  };
  h.context.setTimeout = (resolve, ms) => {
    now += ms; h.time(now);
    if (now >= mountedAt) route = 'skill';
    resolve();
  };
  h.run("automationEnabled=()=>true; render=()=>{}; showActionToast=()=>{}; collectTaming=()=>({expeditionName:'Starlight Grotto'}); primeNativeEstimates=async()=>{};");
  h.context.showStats = () => {
    assert.equal(h.run('AppState.ui.collectingTaming'), true);
    shown.push(route);
  };
  return { h, visits, shown };
}

test('Taming claim restores the running action and waits for its page before reopening Status', async () => {
  const { h, visits, shown } = setup();
  await h.context.collectTamingLoot();
  assert.deepEqual(visits, ['taming', 'action']);
  assert.deepEqual(shown, ['skill']);
  assert.equal(h.run('AppState.ui.collectingTaming'), false);
  assert.equal(h.run('getCache().taming.lastError'), '');
});

test('a failed Taming claim also returns to the running action', async () => {
  const { h, shown } = setup({ unavailable: true });
  await h.context.collectTamingLoot();
  assert.deepEqual(shown, ['skill']);
  assert.equal(h.run('getCache().taming.lastError'), 'No Taming loot is ready');
  assert.equal(h.run('AppState.ui.collectingTaming'), false);
});

test('an idle player can return to Status without an action shortcut', async () => {
  const { h, visits, shown } = setup({ idle: true });
  await h.context.collectTamingLoot();
  assert.deepEqual(visits, ['taming']);
  assert.deepEqual(shown, ['taming']);
});

test('a claim started outside Status stays on Taming', async () => {
  const { h, visits, shown } = setup({ pathname: '/taming' });
  await h.context.collectTamingLoot();
  assert.deepEqual(visits, ['taming']);
  assert.deepEqual(shown, []);
});

test('Taming stays guarded against duplicate claims until the return finishes', async () => {
  const { h, visits } = setup();
  let finishReturn;
  h.context.showStatusFromCurrentAction = () => new Promise(resolve => { finishReturn = resolve; });
  const claim = h.context.collectTamingLoot();
  while (!finishReturn) await Promise.resolve();
  await h.context.collectTamingLoot();
  assert.deepEqual(visits, ['taming']);
  assert.equal(h.run('AppState.ui.collectingTaming'), true);
  finishReturn();
  await claim;
  assert.equal(h.run('AppState.ui.collectingTaming'), false);
});

test('a return error releases the claim guard', async () => {
  const { h, shown } = setup();
  h.context.showStatusFromCurrentAction = async () => { throw new Error('Navigation failed'); };
  await h.context.collectTamingLoot();
  assert.deepEqual(shown, []);
  assert.equal(h.run('AppState.ui.collectingTaming'), false);
});
