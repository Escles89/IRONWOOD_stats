const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('non-combat action progress fills the item vertically and XP uses compact native totals', () => {
  const h = harness();
  const action = { image: '/pie.png', progress: 42, skillName: 'Cooking', skillProgress: 75, skillXp: 3070012, skillXpRequired: 4085370, xpPerHour: 69900 };
  const icon = h.context.renderCurrentActionImage(action);
  assert.match(icon, /aria-valuenow="42"/);
  assert.match(icon, /data-live-progress style="height:42%"/);
  assert.match(icon, /<img src="\/pie.png"/);
  const xp = h.context.renderCurrentActionXp(action);
  assert.match(xp, /3\.1M \/ 4\.1M XP/);
  assert.match(xp, /69\.9K XP\/h/);
  assert.match(xp, /3,070,012 \/ 4,085,370 XP/);
  assert.match(xp, /width:75%/);
});

test('missing XP totals retain percentage without inventing totals or rates', () => {
  const h = harness();
  assert.match(h.context.renderCurrentActionXp({ skillProgress: 75 }), />75% XP</);
  const unknown = h.context.renderCurrentActionXp({});
  assert.match(unknown, /XP unavailable/);
  assert.doesNotMatch(unknown, /aria-valuenow=/);
  assert.match(h.context.renderCurrentActionXp({ skillXp: 0, skillXpRequired: 100, skillProgress: 0, xpPerHour: 0 }), /0 \/ 100 XP/);
});

test('combat keeps its plain action icon and has no new XP bar', () => {
  const h = harness();
  const action = { isCombat: true, progress: 42, image: '/enemy.png' };
  assert.equal(h.context.renderCurrentActionImage(action), '<div class="iw-action-image"><img src="/enemy.png" alt=""></div>');
  assert.equal(h.context.renderCurrentActionXp(action), '');
});

test('live action resets and level changes update vertical progress, XP text and accessible values', () => {
  const h = harness();
  const node = () => ({ style: {}, textContent: '', attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; } });
  const icon = node(), fill = node(), xp = node(), skillFill = node(), total = node(), rate = node();
  fill.parentElement = icon;
  const nodes = { '[data-live-progress]': fill, '[data-live-xp-bar]': xp, '[data-live-skill-progress]': skillFill, '[data-live-xp-total]': total, '[data-live-xp-hour]': rate };
  h.context.page = { querySelector: selector => nodes[selector] || null, querySelectorAll: () => [] };
  h.run('AppState.ui.page = page');
  for (const progress of [99, 0, 0, 20]) {
    h.context.updateLiveValues({ progress, skillProgress: 1, skillXp: 10000, skillXpRequired: 1000000, xpPerHour: 50000 }, [], [], [], {});
    assert.equal(fill.style.height, `${progress}%`);
    assert.equal(icon.attributes['aria-valuenow'], String(progress));
    assert.equal(fill.style.transition, progress === 20 ? '' : 'none');
  }
  assert.equal(fill.style.width, undefined);
  assert.equal(skillFill.style.width, '1%');
  assert.equal(total.textContent, '10K / 1M XP');
  assert.equal(rate.textContent, '50K XP/h');
  assert.equal(xp.attributes['aria-valuenow'], '1');
  h.context.updateLiveValues({}, [], [], [], {});
  assert.equal(total.textContent, 'XP unavailable');
  assert.equal(xp.attributes['aria-valuenow'], undefined);
  assert.equal(icon.attributes['aria-valuenow'], undefined);
});
