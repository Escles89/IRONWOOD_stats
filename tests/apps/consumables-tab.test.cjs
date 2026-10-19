const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

const catalog = Object.fromEntries([
  ['1', 'Divine Gather Yield Potion', 'potion-divine-gather-yield.png'],
  ['2', 'Divine Wisdom Sigil', 'sigil-divine-wisdom.png'],
  ['3', 'King Crab Pie', 'pie-king-crab.png'],
  ['4', 'Regular Mastery Brew', 'mastery-brew-regular.png'],
  ['5', 'Elite Key 100', 'key-onyx.png'],
  ['6', 'Basic Health Potion', 'potion-basic-health.png'],
  ['7', 'Divine Craft XP Potion', 'potion-divine-craft-efficiency.png'],
  ['8', 'Super Discovery Sigil', 'sigil-super-discovery.png']
].map(([id, name, key]) => [id, { id, name, image: `items/${key}`, type: 'consumable' }]));
catalog['9'] = { id: '9', name: 'Burnt King Crab Pie', image: 'items/pie-burnt-king-crab.png', type: 'misc' };
const equipped = [
  { key: 'sigil-divine-wisdom.png', name: 'Divine Wisdom Sigil', image: '/assets/items/sigil-divine-wisdom.png', amountText: '5,147 & 35%' },
  { key: 'mastery-brew-regular.png', name: 'Regular Mastery Brew', image: '/assets/items/mastery-brew-regular.png', amountText: 'Empty' }
];

test('consumable supplies include every native consumable type and tier, keeping equipped and stored balances separate', () => {
  const h = harness();
  const inventory = Object.fromEntries(Object.keys(catalog).map(id => [id, { amount: Number(id) * 10 }]));
  const rows = h.context.consumableStock(equipped, null, catalog, inventory);
  assert.equal(rows.length, 8);
  assert.equal(rows.find(row => row.name === 'Divine Wisdom Sigil').stored, 20);
  assert.equal(rows.find(row => row.name === 'Divine Wisdom Sigil').equipped, '5,147 & 35%');
  assert.equal(rows.find(row => row.name === 'Regular Mastery Brew').equipped, 'Empty');
  assert.equal(rows.find(row => row.name === 'Divine Craft XP Potion').stored, 70);
  assert.equal(rows.find(row => row.name === 'Super Discovery Sigil').equipped, '—');
  assert.ok(!rows.some(row => /Burnt/.test(row.name)));
});

test('unknown reserves stay unknown; an observed empty inventory establishes zero', () => {
  const h = harness();
  const unknown = h.context.consumableStock(equipped, null);
  assert.ok(unknown.every(row => row.stored === null));
  assert.match(h.context.renderConsumableStock(unknown, false), /Unknown/);
  const zero = h.context.consumableStock(equipped, { allItems: [] });
  assert.ok(zero.every(row => row.stored === 0));
  assert.equal(zero.length, 2, 'empty equipped brew remains visible');
});

test('live inventory supersedes cached reserves and fallback preserves approximate amounts', () => {
  const h = harness();
  const cache = { allItems: [{ key: 'sigil-divine-wisdom.png', name: 'Divine Wisdom Sigil', image: '/assets/items/sigil-divine-wisdom.png', amount: 1200, approximate: true }] };
  const cached = h.context.consumableStock(equipped, cache, catalog);
  assert.equal(cached.find(row => row.name === 'Divine Wisdom Sigil').approximate, true);
  const live = h.context.consumableStock(equipped, cache, catalog, {});
  assert.equal(live.find(row => row.name === 'Divine Wisdom Sigil').stored, 0);
  assert.equal(live.find(row => row.name === 'Divine Wisdom Sigil').approximate, false);
  const invalid = h.context.consumableStock(equipped, cache, catalog, { '2': { amount: null } });
  assert.equal(invalid.find(row => row.name === 'Divine Wisdom Sigil').stored, null);
});

function timerFixture() {
  const h = harness();
  const runtime = {
    catalog: structuredClone(catalog),
    state: { user: { action: { skillId: 'cook', actionId: 'pie' }, equipment: {
      potion: { id: '7', amount: 10, uses: 900 }, sigil: { id: '2', amount: 2, uses: 450 },
      food: { id: '3', amount: 100 }, key: { id: '5', amount: 4, uses: 2 }, brew: { id: '4', amount: 0, uses: 0 }
    } } },
    skillCatalog: { cook: { name: 'Cooking' }, fight: { name: 'Defense' } },
    equipmentCatalog: { potion: { name: 'Crafting Potion' }, sigil: { name: 'Sigil' }, food: { name: 'Food' }, key: { name: 'Elite Key' } },
    actionCatalog: { pie: {}, elite: { eliteKey: '5' } },
    masteryPassiveCatalog: { 'p': { id: 'p', name: 'Potent Concoction Effect' } }
  };
  runtime.catalog['7'].stats = { duration: 180 };
  runtime.catalog['2'].stats = { duration: 180 };
  runtime.catalog['5'].stats = { uses: 4 };
  const samples = new Map();
  const estimate = (id, now = 0) => h.context.consumableSupplyEstimate({ key: runtime.catalog[id].image.split('/').pop() }, runtime, samples, now);
  return { h, runtime, user: runtime.state.user, samples, estimate };
}

