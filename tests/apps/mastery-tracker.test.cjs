const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(storage = new Map()) {
  const listeners = {}, calls = [], errors = [], nodes = new Map();
  const page = { hidden: false, innerHTML: '', style: { setProperty() {} }, contains: () => true,
    querySelector: () => null, querySelectorAll: () => [] };
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
  const h = harness({ document, page, setTimeout, clearTimeout, console: { error: (...args) => errors.push(args) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  h.context.findNativeSyncRuntime = () => runtime;
  h.run('AppState.ui.page = page; installEventDelegation();');
  function render() { h.context.render(); assert.deepEqual(errors, []); return nodes.get('iw-global-dialogs')?.innerHTML || ''; }
  const trigger = { closest: selector => selector === '[data-mastery-open]' ? trigger : null, matches: () => false,
    focus() { document.activeElement = trigger; } };
  function open() {
    trigger.focus();
    for (const handler of listeners.click || []) handler({ target: trigger, preventDefault() {} });
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
  assert.match(html, /Pending loot.*unavailable/s);
  assert.match(html, /Missing after collection.*unavailable/s);
  assert.match(html, /href="\/mastery"/);
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

test('the mastery symbol opens a modal without adding a Status panel; Escape returns focus', () => {
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
