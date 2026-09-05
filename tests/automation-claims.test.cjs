const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/../ironwood-stats.user.js`, 'utf8');
function harness(names, overrides = {}) {
  const ctx = vm.createContext({ console: { error() {} }, ...overrides });
  for (const name of names) {
    const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
    assert.ok(start >= 0);
    const rest = source.slice(start + 1);
    const end = rest.search(/\n  (?:async )?function /);
    vm.runInContext(rest.slice(0, end), ctx);
  }
  return ctx;
}
function claimHarness(confirm = true) {
  let now = 0, clickedAt = null, saved;
  const row = { click() {}, querySelector: () => ({ textContent: 'Mill' }) };
  const button = { textContent: 'Collect', disabled: false, click() { clickedAt = now; this.disabled = true; } };
  const cards = ['Structures', 'Loot'].map(name => ({
    querySelector(selector) { return selector.includes('.header') ? { textContent: name } : row; },
    querySelectorAll() { return name === 'Structures' ? [row] : []; /* Loot card has no buttons. */ }
  }));
  const ctx = harness(['collectAutomationStructure'], {
    Date: { now: () => now }, wait: async ms => { now += ms; },
    clean: text => text || '', automationEnabled: () => true,
    readVisibleAutomation: () => ({ structure: 'Mill', lootAmount: confirm && clickedAt !== null && now - clickedAt >= 900 ? 0 : 12 }),
    storeAutomationStructure: item => { saved = item; },
  });
  return { ctx, doc: { querySelector: () => ({ querySelectorAll: selector => selector === '.card' ? cards : selector === 'automate-component > .action-buttons > button' ? [{ textContent: 'Stop & Loot', click() { throw new Error('Must not stop automation'); } }, button] : [] }) },
    saved: () => saved, elapsed: () => now };
}
test('waits for delayed loot reduction, not a disabled pending button', async () => {
  const h = claimHarness();
  await h.ctx.collectAutomationStructure(h.doc, 'Mill');
  assert.equal(h.saved().lootAmount, 0);
  assert.ok(h.elapsed() >= 900);
});
test('unconfirmed claim times out without overwriting cache', async () => {
  const h = claimHarness(false);
  await assert.rejects(h.ctx.collectAutomationStructure(h.doc, 'Mill'), /did not confirm/);
  assert.equal(h.saved(), undefined);
});
test('one page per batch, progressive renders, duplicate clicks ignored', async () => {
  let opens = 0, renders = 0, claims = [];
  let cache = { automations: { structures: [{ structure: 'Mill', lootAmount: 3 }, { structure: 'Mine', lootAmount: 4 }] } };
  const ctx = harness(['collectAllAutomationLoot'], {
    automationEnabled: () => true, collectingAutomation: '', refreshingAutomations: false,
    getCache: () => cache, setCache: (key, value) => { cache[key] = value; },
    projectedAutomation: item => item, render: () => { renders++; },
    withPage: async (path, selector, task) => { opens++; assert.equal(selector, 'app-component'); await task({}); },
    openAutomationHouse: async () => {},
    collectAutomationStructure: async (doc, name) => { claims.push(name); await ctx.collectAllAutomationLoot(); },
  });
  await ctx.collectAllAutomationLoot();
  assert.equal(opens, 1);
  assert.deepEqual(claims, ['Mill', 'Mine']);
  assert.equal(renders, 4);
  assert.equal(ctx.collectingAutomation, '');
});
test('zero-loot snapshot preserves production rate and other structure timestamps', () => {
  let cache = { automations: { structures: [
    { structure: 'Mill', making: 'Flour', outputPerAction: 2, checkedAt: 100 },
    { structure: 'Mine', checkedAt: 50 }
  ] } };
  const ctx = harness(['storeAutomationStructure'], {
    getCache: () => cache, setCache: (key, value) => { cache[key] = value; },
    automationSnapshot: structures => ({ structures }),
  });
  ctx.storeAutomationStructure({ structure: 'Mill', making: 'Flour', outputPerAction: 0, lootAmount: 0, checkedAt: 200 });
  assert.equal(cache.automations.structures[0].outputPerAction, 2);
  assert.equal(cache.automations.structures[0].checkedAt, 200);
  assert.equal(cache.automations.structures[1].checkedAt, 50);
});
test('batch failure is visible, releases the lock, and stops further claims', async () => {
  let cache = { automations: { structures: [{ structure: 'Mill', lootAmount: 3 }, { structure: 'Mine', lootAmount: 4 }] } };
  const claims = [];
  const ctx = harness(['collectAllAutomationLoot'], {
    automationEnabled: () => true, collectingAutomation: '', refreshingAutomations: false,
    getCache: () => cache, setCache: (key, value) => { cache[key] = value; },
    projectedAutomation: item => item, render() {},
    withPage: async (path, selector, task) => task({}), openAutomationHouse: async () => {},
    collectAutomationStructure: async (doc, name) => { claims.push(name); throw new Error('Claim not confirmed'); },
  });
  await ctx.collectAllAutomationLoot();
  assert.equal(cache.automations.lastError, 'Claim not confirmed');
  assert.equal(ctx.collectingAutomation, '');
  assert.deepEqual(claims, ['Mill']);
});
