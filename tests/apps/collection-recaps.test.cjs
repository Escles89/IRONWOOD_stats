const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(value = { user: {}, loot: { wood: { amount: 12 } } }) {
  const h = harness();
  let subscriptions = 0;
  class Observable {
    constructor(subscribe) { this.run = subscribe; }
    subscribe(subscriber) { return this.run(subscriber); }
  }
  class Notifications {
    constructor() { this.NotificationEnum = { Item: 2, Coin: 3, Error: 5, Exp: 7, Level: 1 }; this.received = []; }
    createNotifications(messages) { this.received.push(...messages); }
  }
  const original = async () => new Observable(subscriber => { subscriptions++; subscriber.next(value); subscriber.complete(); return { unsubscribe() {} }; });
  const runtime = { firebase: { lootPetExpedition: original }, catalog: { wood: { name: 'Wood', image: 'items/wood.png' } }, notificationComponent: Notifications };
  h.context.findNativeSyncRuntime = () => runtime;
  return { h, runtime, original, notifications: new Notifications(), subscriptions: () => subscriptions };
}

test('collection observes one native subscription, suppresses duplicate rewards and preserves errors and level-ups', async () => {
  const { h, runtime, original, notifications, subscriptions } = setup();
  const receipt = h.context.observeCollectionRewards({}, ['lootPetExpedition']);
  const response = await runtime.firebase.lootPetExpedition();
  const forwarded = [];
  response.subscribe({ next: value => forwarded.push(value), complete() {}, error: assert.fail });
  notifications.createNotifications([{ type: 2, itemId: 'wood', amount: 12 }, { type: 3, amount: 50 }, { type: 5, message: 'Error' }, { type: 1, skillId: 'taming', amount: 1 }]);
  assert.equal(subscriptions(), 1);
  assert.equal(forwarded.length, 1);
  assert.equal(receipt.confirmed(), true);
  assert.deepEqual(Array.from(receipt.rewards(), reward => [reward.name, reward.amount]), [['Wood', 12], ['Coins', 50]]);
  assert.deepEqual(notifications.received.map(message => message.type), [5, 1]);
  receipt.restore(); receipt.restore();
  assert.equal(runtime.firebase.lootPetExpedition, original);
  notifications.createNotifications([{ type: 2, itemId: 'wood', amount: 3 }]);
  assert.equal(notifications.received.length, 3);
});

test('rejected collections do not confirm or invent rewards', async () => {
  const { h, runtime } = setup({ error: { message: 'Not ready' } });
  const receipt = h.context.observeCollectionRewards({}, ['lootPetExpedition']);
  const response = await runtime.firebase.lootPetExpedition();
  response.subscribe({ next() {}, complete() {}, error: assert.fail });
  assert.equal(receipt.confirmed(), false);
  assert.equal(receipt.rewards().length, 0);
  receipt.restore();
});

test('automation receipt preserves all native loot on confirmation even when the UI does not update', async () => {
  const { h, runtime, original } = setup({ inventory: {} });
  runtime.firebase.lootAutomation = original;
  runtime.automations = { automations: { mill: { loot: { wood: { amount: 1234 } } } } };
  const receipt = h.context.observeCollectionRewards({}, ['lootAutomation']);
  const response = await runtime.firebase.lootAutomation('mill');
  response.subscribe({ next() {}, complete() {}, error: assert.fail });
  assert.equal(receipt.confirmed(), true);
  assert.equal(receipt.rewards()[0].amount, 1234);
  receipt.restore();
});

test('partial recap combines matching rewards and keeps the failure visible', () => {
  const h = harness(); let recap;
  h.context.showActionToast = value => { recap = value; };
  h.context.showCollectionRecap('Collection stopped', [{ name: 'Wood', amount: 12 }, { name: 'Wood', amount: 8 }], 'Second claim failed');
  assert.equal(recap.kind, 'warning');
  assert.equal(recap.metrics.length, 1);
  assert.equal(recap.metrics[0].value, '20');
  assert.equal(recap.detail, 'Second claim failed');
});
