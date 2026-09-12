const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('automation alerts default to 24 hours amber and 1 hour red, independently of crafting warnings', () => {
  const h = harness();
  const item = { queuedTotal: 25, queuedDone: 0, intervalMs: 3600000, checkedAt: 100000 };
  const state = () => h.context.automationQueueWarning(h.context.projectedAutomation(item), item.checkedAt);
  assert.equal(state(), '');
  h.time(100000 + 3600000 + 1);
  assert.equal(state(), 'warning');
  h.time(100000 + 24 * 3600000 + 1);
  assert.equal(state(), 'urgent');
  h.time(100000 + 25 * 3600000);
  assert.equal(state(), 'urgent');
  assert.equal(h.context.getWarningPrefs().queueUrgentMinutes, 10);
});

test('idle and unknown queues do not alert; custom thresholds persist and zero disables alerts', () => {
  const h = harness();
  assert.equal(h.context.automationQueueWarning({ queuedTotal: 0 }), '');
  assert.equal(h.context.automationQueueWarning({ queuedTotal: 10 }), '');
  h.context.setWarningPrefs({ automationHours: 48, automationUrgentHours: 2 });
  assert.equal(h.context.automationQueueWarning({ queuedTotal: 30, intervalMs: 3600000 }), 'warning');
  assert.equal(h.context.getWarningPrefs().automationUrgentHours, 2);
  h.context.setWarningPrefs({ automationHours: 0 });
  assert.equal(h.context.getWarningPrefs().automationUrgentHours, 0);
  assert.equal(h.context.automationQueueWarning({ queuedTotal: 1, queuedDone: 1 }), '');
});

test('automation bar includes warning state and an accessible refill explanation', () => {
  const h = harness();
  const item = { structure: 'Smelter', image: '', making: 'Bar', queuedTotal: 1, queuedDone: 0, intervalMs: 60000 };
  const html = h.context.renderAutomationsPanel([item], { automations: {} }, false);
  assert.match(html, /data-warning="urgent"/);
  assert.match(html, /aria-valuetext="[^"]*Queue needs refilling/);
});
