const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('automation projections use fixed intervals, cap queues and do not mutate snapshots or perform lookups', () => {
  const h = harness();
  h.time(110000);
  h.run(`globalThis.item = { intervalMs: 2000, checkedAt: 100000, queuedDone: 3, queuedTotal: 6, lootAmount: 4, outputPerAction: 2 };`);
  const value = h.run('projectedAutomation(item, 1)');
  assert.equal(value.queuedDone, 6);
  assert.equal(value.lootAmount, 10);
  assert.equal(h.run('item.queuedDone'), 3);
  assert.equal(h.storage.size, 0);
  h.time(99000);
  assert.equal(h.run('projectedAutomation(item).queuedDone'), 3);
});
test('revive parser supports seconds, minutes and clock formats', () => {
  const h = harness();
  for (const [text, expected] of [['Revive in 12 seconds', 12000], ['Reviving 2 minutes', 120000], ['Respawn in 1:05', 65000], ['2:30 Revive', 150000], ['Reviving', 0]]) {
    assert.equal(h.context.parseReviveRemaining(text), expected, text);
  }
});
test('location selection handles idle, village, combat, dungeon and elite badge ordering', () => {
  const h = harness();
  const select = h.context.selectLocationBadges;
  assert.equal(select(null, [], false).dungeonCombat, false);
  assert.equal(select({ location: 'Village' }, [], false).locationClass, 'village');
  assert.equal(select({ isCombat: true, name: 'Rat' }, [], false).locationClass, 'outskirts');
  assert.equal(select({ isCombat: true, name: 'Dungeon Rat' }, [], false).dungeonCombat, true);
  const elite = select({ isCombat: true, name: 'Treant' }, [{ name: 'Elite Key', image: '/key.png' }], true);
  assert.equal(elite.displayActionName, 'Elite Treant');
  assert.ok(elite.locationBadges.indexOf('/key.png') < elite.locationBadges.indexOf('/assets/misc/combat.png'));
});
function fighter(hp, side = 'monster') { return { side, name: 'Treant', image: '/treant.png', hp, maxHp: 100, hpPercent: hp }; }
test('combat transitions handle hit, heal, death, same-sprite respawn and player recovery without repeated events', () => {
  const h = harness();
  const transition = (current, previous) => h.context.transitionCombatants([current], [previous])[0];
  let prior = fighter(100);
  let next = transition(fighter(70), prior);
  assert.equal(next.hit, true); assert.equal(next.lostPercent, 100);
  assert.equal(transition(fighter(70), next).hit, false);
  h.time(101000);
  next = transition(fighter(90), next);
  assert.equal(next.healAmount, 20);
  const count = h.run('AppState.ui.events.size');
  h.time(101250);
  const same = transition(fighter(90), next);
  assert.equal(same.healAmount, 20);
  assert.equal(h.run('AppState.ui.events.size'), count);
  assert.equal(same.effectStarted.heal, 101000);
  assert.match(h.context.combatEffectDelays(same, 102000), /--iw-heal-delay:-1000ms/);
  h.time(106000);
  next = transition(fighter(0), same);
  assert.equal(next.dead, true);
  const deathCount = h.run('AppState.ui.events.size');
  h.time(106250);
  transition(fighter(0), next);
  assert.equal(h.run('AppState.ui.events.size'), deathCount);
  h.time(106500);
  next = transition(fighter(100), next);
  assert.equal(next.spawn, true);
  h.time(112000);
  assert.equal(transition(fighter(100), next).spawn, false);
  h.time(114000);
  const revived = transition(fighter(100, 'player'), fighter(0, 'player'));
  assert.equal(revived.spawn, false);
  assert.equal(revived.healAmount, 100);
});
test('native control adapter gates mutations and rejects unknown commands', async () => {
  const h = harness();
  h.run(`globalThis.claims = 0; collectAllAutomationLoot = () => { claims++; };`);
  h.run(`NativeControlAdapter.run(document, { type: 'automations' })`);
  assert.equal(h.run('claims'), 0);
  h.storage.set('iw-stats-automation-enabled', 'true');
  h.run(`NativeControlAdapter.run(document, { type: 'automations' })`);
  assert.equal(h.run('claims'), 1);
  assert.throws(() => h.run(`NativeControlAdapter.run(document, { type: 'unknown' })`), /Unknown native command/);
});

test('automation remaining time follows projected queue progress and partial cycles', () => {
  const h = harness();
  h.context.item = { checkedAt: 100000, queuedDone: 2, queuedTotal: 12, intervalMs: 60000 };
  h.time(250000);
  assert.equal(h.run('projectedAutomation(item).queuedDone'), 4);
  assert.equal(h.run('automationRemainingTime(projectedAutomation(item))'), '~0d 1h');
  h.time(700000);
  assert.equal(h.run('automationRemainingTime(projectedAutomation(item))'), 'Complete');
});

test('automation queue time does not invent estimates for unknown speed or idle structures', () => {
  const h = harness();
  assert.equal(h.run('automationRemainingTime({queuedDone: 1, queuedTotal: 10})'), '—');
  assert.equal(h.run('automationRemainingTime({queuedDone: 0, queuedTotal: 0})'), '—');
});

test('automation time displays days and remaining hours', () => {
  const h = harness();
  assert.equal(h.run('automationRemainingTime({queuedDone:0,queuedTotal:50,intervalMs:3600000})'), '~2d 2h');
});

test('automation queue bars show completed proportion and stay bounded for empty or completed queues', () => {
  const h = harness();
  assert.equal(h.context.automationQueuePercent({queuedDone:25,queuedTotal:100}),25);
  assert.equal(h.context.automationQueuePercent({queuedDone:110,queuedTotal:100}),100);
  assert.equal(h.context.automationQueuePercent({queuedDone:0,queuedTotal:0}),0);
});
