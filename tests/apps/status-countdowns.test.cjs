const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('guild participation and event countdowns use independent deadlines and durations', () => {
  const h = harness();
  const cache = { guildEvent: { schema: 9, state: 'Participating', stateEndsAt: 200000,
    eventEndsAt: 400000, participationDurationMs: 200000, eventDurationMs: 600000 } };
  let timers = h.context.statusCountdowns('guildEvent', cache, 100000);
  assert.deepEqual(Array.from(timers, t => [t.label, t.percent]), [['Participation', 50], ['Event ends', 50]]);
  timers = h.context.statusCountdowns('guildEvent', cache, 200000);
  assert.deepEqual(Array.from(timers, t => t.label), ['Event ends']);
  assert.equal(h.context.statusCountdowns('guildEvent', cache, 400000).length, 0);
});

test('cooldowns use activity deadlines rather than cache refresh expiry', () => {
  const h = harness();
  const timers = h.context.statusCountdowns('guildEvent', { guildEvent: {
    schema: 9, state: 'Cooldown', stateEndsAt: 300000, expiresAt: 110000
  } }, 100000);
  assert.equal(timers[0].remaining, 200000);
  assert.equal(timers[0].percent, null);
});

test('trial participation ends independently of the reset and approximate timing stays labelled', () => {
  const h = harness();
  const cache = { guildTrial: { schema: 5, state: 'Active', activeName: 'Mining Trial',
    stateEndsAt: 200000, periodEndsAt: 400000, participationDurationMs: 200000, approximateTimer: true } };
  assert.equal(h.context.statusCountdowns('guildTrial', cache, 100000).length, 2);
  const markup = h.context.renderStatusCountdowns('guildTrial', cache, 100000);
  assert.match(markup, /≈ 2m remaining/);
  assert.match(markup, /aria-valuenow="50"/);
  assert.match(markup, /Trials reset/);
  assert.deepEqual(Array.from(h.context.statusCountdowns('guildTrial', cache, 200000), t => t.label), ['Trials reset']);
  assert.equal(h.context.statusCountdowns('guildTrial', cache, 400000).length, 0);
});

test('unknown total duration keeps a countdown without inventing a percentage; missing deadlines add no bars', () => {
  const h = harness();
  const cache = { guildEvent: { schema: 9, state: 'Completed', eventEndsAt: 120000 } };
  const markup = h.context.renderStatusCountdowns('guildEvent', cache, 100000);
  assert.match(markup, /&lt;1m remaining/);
  assert.match(markup, /data-duration-known="false"/);
  assert.doesNotMatch(markup, /aria-valuenow=/);
  assert.equal(h.context.renderStatusCountdowns('guildEvent', {}, 100000), '');
  assert.equal(h.context.renderStatusCountdowns('guildTrial', { guildTrial: { schema: 5, state: 'Available' } }, 100000), '');
  assert.equal(h.context.renderStatusCountdowns('adventure', { adventure: { schema: 11, state: 'Active', stateEndsAt: 200000 } }, 100000), '');
  assert.equal(h.context.renderStatusCountdowns('taming', { taming: { schema: 2, hatcheryEggsReadyAt: 200000 } }, 100000), '');
});

test('live countdowns shrink and disappear at their deadline without remounting the status row', () => {
  const h = harness();
  const slot = { innerHTML: '' };
  h.run('AppState.ui.page = {}');
  h.run('AppState.ui.page').querySelector = selector => selector === '[data-status-timers="guildEvent"]' ? slot : null;
  const cache = { guildEvent: { schema: 9, state: 'Completed', eventEndsAt: 300000, eventDurationMs: 200000 } };
  h.context.updateStatusCountdowns(cache, 100000);
  assert.match(slot.innerHTML, /width:100%/);
  h.context.updateStatusCountdowns(cache, 200000);
  assert.match(slot.innerHTML, /width:50%/);
  h.context.updateStatusCountdowns(cache, 300000);
  assert.equal(slot.innerHTML, '');
});

test('selected trait names remain visible for training, empty slots, and completed milestones', () => {
  const h = harness();
  const model = { available: true, recommendations: [], sets: [], target: { level: 100, reached: 1, traitIds: [1, 2] },
    rows: [{ trait: { name: 'Smelting Multi Craft', image: '/assets/misc/smelting.png', level: 94 }, percent: 82 },
      { trait: null, percent: null }] };
  h.run('AppState.ui.traits').model = model;
  const markup = h.context.renderTraitsSummaryContent();
  assert.match(markup, /<span>Smelting Multi Craft<\/span>/);
  assert.match(markup, /Empty training slot/);
  assert.doesNotMatch(markup, /iw-traits-mini-bars" aria-hidden/);
  model.target = null;
  assert.match(h.context.renderTraitsSummaryContent(), /Smelting Multi Craft/);
  assert.match(h.context.renderTraitsSummaryContent(), /Lv. 94/);
});