test('timers include the partial current charge, exclude stored reserves and account for doubled tome consumption', () => {
  const f = timerFixture();
  f.user.inventory = { '7': { amount: 9000 } };
  assert.equal(f.estimate('7').label, '≈ 32m left'); // (10 + .5) * 180s
  assert.equal(f.estimate('7').percent, 50);
  assert.equal(f.estimate('2').label, '≈ 7m left');
  f.runtime.catalog.tome = { stats: { potionDuration: 50 } };
  f.user.equipment.tome = { id: 'tome' };
  f.user.masteries = { passives: { p: { level: 1 } } };
  assert.equal(f.estimate('7').label, '≈ 16m left');
  f.runtime.masteryPassiveCatalog = null;
  assert.equal(f.estimate('7').label, 'Estimating time…', 'missing passive metadata never guesses a tome modifier');
});

test('idle and unrelated supplies do not claim to be running down, while an opened last item still has time', () => {
  const f = timerFixture();
  assert.equal(f.estimate('5').label, 'Not in use');
  assert.equal(f.estimate('3').label, 'Not in use');
  assert.equal(f.estimate('4').state, 'empty');
  f.user.equipment.potion.amount = 0;
  assert.equal(f.estimate('7').label, '≈ 2m left');
  f.user.action = null;
  assert.equal(f.estimate('7').label, '≈ 2m of use');
  assert.match(f.estimate('7').detail, /Paused/);
  f.user.equipment.potion.amount = null;
  assert.equal(f.estimate('7').state, 'unknown');
});

test('variable supplies estimate from full observed use intervals and discard rates after a refill or observation gap', () => {
  const f = timerFixture();
  f.user.action = { skillId: 'fight', actionId: 'elite' };
  assert.equal(f.estimate('3').label, 'Estimating time…');
  f.user.equipment.food.amount = 99;
  f.estimate('3', 5000);
  for (const now of [10000, 15000, 20000]) f.estimate('3', now);
  f.user.equipment.food.amount = 98;
  assert.equal(f.estimate('3', 25000).label, '≈ 33m left'); // 98 * 20s
  f.user.equipment.food.amount = 200;
  assert.equal(f.estimate('3', 26000).label, 'Estimating time…');
  assert.equal(f.estimate('3', 60000).label, 'Estimating time…');
  assert.equal(f.estimate('5').state, 'active');
  f.user.action.actionId = 'pie';
  assert.equal(f.estimate('5').state, 'paused');
});

test('supplies render in separate category panels without duplicating the equipped quantities', () => {
  const f = timerFixture();
  const inventory = Object.fromEntries(Object.keys(catalog).map(id => [id, { amount: 10 }]));
  const rows = f.h.context.consumableStock(equipped, null, catalog, inventory);
  const html = f.h.context.renderConsumableStock(rows, true);
  const headings = [...html.matchAll(/<h3>(\w+)</g)].map(match => match[1]);
  assert.deepEqual(headings, ['Potions', 'Sigils', 'Food', 'Keys', 'Brews']);
  assert.doesNotMatch(html, /<th[^>]*>Equipped|5,147/);
});

function equipmentFixture() {
  let writes = 0;
  function node(name = '') {
    const classes = new Set();
    return {
      id: '', textContent: name, dataset: {}, disabled: false, listeners: [],
      classList: { toggle(key, value) { value ? classes.add(key) : classes.delete(key); }, contains: key => classes.has(key) },
      setAttribute() {},
      set innerHTML(value) { this.markup = value; writes++; },
      querySelector(selector) {
        if (selector === '.name') return { set textContent(value) { name = value; }, get textContent() { return name; } };
        if (selector === ':scope > .header > .name') return { textContent: name };
        return null;
      },
      querySelectorAll: () => [],
      cloneNode() { const clone = node(name); clone.textContent = name; return clone; },
      addEventListener(_event, callback) { this.listeners.push(callback); },
      click() { if (!this.disabled) this.listeners.forEach(callback => callback()); },
      before(other) { tabs.splice(tabs.indexOf(this), 0, other); writes++; }
    };
  }
  const tabs = ['Equipment', 'Runes', 'Tomes'].map(node);
  let nativeCards = [];
  let stock;
  const cards = {
    dataset: {},
    querySelectorAll: () => nativeCards,
    querySelector(selector) {
      return selector === '#iw-consumables-stock' ? stock : nativeCards.find(card => card.classList.contains('iw-equipment-consumables'));
    },
    appendChild(child) { stock = child; writes++; }
  };
  function select(tab) {
    tabs.forEach(other => { other.disabled = other === tab; });
    nativeCards = (tab.textContent === 'Equipment' ? ['Combat', 'Accessories', 'Tools', 'Consumables'] : [tab.textContent]).map(node);
  }
  tabs.forEach(tab => tab.addEventListener('click', () => select(tab)));
  select(tabs[0]);
  const categories = { parentElement: cards, querySelectorAll: () => tabs, querySelector: () => tabs.find(tab => tab.id === 'iw-consumables-tab') };
  const h = harness({ location: { pathname: '/equipment' }, document: {
    querySelector: () => ({ querySelector: () => categories }), createElement: () => node()
  } });
  h.run('quickRuntime = () => null');
  return { h, tabs, get nativeCards() { return nativeCards; }, get writes() { return writes; }, get stock() { return stock; },
    sync() { h.context.syncEquipmentConsumables(); }, visible() { return nativeCards.filter(card => !card.classList.contains('iw-equipment-hidden')).map(card => card.textContent); } };
}

