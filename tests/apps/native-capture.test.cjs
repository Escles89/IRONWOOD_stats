const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
// Small native DOM fixtures expose only the selectors used by the integration.
function element(text = '', singles = {}, lists = {}, extra = {}) {
  return { textContent: text, querySelector: selector => singles[selector] || null,
    querySelectorAll: selector => lists[selector] || [], ...extra };
}
function item(name, amount, image) {
  return element('', { ':scope > .name': element(name), ':scope > .amount': element(amount), ':scope > .worth': element('12'), ':scope > .image img': { src: image } });
}
function card(name, rows) { return element('', { ':scope > .header > .name': element(name) }, { ':scope > .row': rows }); }
function nativeFixture() {
  const loot = card('Loot', [item('Ancient Log', '1,234', '/log.png')]);
  const consumables = card('Consumables', [item('Elite Key', '12', '/key.png')]);
  const action = element('Ancient Tree', {
    ':scope > .bars .fill': { style: { width: '42%' } },
    ':scope > .header > .name': element('Ancient Tree'),
    ':scope > .header > .level, :scope > .details > .level': element('Lv. 100'),
    ':scope > .body img': { src: '/tree.png' }
  });
  const tracker = element('', { '.header .name': element('Woodcutting'), '.header .level': element('Lv. 123'), '.percent': element('70%') });
  const xp = element('XP 54,000 / hour', {}, {}, { children: [element('XP'), element('54,000')], closest: () => null });
  return element('', {
    'skill-page action-component > .card': action, 'skill-page tracker-component .skill': tracker
  }, {
    'skill-page .card': [loot, consumables], 'skill-page .row': [xp],
    'skill-page button.filter': [{ textContent: 'Outskirts', disabled: true }]
  }, { body: { textContent: '' } });
}
test('source adapter captures native action, loot, consumables and route into central state', () => {
  const document = nativeFixture();
  const h = harness({ document, location: { pathname: '/skill/1/action/1005' } });
  const live = h.run('SourceAdapter.capture(document)');
  assert.equal(live.action.name, 'Ancient Tree');
  assert.equal(live.action.actionId, '1005');
  assert.equal(live.action.progress, 42);
  assert.equal(live.action.skillProgress, 70);
  assert.equal(live.action.xpPerHour, 54000);
  assert.equal(live.loot[0].amount, 1234);
  assert.equal(live.consumables[0].name, 'Elite Key');
  assert.equal(live.consumables[0].amount, '12');
  assert.equal(live.observations.route, '/skill/1/action/1005');
  assert.equal(h.run('AppState.live === SourceAdapter.capture(document)'), true);
});
test('native inventory normalizes compact quantity and image keys in the new cache', () => {
  const button = element('', { img: { getAttribute: () => '/assets/items/potion-divine-preservation.png' }, '.amount': element('1.2K'), '.name': element('Divine Multi Craft Potion') });
  const document = element('', {}, { 'inventory-page button.item': [button] });
  const h = harness({ document });
  h.run('collectInventory(document)');
  assert.equal(h.run(`CacheStore.get('inventory').allItems[0].amount`), 1200);
  assert.equal(h.run(`CacheStore.get('inventory').allItems[0].key`), 'potion-divine-preservation.png');
  assert.equal(h.run(`CacheStore.get('inventory').items[0].amount`), 1200);
  assert.equal(h.run(`CacheStore.isFresh('inventory')`), true);
});
test('active dashboard composes feature panels and then uses lightweight updates', () => {
  const errors = [];
  const document = nativeFixture();
  const h = harness({ document, console: { error(...args) { errors.push(args); } } });
  h.run(`AppState.ui.page = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } }; StatusRenderer.render(AppState);`);
  assert.deepEqual(errors, []);
  assert.match(h.run('AppState.ui.page.innerHTML'), /Ancient Tree/);
  assert.equal(h.run('AppState.derived.displayedPotions.length'), 5);
  h.run(`globalThis.liveUpdates = 0; StatusRenderer.updateLive = () => { liveUpdates++; }; StatusRenderer.render(AppState)`);
  assert.equal(h.run('liveUpdates'), 1);
});
test('combat view renders effect timelines, consumables and elite ordering together', () => {
  const h = harness({ document: nativeFixture() });
  h.run(`readCurrentAction = () => ({ isCombat: true, isElite: true, name: 'Treant', location: 'Outskirts', skillName: 'Defense', combatants: [{ side: 'player', name: 'You', hp: 70, maxHp: 100, hpPercent: 70, healAmount: 5, effectStarted: { heal: 99500 } }, { side: 'monster', name: 'Treant', image: '/treant.png', hp: 0, hpPercent: 0, dead: true, effectStarted: { death: 99750 } }] }); AppState.ui.page = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } }; StatusRenderer.render(AppState);`);
  const markup = h.run('AppState.ui.page.innerHTML');
  assert.doesNotMatch(markup, /Status could not render/);
  assert.match(markup, /Elite Treant/);
  assert.match(markup, /--iw-heal-delay:-500ms/);
  assert.match(markup, /--iw-death-delay:-250ms/);
});

test('source adapter uses the supplied document, including card lookups', () => {
  const h = harness();
  h.context.nativeDocument = nativeFixture();
  const live = h.run('SourceAdapter.capture(nativeDocument)');
  assert.equal(live.loot[0].amount, 1234);
  assert.equal(live.consumables[0].name, 'Elite Key');
});

test('active skill falls back to the native sidebar shortcut when the tracker is absent', () => {
  const document = nativeFixture();
  const originalQuery = document.querySelector;
  document.querySelector = selector => {
    if (selector === 'skill-page tracker-component .skill') return null;
    if (selector === 'nav-component action-component button.button .details > .skill, nav-component combat-component button.button .details > .skill') return { textContent: 'Defense' };
    return originalQuery(selector);
  };
  const h = harness({ document });
  assert.equal(h.run('SourceAdapter.capture(document).action.skillName'), 'Defense');
  assert.equal(h.run(`guildTrialBonusActive({ schema: 4, state: 'Active', activeName: 'Defense Trial', stateEndsAt: 200000 }, AppState.live.action.skillName)`), true);
});

test('enemy remount gaps preserve combat briefly, expire to idle, and do not override a new action', () => {
  const document = element('', {}, {}, { body: { textContent: 'Revive in 20 seconds' } });
  const h = harness({ document });
  h.run(`AppState.live.lastCombatAction = { name: 'Treant', isCombat: true, combatants: [] }; AppState.live.lastCombatSeenAt = Date.now()`);
  h.time(100250);
  assert.equal(h.context.readCurrentAction().name, 'Treant');
  assert.equal(h.context.readCurrentAction().combatGrace, true);
  // Our own dashboard text must not be reinterpreted as native revive state.
  assert.equal(h.context.readCurrentAction().reviveRemainingMs, 0);
  h.time(102500);
  assert.equal(h.context.readCurrentAction(), null);
  h.time(100500);
  h.context.document = nativeFixture();
  assert.equal(h.context.readCurrentAction().name, 'Ancient Tree');
});

test('native revive state with an idle action card uses the retained combat snapshot', () => {
  const document = element('', {
    'skill-page': element('Reviving in 20 seconds'),
    'skill-page action-component > .card': element('Selected action')
  });
  const h = harness({ document });
  h.run(`AppState.live.lastCombatAction = { name: 'Treant', isCombat: true, combatants: [] }; AppState.live.lastCombatSeenAt = Date.now()`);
  const action = h.context.readCurrentAction();
  assert.equal(action.name, 'Treant');
  assert.equal(action.reviveRemainingMs, 20000);
});
