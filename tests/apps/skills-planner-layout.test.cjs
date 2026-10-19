const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup(reason = '') {
  const h = harness();
  h.context.plannedObserve = () => ({ owner: 'player', plan: { kind: 'recipe', target: { quantity: 20 } } });
  h.context.quickRuntime = () => ({ action: { actionLoot: {} } });
  h.context.quickBusy = () => false;
  h.context.recipeRunnerInfo = () => ({ enabled: false, status: 'paused', reason: 'Paused by you.' });
  h.context.recipeStartReason = () => reason;
  h.context.recipeStepToken = () => 'fixture-token';
  h.context.renderShoppingIcon = () => '<span class="iw-shopping-icon"></span>';
  const next = { id: 'sword', name: 'Copper Sword', key: 'next', owned: 2, required: 20, missing: 18, ready: true, amount: 18, target: { skillName: 'Smithing', name: 'Copper Sword', finite: true } };
  h.context.recipeObservation = () => ({ name: 'Copper Sword', shortfall: 18, next, steps: [next, { id: 'ore', name: 'Copper Ore', key: 'manual', owned: null, required: 36, missing: null, reason: 'Check inventory' }] });
  return h;
}

test('compact planner keeps a guarded Start next and moves full controls out of the summary', () => {
  for (const reason of ['', 'Current action must finish first.']) {
    const h = setup(reason);
    const html = h.context.renderRecipeSummary(false, true);
    assert.match(html, /Planner · Paused/);
    assert.match(html, /Next · Smithing · Copper Sword/);
    assert.match(html, /data-recipe-start="fixture-token"/);
    assert.equal(/aria-label="Start next" disabled/.test(html), !!reason);
    assert.doesNotMatch(html, /data-recipe-run-toggle|data-recipe-refresh|data-planned-clear/);
    assert.match(html, /data-recipe-open/);
  }
});

test('separate planner details include all requirements, unknown balances and existing plan controls', () => {
  const html = setup().context.renderSkillsPlannerPanel();
  assert.match(html, /aria-label="Planner details"/);
  assert.match(html, /Target 20/);
  assert.match(html, /18 still to acquire · 2 remaining requirements/);
  assert.match(html, /Copper Sword/);
  assert.match(html, /Copper Ore/);
  assert.match(html, /2 \/ 20 owned/);
  assert.match(html, /Unknown \/ 36 owned/);
  assert.match(html, /Unknown missing/);
  assert.match(html, /data-recipe-run-toggle/);
  assert.match(html, /data-recipe-refresh/);
  assert.match(html, /data-planned-clear/);
});

test('empty planner keeps a compact entry point and an explicit empty details panel', () => {
  const h = harness();
  const compact = h.context.renderRecipeSummary(false, true);
  assert.match(compact, /No active plan/);
  assert.doesNotMatch(compact, /data-planned-start|data-recipe-start/);
  assert.match(h.context.renderSkillsPlannerPanel(), /No active plan\. Open the planner/);
});
