const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
class Element {
  constructor() { this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.className = ''; this.value = ''; this.classes = new Set(); this.classList = { add: v => this.classes.add(v), remove: v => this.classes.delete(v) }; }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map(c => c.textContent).join(''); }
  querySelector(selector) { return this.children.find(c => c.className.split(' ').includes(selector.slice(1))) || null; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
}
const material = available => [{ name: 'Wood', image: '/wood.png', available }];
test('material changes emit one event per observed change, expire, and ignore first/missing observations', () => {
  const h = harness();
  h.context.recordMaterialChanges(material(1000));
  assert.equal(h.run('AppState.ui.materialDeltaNotices.size'), 0);
  h.time(100250);
  h.context.recordMaterialChanges(material(998));
  let notice = h.run(`AppState.ui.materialDeltaNotices.get('/wood.png')`);
  assert.equal(notice.delta, -2);
  assert.equal(notice.started, 100250);
  h.time(100500);
  h.context.recordMaterialChanges(material(998));
  assert.equal(h.run('AppState.ui.events.size'), 1);
  assert.equal(h.run(`AppState.ui.materialDeltaNotices.get('/wood.png').started`), 100250);
  h.time(104250);
  h.context.recordMaterialChanges(material(998));
  assert.equal(h.run('AppState.ui.materialDeltaNotices.size'), 0);
  h.context.recordMaterialChanges([]);
  h.context.recordMaterialChanges(material(2000));
  assert.equal(h.run('AppState.ui.materialDeltaNotices.size'), 0);
});
test('material animations survive lightweight updates and resume elapsed time after full replacement', () => {
  const document = { querySelector() { return null; }, querySelectorAll() { return []; }, createElement: () => new Element() };
  const h = harness({ document });
  let quantity = new Element();
  h.context.panel = { querySelector: () => quantity };
  h.run('AppState.ui.page = panel');
  h.context.recordMaterialChanges(material(1000));
  h.time(100250);
  h.context.recordMaterialChanges(material(998));
  h.context.updateMaterialValues(material(998));
  const animation = quantity.querySelector('.iw-quantity-delta');
  assert.equal(animation.textContent, '-2');
  assert.equal(animation.style.animationDelay, '-0ms');
  h.time(100750);
  h.context.updateMaterialValues(material(998));
  assert.equal(quantity.querySelector('.iw-quantity-delta'), animation);
  quantity = new Element();
  h.context.updateMaterialValues(material(998));
  assert.equal(quantity.querySelector('.iw-quantity-delta').style.animationDelay, '-500ms');
  h.time(104250);
  h.context.recordMaterialChanges(material(998));
  h.context.updateMaterialValues(material(998));
  assert.equal(quantity.querySelector('.iw-quantity-delta'), null);
  assert.equal(quantity.querySelector('.iw-quantity-value').textContent, '998');
});
test('Status header shows the build version once and restores the native title when leaving', () => {
  const title = new Element(); title.textContent = 'Guild';
  const image = new Element(); image.setAttribute('src', '/guild.png');
  const header = { querySelector: selector => selector === '.title' ? title : image };
  const document = { querySelector: () => header, querySelectorAll: () => [], createElement: () => new Element() };
  const h = harness({ document });
  h.run('syncCacheRefreshButton=()=>{}');
  h.context.setStatusHeader(true);
  h.context.setStatusHeader(true);
  assert.equal(title.dataset.iwVersion, `v${require('../../package.json').version}`);
  title.textContent = 'Status'; // External scripts can update the native title independently.
  assert.equal(title.dataset.iwVersion, `v${require('../../package.json').version}`);
  h.context.setStatusHeader(false);
  assert.equal(title.textContent, 'Guild');
  assert.equal(image.getAttribute('src'), '/guild.png');
  assert.equal(title.classes.has('iw-status-heading'), false);
  assert.equal(title.dataset.iwVersion, undefined);
});


test('quantity notices keep their timeline through value updates and restart for a new event or item', () => {
  const document = { querySelector() { return null; }, querySelectorAll() { return []; }, createElement: () => new Element() };
  const h = harness({ document });
  const cell = new Element();
  const notice = { delta: 2, started: 100000, until: 104000 };
  h.context.updateQuantityValue(cell, 10, notice, 'loot');
  const first = cell.querySelector('.iw-quantity-delta');
  h.time(101000);
  h.context.updateQuantityValue(cell, 12, notice, 'loot');
  assert.equal(cell.querySelector('.iw-quantity-delta'), first);
  assert.equal(first.style.animationDelay, '-0ms');
  assert.equal(cell.querySelector('.iw-quantity-value').textContent, '12');
  h.context.updateQuantityValue(cell, 14, { ...notice, started: 101000, until: 105000 }, 'loot');
  const second = cell.querySelector('.iw-quantity-delta');
  assert.notEqual(second, first);
  h.context.updateQuantityValue(cell, 14, { ...notice, started: 101000, until: 105000 }, 'other-loot');
  assert.notEqual(cell.querySelector('.iw-quantity-delta'), second);
});
