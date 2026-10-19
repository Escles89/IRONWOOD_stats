const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('crafting queue progress counts actions independently of bonus loot and owned stock', () => {
  const h = harness();
  const html = h.context.renderCurrentActionQueue({ completed: 20, total: 100, time: '2h' }, {
    compactCraftingLoot: true, loot: [{ amount: 47 }], totalItems: 47, craftedInventory: { amount: 300 }
  });
  assert.match(html, /aria-valuenow="20"/);
  assert.match(html, /20 \/ 100 actions completed/);
  assert.match(html, /2h left/);
  assert.match(html, /Loot waiting <b data-live-queue-loot>47<\/b>/);
  assert.match(html, /Owned <b>300<\/b>/);
  assert.match(html, /data-quick-controls-slot/);
  assert.doesNotMatch(html, /<img|<svg/);
});

test('finite queues render zero and complete progress without requiring crafting loot', () => {
  const h = harness();
  for (const completed of [0, 100]) {
    const html = h.context.renderCurrentActionQueue({ completed, total: 100, time: '1m' });
    assert.match(html, new RegExp(`aria-valuenow="${completed}"`));
    assert.doesNotMatch(html, /Loot waiting|data-quick-controls-slot/);
  }
  assert.equal(h.context.renderCurrentActionQueue(null), '');
});

test('unavailable progress and inventory do not imply known zero balances', () => {
  const h = harness();
  const html = h.context.renderCurrentActionQueue({ time: '2h' }, { compactCraftingLoot: true });
  assert.doesNotMatch(html, /aria-valuenow=/);
  assert.match(html, /Owned <b>Unknown<\/b>/);
  assert.match(html, /— \/ — actions completed/);
  const zero = h.context.renderCurrentActionQueue({ completed: 0, total: 10, time: '1m' }, {
    compactCraftingLoot: true, craftedInventory: { amount: 0 }
  });
  assert.match(zero, /Owned <b>0<\/b>/);
});