test('Equipment, Consumables, Runes and Tomes switch without replacing native controls or installing duplicates', () => {
  const f = equipmentFixture();
  f.sync();
  assert.deepEqual(f.tabs.map(tab => tab.id || tab.textContent), ['Equipment', 'iw-consumables-tab', 'Runes', 'Tomes']);
  assert.deepEqual(f.visible(), ['Combat', 'Accessories', 'Tools']);
  const nativeConsumables = f.nativeCards.at(-1);
  f.tabs[1].click();
  assert.deepEqual(f.visible(), ['Consumables']);
  assert.equal(f.nativeCards.at(-1), nativeConsumables);
  assert.equal(f.stock.hidden, false);
  assert.equal(f.tabs[0].disabled, false);
  const writes = f.writes;
  for (let i = 0; i < 10; i++) f.sync();
  assert.equal(f.writes, writes, 'unchanged observations do not rewrite the stock table');
  assert.equal(f.tabs.length, 4);
  for (const index of [2, 3, 0]) {
    f.tabs[index].click(); f.sync();
    assert.equal(f.stock.hidden, true);
    assert.deepEqual(f.visible(), index === 0 ? ['Combat', 'Accessories', 'Tools'] : [f.tabs[index].textContent]);
    f.tabs[1].click(); f.sync();
    assert.deepEqual(f.visible(), ['Consumables']);
  }
  f.h.context.location.pathname = '/inventory';
  const before = f.writes;
  f.sync();
  assert.equal(f.writes, before);
});

test('Status consumables open category overviews and Mastery Contracts use the existing mastery tracker', () => {
  const h = harness();
  for (const [key, category] of [['pie-king-crab.png', 'Food'], ['potion-basic-health.png', 'Potions'], ['sigil-divine-wisdom.png', 'Sigils']]) {
    const markup = h.context.renderStatusConsumable({ image: `/assets/items/${key}`, name: key, equipped: 12, stored: 34 }, {});
    assert.match(markup, new RegExp(`data-consumable-open="${category}"`));
    assert.match(markup, /<button[^>]*aria-haspopup="dialog"/);
  }
  const contract = h.context.renderStatusConsumable({ image: '/assets/items/contract-mastery.png', name: 'Mastery Contract', masteryContract: true, storedOnly: true }, {});
  assert.match(contract, /data-mastery-open/);
  assert.doesNotMatch(contract, /data-consumable-open/);
});

test('category overview includes stored-only alternatives and equipped-only food without mixing other supplies', () => {
  const h = harness();
  const runtime = { catalog: { ...catalog, '10': { id: '10', name: 'Cooked Salmon', image: 'items/cooked-salmon.png', type: 'consumable' } },
    state: { isSolo: false, user: { displayName: 'Player', equipment: { food: { id: '3', amount: 123 }, sigil: { id: '2', amount: 50 }, emptySlot: null },
      inventory: { '10': { amount: 456 }, '6': { amount: 20 } } } } };
  const rows = h.context.consumableOverviewRows('Food', runtime);
  assert.deepEqual(Array.from(rows, row => [row.name, row.equipped, row.stored]), [
    ['Cooked Salmon', '—', 456], ['King Crab Pie', '123', 0]
  ]);
  runtime.state.user.equipment.food.amount = 122;
  assert.equal(h.context.consumableOverviewRows('Food', runtime).find(row => row.name === 'King Crab Pie').equipped, '122');
});

test('category overview retains unknown inventory and closes with Escape back to its trigger', () => {
  const h = harness();
  let focused = 0, prevented = 0;
  h.context.renderGlobalDialog = h.context.render = () => {};
  h.run(`AppState.derived.consumableRows = [{ name: 'King Crab Pie', image: '/assets/items/pie-king-crab.png', equipped: 12 }];`);
  h.context.openConsumableOverview('Food', { focus() { focused++; } });
  assert.equal(h.run('AppState.ui.consumableOverview'), 'Food');
  const rows = h.context.consumableOverviewRows('Food', null);
  assert.equal(rows[0].stored, null);
  assert.equal(rows[0].equipped, '12');
  h.context.handlePreferencesKey({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(h.run('AppState.ui.consumableOverview'), null);
  assert.equal(focused, 1);
  assert.equal(prevented, 1);
});
