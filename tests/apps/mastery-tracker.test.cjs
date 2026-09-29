const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(storage = new Map(), configure = () => {}) {
  const listeners = {}, calls = [], errors = [], nodes = new Map();
  let pageMarkup = '', pageWrites = 0;
  const rowPattern = /<button[^>]*data-mastery-status[\s\S]*?<\/button>/;
  // Minimal DOM boundary for observing live text/attribute/style updates in the assembled row.
  function rowElement(pattern) {
    const read = () => pageMarkup.match(rowPattern)?.[0].match(pattern)?.[0] || '';
    const write = value => { pageMarkup = pageMarkup.replace(rowPattern, row => row.replace(pattern, value)); };
    if (!read()) return null;
    return {
      get textContent() { return read().replace(/<[^>]+>/g, ''); },
      set textContent(value) { write(read().replace(/>[^<]*</, `>${value}<`)); },
      getAttribute(name) { return read().match(new RegExp(`${name}="([^"]*)"`))?.[1] || null; },
      setAttribute(name, value) { write(read().replace(new RegExp(`${name}="[^"]*"`), `${name}="${value}"`)); },
      style: { get width() { return read().match(/width:([^";]*)/)?.[1] || ''; },
        set width(value) { write(read().replace(/width:[^";]*/, `width:${value}`)); } }
    };
  }
  const masteryRow = { querySelector(selector) {
    const patterns = { small: /<small>[^<]*<\/small>/, '[data-mastery-total]': /<span data-mastery-total>[^<]*<\/span>/, '.iw-mastery-coverage': /<span class="iw-mastery-coverage"[^>]*>/,
      '[data-mastery-contributed]': /<span data-mastery-contributed[^>]*>/, '[data-mastery-inventory]': /<span data-mastery-inventory[^>]*>/ };
    return patterns[selector] ? rowElement(patterns[selector]) : null;
  } };
  const page = { hidden: false, get innerHTML() { return pageMarkup; }, set innerHTML(value) { pageMarkup = value; pageWrites++; },
    get writes() { return pageWrites; }, style: { setProperty() {} }, contains: () => true,
    querySelector: selector => selector === '[data-mastery-status]' && rowPattern.test(pageMarkup) ? masteryRow : null, querySelectorAll: () => [] };
  const document = { hidden: false, activeElement: null, body: { textContent: '', appendChild(node) { nodes.set(node.id, node); } },
    querySelector: selector => selector === '[data-mastery-settings]' ? settingsControl : selector === '.iw-mastery-panel [data-modal-close]' ? closeControl : nodes.get(selector.slice(1)) || null, querySelectorAll: () => [],
    createElement() { return { innerHTML: '', get content() { return { firstElementChild: { markup: this.innerHTML } }; },
      appendChild(child) { this.innerHTML = child.markup; }, remove() { nodes.delete(this.id); } }; },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); } };
  const settingsControl = { get disabled() { return /data-mastery-settings disabled/.test(nodes.get('iw-global-dialogs')?.innerHTML || ''); },
    focus() { if (!this.disabled) document.activeElement = this; } };
  const closeControl = { focus() { document.activeElement = this; } };
  const user = { displayName: 'Player', isSolo: false, coins: 40, inventory: { '101': { amount: 50 } },
    skills: { '1': { exp: 80 }, '2': { exp: 200 } }, masteries: { skills: { '1': { items: { '101': 20 }, complete: false }, '2': { items: {}, complete: true } } } };
  const runtime = { state: { user, isSolo: false, syncUser(value) { this.user = value; } },
    catalog: { '101': { id: '101', name: 'Pine Log', tier: 1, image: 'items/pine-log.png' } },
    mastery: { catalog: { '1': { id: '1', name: 'Woodcutting', items: { '101': '101' } }, '2': { id: '2', name: 'Mining', items: { '101': '101' } } }, cost: 100, exp: 200, required: () => 100 },
    zone: { run: fn => fn() }, action: { handleActionSync() {} }, automations: { handleAutomationSync() {} }, expedition: { handleExpeditionSync() {} },
    firebase: { getUser() { calls.push('read'); return { subscribe(o) { o.next({ user: structuredClone(runtime.state.user), time: 100000 }); o.complete(); return { unsubscribe() {} }; } }; } } };
  configure(runtime);
  const h = harness({ document, page, setTimeout, clearTimeout, console: { error: (...args) => errors.push(args) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  h.context.findNativeSyncRuntime = () => runtime;
  h.run('AppState.ui.page = page; installEventDelegation();');
  function render() { h.context.render(); assert.deepEqual(errors, []); return nodes.get('iw-global-dialogs')?.innerHTML || ''; }
  const trigger = { closest: selector => selector === '[data-mastery-open]' ? trigger : null, matches: () => false,
    focus() { document.activeElement = trigger; } };
  function open(target = trigger) {
    target.focus();
    for (const handler of listeners.click || []) handler({ target, preventDefault() {} });
    return render();
  }
  function escape() {
    for (const handler of listeners.keydown || []) handler({ key: 'Escape', target: trigger, preventDefault() {} });
    return render();
  }
  function settings() {
    const target = { closest: selector => selector === '[data-mastery-settings]' ? target : null, matches: () => false };
    for (const handler of listeners.click || []) handler({ target, preventDefault() {} });
    return render();
  }
  function change(id) {
    if (!render().includes('data-mastery-pick="' + id + '"')) settings();
    const target = { dataset: { masteryPick: id }, closest: selector => selector === '[data-mastery-pick]' ? target : null, matches: () => false };
    for (const handler of listeners.click || []) handler({ target, preventDefault() {} });
    return render();
  }
  async function refresh() {
    const target = { disabled: false, closest: selector => selector === '[data-mastery-refresh]' ? target : null, matches: () => false };
    for (const handler of listeners.click || []) handler({ target, preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
    return render();
  }
  open();
  return { h, runtime, user, page, storage, calls, render, change, refresh, open, escape, document, trigger, closeControl, settings, settingsControl };
}

test('selecting a native mastery shows independent material, XP and coin requirements without mutations', () => {
  const s = setup();
  assert.match(s.render(), /aria-label="Choose skill to follow"/);
  assert.doesNotMatch(s.render(), /<select/);
  const html = s.change('1');
  assert.match(html, /data-label="Required">100/);
  assert.match(html, /data-label="Contributed">20/);
  assert.match(html, /data-label="Owned">50/);
  assert.match(html, /data-label="Missing now">30/);
  assert.match(html, /src="\/assets\/items\/pine-log.png" alt=""/);
  assert.match(html, /XP.*80.*200.*Insufficient/s);
  assert.match(html, /Coins.*40.*100.*Insufficient/s);
  assert.match(html, /data-label="Pending loot">Unknown/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
  assert.match(html, /href="\/mastery"/);
  assert.deepEqual(s.calls, []);
});

function currentLoot(s, loot = { '101': { amount: 10 } }) {
  s.user.action = { skillId: '1', actionId: '10', startDate: '2026-09-26T12:00:00Z' };
  s.runtime.skillCatalog = { '1': { id: '1', actions: [{ id: '10' }] } };
  s.runtime.actionCatalog = { '10': { id: '10', name: 'Pine Tree' } };
  Object.assign(s.runtime.state, { loadingApp: false, syncingData: false });
  Object.assign(s.runtime.action, { actionLoot: loot, actionLoading: false, actionSeed: () => 0.5 });
}

test('Current Loot covers a conditional mastery shortfall without becoming owned inventory', () => {
  const s = setup(); currentLoot(s);
  let html = s.change('1');
  assert.match(html, /data-label="Owned">50/);
  assert.match(html, /data-label="Pending loot">10/);
  assert.match(html, /data-label="Missing now">30/);
  assert.match(html, /data-label="Missing after collection">20/);
  s.runtime.action.actionLoot['101'].amount = 40;
  html = s.render();
  assert.match(html, /data-label="Missing after collection">0/);
  assert.match(html, /data-label="Missing now">30/);
  assert.match(html, /if.*collect/i);
  assert.deepEqual(s.calls, []);
});

test('empty Current Loot is zero only with a ready native source; missing and partial evidence stay incomplete', () => {
  const s = setup(); currentLoot(s, {});
  assert.match(s.change('1'), /data-label="Pending loot">0/);
  assert.match(s.render(), /data-label="Missing after collection">30/);
  s.runtime.action.actionLoot = { '101': { amount: 10 }, '999': { amount: 90 } };
  let html = s.render();
  assert.match(html, /data-label="Pending loot">10/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
  assert.match(html, /known loot covers 10.*incomplete/i);
  delete s.runtime.action.actionLoot;
  s.h.time(400000);
  html = s.render();
  assert.match(html, /10 \(last observed\)/);
  assert.match(html, /Current Loot observed 5 min ago/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
  assert.deepEqual(s.calls, []);
});

test('collection transitions never combine transferred inventory with old pending loot', async () => {
  const s = setup(); currentLoot(s); s.change('1');
  // Native collection updates inventory before clearing its pending map.
  s.runtime.action.actionLoading = true;
  s.user.inventory['101'].amount = 60;
  let html = s.render();
  assert.match(html, /data-label="Owned">Unknown/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
  s.runtime.action.actionLoot = {};
  s.user.action = null;
  s.runtime.action.actionLoading = false;
  html = s.render();
  assert.match(html, /data-label="Owned">60/);
  assert.match(html, /data-label="Pending loot">0/);
  assert.match(html, /data-label="Missing now">20/);
  assert.match(html, /data-label="Missing after collection">20/);
  html = await s.refresh();
  assert.match(html, /data-label="Owned">60/);
  assert.match(html, /data-label="Missing after collection">20/);
  assert.deepEqual(s.calls, ['read']);
});

test('saved loot is validated and remains historical until the same action is observed again', () => {
  const s = setup(); currentLoot(s); s.change('1');
  const reload = setup(new Map(s.storage), runtime => { delete runtime.mastery; });
  assert.match(reload.render(), /data-label="Missing after collection">Unknown/);
  const key = 'iw-status-mastery-v1:' + JSON.stringify(['Player', false]);
  const saved = JSON.parse(s.storage.get(key));
  saved.snapshots['1'].loot = { complete: true, items: { '101': -50 }, observedAt: 100000, actionKey: 'idle', retained: false };
  s.storage.set(key, JSON.stringify(saved));
  const invalid = setup(s.storage, runtime => { delete runtime.mastery; });
  assert.match(invalid.render(), /data-label="Pending loot">Unknown/);
  assert.doesNotMatch(invalid.render(), /-50/);
});

test('unresolved requirement identities cannot be matched to pending loot', () => {
  const s = setup(); currentLoot(s);
  s.runtime.mastery.catalog['1'].items['101'] = '999';
  const html = s.change('1');
  assert.match(html, /Unknown item \(101\)/);
  assert.match(html, /data-label="Pending loot">Unknown/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
});

test('loot follows the exact main action and character, excluding queues and parallel rewards', () => {
  const s = setup(); currentLoot(s); s.change('1');
  s.runtime.automations.loot = { '101': { amount: 900 } };
  s.runtime.expedition.loot = { '101': { amount: 800 } };
  s.user.attunement = { loot: { '101': { amount: 700 } } };
  s.user.action.amount = 500;
  assert.match(s.render(), /data-label="Pending loot">10/);
  // A new instance of the same action must not inherit an unavailable old map.
  s.user.action.startDate = '2026-09-26T13:00:00Z';
  delete s.runtime.action.actionLoot;
  let html = s.render();
  assert.match(html, /data-label="Pending loot">Unknown/);
  assert.doesNotMatch(html, /last observed/);
  s.runtime.action.actionLoot = { '101': { amount: 4 } };
  assert.match(s.render(), /data-label="Missing after collection">26/);
  s.user.displayName = 'Other';
  assert.doesNotMatch(s.render(), /data-label="Pending loot"/);
  s.change('1');
  assert.match(s.render(), /data-label="Pending loot">4/);
  s.runtime.state.isSolo = s.user.isSolo = true;
  assert.doesNotMatch(s.render(), /data-label="Pending loot"/);
  assert.deepEqual(s.calls, []);
});

test('loading, malformed, mismatched and unavailable native sources never imply empty loot', () => {
  for (const invalidate of [
    s => { delete s.runtime.action.actionLoot; },
    s => { s.runtime.action.actionLoot = []; },
    s => { s.runtime.action.actionLoot = { '101': null }; },
    s => { s.runtime.skillCatalog['1'].actions = {}; },
    s => { s.runtime.action.actionLoot = { '101': { amount: -1 } }; },
    s => { s.runtime.action.actionLoot = { '101': { amount: 10, id: '999' } }; },
    s => { s.runtime.catalog['101'].id = '999'; },
    s => { s.runtime.action.actionLoading = true; },
    s => { s.runtime.action.actionSeed = null; },
    s => { s.runtime.state.loadingApp = true; },
    s => { s.runtime.state.syncingData = true; },
    s => { s.runtime.state.appActive = false; },
    s => { delete s.user.action; },
    s => { s.user.action.skillId = '15'; },
    s => { s.user.action = null; },
  ]) {
    const s = setup(); currentLoot(s); invalidate(s);
    const html = s.change('1');
    assert.match(html, /data-label="Pending loot">Unknown/);
    assert.match(html, /data-label="Missing after collection">Unknown/);
    assert.deepEqual(s.calls, []);
  }
});

test('loot remains conditional across submission races, read-only refresh and route rebuilds', async () => {
  const s = setup(); currentLoot(s); s.change('1');
  s.user.masteries.skills['1'].items['101'] = 60;
  assert.match(s.render(), /data-label="Missing after collection">Unknown/);
  s.user.inventory['101'].amount = 10;
  const html = await s.refresh();
  assert.match(html, /data-label="Missing after collection">20/);
  // DOM is absent throughout this harness: native evidence survives routing.
  s.h.context.location.pathname = '/mastery';
  assert.match(s.render(), /data-label="Pending loot">10/);
  s.h.context.location.pathname = '/status';
  assert.match(s.render(), /data-label="Missing after collection">20/);
  s.h.time(400000);
  assert.match(s.render(), /Current Loot observed 5 min ago/);
  assert.deepEqual(s.calls, ['read']);
  s.runtime.firebase.getUser = () => { throw Error('Offline'); };
  assert.match(await s.refresh(), /Refresh unavailable: Offline/);
  assert.match(s.render(), /data-label="Missing after collection">20/);
});

test('Refresh waits for native collection rather than mixing a new snapshot into its transfer', async () => {
  const s = setup(); currentLoot(s); s.change('1');
  s.runtime.action.actionLoading = true;
  const html = await s.refresh();
  assert.match(html, /data-mastery-refresh disabled/);
  assert.match(html, /data-label="Missing after collection">Unknown/);
  assert.deepEqual(s.calls, []);
});

test('a contribution change cannot reuse an old owned balance until read-only reconciliation', async () => {
  const s = setup();
  s.change('1');
  s.user.masteries.skills['1'].items['101'] = 60;
  let html = s.render();
  assert.match(html, /data-label="Contributed">60/);
  assert.match(html, /data-label="Missing now">Unknown/);
  assert.match(html, /contributions changed.*Refresh/i);
  // A real submission consumed 40 items; the response pairs both balances.
  s.user.inventory['101'].amount = 10;
  html = await s.refresh();
  assert.match(html, /data-label="Owned">10/);
  assert.match(html, /data-label="Missing now">30/);
  assert.deepEqual(s.calls, ['read']);
});

test('unfinished selections survive reloads; characters and modes are isolated', () => {
  const s = setup();
  s.change('1');
  const reload = setup(s.storage);
  assert.match(reload.render(), /<strong>Woodcutting<\/strong>/);
  assert.match(reload.render(), /Mastery not complete/);
  reload.runtime.state.user.displayName = 'Other';
  assert.doesNotMatch(reload.render(), /<strong>Woodcutting<\/strong>/);
  reload.runtime.state.user.displayName = 'Player';
  reload.runtime.state.isSolo = reload.runtime.state.user.isSolo = true;
  assert.doesNotMatch(reload.render(), /<strong>Woodcutting<\/strong>/);
  reload.runtime.state.isSolo = reload.runtime.state.user.isSolo = false;
  assert.match(reload.render(), /<strong>Woodcutting<\/strong>/);
  reload.runtime.state.swappingCharacter = true;
  assert.match(reload.render(), /Character identity unavailable/);
  assert.doesNotMatch(reload.render(), /Mastery complete/);
});

test('changing the selection or reloading does not bypass incomplete contribution reconciliation', () => {
  const s = setup();
  s.change('1');
  s.user.masteries.skills['1'].items['101'] = 60;
  s.render();
  s.runtime.mastery.catalog['3'] = { id: '3', name: 'Smelting', items: {} };
  s.change('3');
  assert.match(s.change('1'), /data-label="Missing now">Unknown/);
  const reload = setup(s.storage);
  reload.user.masteries.skills['1'].items['101'] = 60;
  assert.match(reload.render(), /data-label="Missing now">Unknown/);
});

test('Mastery Contracts change contributions independently; covered materials do not imply completion', async () => {
  const s = setup();
  s.change('1');
  s.user.masteries.skills['1'].items['101'] = 90;
  assert.match(s.render(), /data-label="Missing now">Unknown/);
  const html = await s.refresh();
  assert.match(html, /data-label="Contributed">90/);
  assert.match(html, /data-label="Owned">50/);
  assert.match(html, /data-label="Missing now">0/);
  assert.match(html, /<tr class="iw-mastery-covered">/);
  assert.match(html, /Mastery not complete/);
  assert.match(html, /XP.*Insufficient/s);
  s.runtime.state.user.masteries.skills['1'].complete = true;
  assert.doesNotMatch(s.render(), /data-mastery-pick="1"/);
  assert.match(s.render(), /All masteries are complete/);
});

test('only confirmed covered requirements are muted; shortages and unknown balances stay prominent', () => {
  const s = setup();
  s.user.skills['1'].exp = 250;
  let html = s.change('1');
  assert.match(html, /data-requirement="XP" class="iw-mastery-requirement iw-mastery-covered"/);
  assert.doesNotMatch(html, /data-requirement="Coins" class="iw-mastery-requirement iw-mastery-covered"/);
  assert.doesNotMatch(html, /<tr class="iw-mastery-covered">/);
  s.user.inventory['101'].amount = 80;
  assert.match(s.render(), /<tr class="iw-mastery-covered">/);
  s.user.inventory['101'].amount = null;
  assert.doesNotMatch(s.render(), /<tr class="iw-mastery-covered">/);
});

test('unknown requirements, contributions, inventory and item identities leave explicit gaps', () => {
  for (const invalidate of [
    s => { delete s.user.inventory; },
    s => { delete s.user.masteries.skills['1'].items; },
    s => { s.user.inventory['101'].amount = NaN; },
    s => { s.user.masteries.skills['1'].items['101'] = -1; },
    s => { s.user.masteries.skills['1'].items['101'] = null; },
    s => { s.user.masteries.skills['1'].items = 'invalid'; },
    s => { s.user.inventory = []; },
    s => { s.runtime.catalog['101'].id = '999'; },
    s => { delete s.runtime.catalog['101']; },
    s => { s.runtime.mastery.required = () => { throw Error('unsupported'); }; }
  ]) {
    const s = setup(); invalidate(s);
    assert.match(s.change('1'), /data-label="Missing now">Unknown/);
    assert.match(s.render(), /Incomplete evidence/);
    assert.deepEqual(s.calls, []);
  }
});

test('missing native inventory entries are zero only inside a known inventory; loot is excluded', () => {
  const s = setup();
  s.user.inventory = {};
  s.runtime.action.actionLoot = { '101': { amount: 1000 } };
  const html = s.change('1');
  assert.match(html, /data-label="Owned">0/);
  assert.match(html, /data-label="Missing now">80/);
});

test('observation age does not cause reads; explicit refresh retains data on failure', async () => {
  const s = setup(); s.change('1');
  s.h.time(400000);
  assert.match(s.render(), /inventory observed 5 min ago/);
  assert.deepEqual(s.calls, []);
  s.runtime.firebase.getUser = () => { throw Error('Offline'); };
  assert.match(await s.refresh(), /Refresh unavailable: Offline/);
  assert.match(s.render(), /data-label="Missing now">30/);
  assert.match(s.render(), /inventory observed 5 min ago/);
});

test('refresh refuses a different character and never invokes gameplay mutation methods', async () => {
  const s = setup(); s.change('1');
  for (const method of ['giveMasteryItems', 'claimMastery', 'startAction', 'stopAction']) {
    s.runtime.firebase[method] = () => { throw Error('Gameplay mutation forbidden'); };
  }
  await s.refresh();
  assert.deepEqual(s.calls, ['read']);
  s.runtime.firebase.getUser = () => ({ subscribe(o) { o.next({ user: { ...s.user, displayName: 'Other' }, time: 100001 }); return { unsubscribe() {} }; } });
  assert.match(await s.refresh(), /Character changed during synchronization/);
  assert.match(s.render(), /data-label="Missing now">30/);
  s.h.context.location.pathname = '/mastery';
  s.h.run("AppState.ui.lastSignature = ''; ");
  assert.doesNotMatch(s.page.innerHTML, /iw-mastery-card/);
});

test('the mastery symbol opens a modal without adding a full Status panel; Escape returns focus', () => {
  const s = setup();
  assert.doesNotMatch(s.page.innerHTML, /data-mastery-select|iw-mastery-card/);
  assert.match(s.render(), /role="dialog" aria-modal="true" aria-labelledby="iw-mastery-title"/);
  assert.equal(s.h.context.location.pathname, '/status');
  assert.equal(s.escape(), '');
  assert.equal(s.document.activeElement, s.trigger);
  assert.match(s.open(), /Skill mastery tracking/);
});

test('native sparse completion flags mean not complete, while malformed records remain unknown', () => {
  const s = setup();
  delete s.user.masteries.skills['1'].complete;
  assert.match(s.change('1'), /Mastery not complete/);
  s.user.masteries.skills['1'].complete = 'yes';
  assert.match(s.render(), /Mastery completion unknown/);
  s.user.masteries = null;
  assert.match(s.render(), /Mastery completion unknown/);
});

test('Taming appears first in native skill order and its mixed materials follow native tier order', () => {
  const s = setup();
  s.runtime.skillOrder = ['15', '1', '2'];
  s.runtime.mastery.catalog['15'] = { id: '15', name: 'Taming', items: { '101': '101', '102': '102' } };
  s.runtime.catalog['101'].tier = 7;
  s.runtime.catalog['102'] = { id: '102', name: 'Rose', tier: 3 };
  s.user.masteries.skills['15'] = { items: { '101': 20, '102': 30 } };
  s.user.skills['15'] = { exp: 250 };
  const initial = s.render();
  assert.ok(initial.indexOf('data-mastery-pick="15"') < initial.indexOf('data-mastery-pick="1"'));
  const html = s.change('15');
  assert.match(html, /<strong>Taming<\/strong>/);
  assert.ok(html.indexOf('>Rose</span>') < html.indexOf('>Pine Log</span>'));
  assert.match(html, /data-label="Contributed">30/);
});


test('completed masteries are excluded and an old completed selection asks for an unfinished mastery', () => {
  const s = setup();
  assert.doesNotMatch(s.render(), /data-mastery-pick="2"/);
  s.change('2');
  assert.doesNotMatch(s.render(), /<strong>Mining/);
  const key = 'iw-status-mastery-v1:' + JSON.stringify(['Player', false]);
  s.storage.set(key, JSON.stringify({ version: 1, selected: '2' }));
  const reload = setup(s.storage);
  const html = reload.render();
  assert.match(html, /selected mastery is complete/i);
  assert.doesNotMatch(html, /data-mastery-pick="2"|iw-mastery-table/);
  reload.user.masteries.skills['1'].complete = true;
  assert.match(reload.render(), /All masteries are complete/);
  reload.escape();
  reload.open();
  assert.equal(reload.document.activeElement, reload.closeControl);
});


test('the gear selects a followed skill and the header reports obtained masteries without changing gameplay', () => {
  const s = setup();
  let html = s.change('1');
  assert.match(html, /Skill mastery tracking/);
  assert.match(html, /<strong>Woodcutting<\/strong>/);
  assert.match(html, /src="\/assets\/misc\/woodcutting.png"/);
  assert.match(html, /1 \/ 2 masteries obtained/);
  assert.match(html, /is-obtained[^>]*title="Mining · Obtained"/);
  assert.match(html, /src="\/assets\/badges\/mining.png" alt="Mining mastery obtained"/);
  assert.doesNotMatch(html, /is-pending|iw-mastery-empty|Woodcutting mastery obtained/);
  assert.doesNotMatch(html, /data-mastery-pick=/);
  html = s.settings();
  assert.match(html, /data-mastery-pick="1"/);
  assert.doesNotMatch(html, /data-mastery-pick="2"/);
  delete s.user.masteries.skills['1'];
  html = s.render();
  assert.match(html, /1 \/ 2 masteries obtained/);
  assert.match(html, /Mastery not complete/);
  assert.doesNotMatch(html, /Mastery completion unknown/);
  s.user.masteries.skills['1'] = null;
  assert.match(s.render(), /Mastery count unavailable/);
  delete s.user.masteries;
  html = s.render();
  assert.match(html, /Mastery count unavailable/);
  assert.doesNotMatch(html, /is-obtained/);
  assert.deepEqual(s.calls, []);
});


test('requirement progress caps covered balances and leaves unknown balances indeterminate', () => {
  const s = setup();
  let html = s.change('1');
  assert.match(html, /60 needed/);
  assert.match(html, /aria-label="Coins requirement"[^>]*aria-valuenow="40"/);
  s.user.skills['1'].exp = 400;
  html = s.render();
  assert.match(html, /aria-label="XP requirement"[^>]*aria-valuenow="100"/);
  assert.match(html, /400 of 200 · Covered/);
  s.runtime.mastery.exp = 0;
  assert.match(s.render(), /aria-label="XP requirement"[^>]*aria-valuenow="100"/);
  delete s.user.coins;
  html = s.render();
  assert.match(html, /aria-label="Coins requirement"[^>]*Unknown/);
  assert.doesNotMatch(html, /aria-label="Coins requirement"[^>]*aria-valuenow=/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('Status follows the selected mastery with one contributed and inventory coverage bar', () => {
  const s = setup(); s.change('1'); s.escape();
  const row = () => s.page.innerHTML.match(/<button[^>]*data-mastery-status[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(row(), /Woodcutting/);
  assert.match(row(), /20% contributed/);
  assert.match(row(), /70% with inventory/);
  assert.match(row(), /data-mastery-contributed style="width:20%"/);
  assert.match(row(), /data-mastery-inventory style="width:50%"/);
  s.user.inventory['101'].amount = 70; s.render();
  assert.match(row(), /90% with inventory/);
  assert.match(row(), /data-mastery-inventory style="width:70%"/);
  assert.deepEqual(s.calls, []);
});

function statusMasteryRow(s) {
  return s.page.innerHTML.match(/<button[^>]*data-mastery-status[\s\S]*?<\/button>/)?.[0] || '';
}

test('Status caps each mastery material even when owned inventory and Current Loot have surplus', () => {
  const s = setup(new Map(), runtime => {
    runtime.catalog['102'] = { id: '102', name: 'Oak Log', tier: 2 };
    runtime.mastery.catalog['1'].items['102'] = '102';
    runtime.state.user.inventory['101'].amount = 1000;
  });
  currentLoot(s, { '101': { amount: 1000 } });
  s.change('1'); s.escape();
  assert.match(statusMasteryRow(s), /10% contributed · 50% with inventory/);
  assert.match(statusMasteryRow(s), /data-mastery-inventory style="width:40%"/);
  s.runtime.action.actionLoot['101'].amount = 2000; s.render();
  assert.match(statusMasteryRow(s), /50% with inventory/);
  assert.deepEqual(s.calls, []);
});

test('Status retains contributed progress while inventory needs reconciliation, then refresh restores coverage', async () => {
  const s = setup(); s.change('1'); s.escape();
  s.user.masteries.skills['1'].items['101'] = 40;
  s.user.inventory['101'].amount = 30; s.render();
  assert.match(statusMasteryRow(s), /40% contributed · Inventory needs refresh/);
  assert.match(statusMasteryRow(s), /data-mastery-inventory style="width:0%"/);
  s.open(); await s.refresh(); s.escape();
  assert.match(statusMasteryRow(s), /40% contributed · 70% with inventory/);
  s.runtime.action.actionLoading = true; s.render();
  assert.match(statusMasteryRow(s), /Inventory coverage unknown/);
  s.runtime.action.actionLoading = false;
  delete s.runtime.state.user.inventory; s.render();
  assert.match(statusMasteryRow(s), /40% contributed · Inventory coverage unknown/);
  assert.deepEqual(s.calls, ['read']);
});

test('Status row opens the same mastery menu as the symbol and returns focus on close', () => {
  const s = setup(); s.change('1'); s.escape();
  assert.match(statusMasteryRow(s), /data-mastery-open aria-haspopup="dialog"/);
  const rowControl = { closest: selector => selector === '[data-mastery-open]' ? rowControl : null,
    matches: () => false, focus() { s.document.activeElement = rowControl; } };
  const fromRow = s.open(rowControl);
  assert.match(fromRow, /role="dialog"/);
  assert.match(fromRow, /<strong>Woodcutting<\/strong>/);
  assert.match(fromRow, /data-label="Contributed">20/);
  s.escape();
  assert.equal(s.document.activeElement, rowControl);
  assert.equal(s.open(), fromRow);
  assert.deepEqual(s.calls, []);
});

test('Status updates mastery selection, handles completion and hides unavailable or another character’s progress', () => {
  const s = setup(new Map(), runtime => { runtime.state.user.masteries.skills['2'].complete = false; });
  assert.match(statusMasteryRow(s), /Choose a mastery to follow/);
  s.change('1'); s.change('2'); s.escape();
  assert.match(statusMasteryRow(s), /Mining/);
  assert.match(statusMasteryRow(s), /0% contributed · 50% with inventory/);
  delete s.user.masteries.skills['2'].items; s.render();
  assert.match(statusMasteryRow(s), /Material progress unknown/);
  assert.doesNotMatch(statusMasteryRow(s), /data-mastery-contributed/);
  s.user.masteries.skills['2'].complete = true; s.render();
  assert.match(statusMasteryRow(s), /Mastery complete/);
  assert.match(statusMasteryRow(s), /data-mastery-contributed style="width:100%"/);
  delete s.runtime.mastery; s.render();
  assert.match(statusMasteryRow(s), /Progress unavailable/);
  assert.doesNotMatch(statusMasteryRow(s), /Mastery complete|data-mastery-contributed/);
  s.user.displayName = 'Other'; s.render();
  assert.match(statusMasteryRow(s), /Choose a mastery to follow/);
  assert.doesNotMatch(statusMasteryRow(s), /Mining|Woodcutting/);
  assert.deepEqual(s.calls, []);
});

test('Status adds current uncollected loot to inventory coverage without counting it twice after collection', () => {
  const s = setup(); currentLoot(s);
  s.change('1'); s.escape();
  assert.match(statusMasteryRow(s), /20% contributed · 80% with inventory \+ loot/);
  s.runtime.action.actionLoading = true;
  s.user.inventory['101'].amount = 60; s.render();
  assert.match(statusMasteryRow(s), /Inventory coverage unknown/);
  s.runtime.action.actionLoot = {}; s.runtime.action.actionLoading = false; s.render();
  assert.match(statusMasteryRow(s), /20% contributed · 80% with inventory \+ loot/);
  assert.deepEqual(s.calls, []);
});

test('Status labels partial loot coverage and drops retained loot rather than treating it as current', () => {
  const s = setup(); currentLoot(s, { '101': { amount: 10 }, '999': { amount: -1 } });
  s.change('1'); s.escape();
  assert.match(statusMasteryRow(s), /80% with inventory \+ known loot/);
  assert.match(statusMasteryRow(s), /coverage is a lower bound/);
  s.runtime.action.actionSeed = undefined; s.render();
  assert.match(statusMasteryRow(s), /70% with inventory \+ known loot/);
  assert.deepEqual(s.calls, []);
});

test('Current Loot updates the visible mastery bar without rewriting the dashboard', () => {
  const s = setup(); currentLoot(s);
  s.change('1'); s.escape();
  assert.match(statusMasteryRow(s), /Woodcutting<span data-mastery-total>80%<\/span>/);
  const writes = s.page.writes;
  s.runtime.action.actionLoot['101'].amount = 20; s.render();
  assert.match(statusMasteryRow(s), /20% contributed · 90% with inventory \+ loot/);
  assert.match(statusMasteryRow(s), /data-mastery-inventory style="width:70%"/);
  assert.match(statusMasteryRow(s), /Woodcutting<span data-mastery-total>90%<\/span>/);
  assert.equal(s.page.writes, writes);
  assert.deepEqual(s.calls, []);
});
