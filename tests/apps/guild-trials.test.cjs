const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
function node(textContent = '', singles = {}, lists = {}, extra = {}) {
  return { textContent, querySelector: s => singles[s] || null, querySelectorAll: s => lists[s] || [], ...extra };
}
function row(name, { participant = false, time = '', button = false, disabled = false } = {}) {
  return node(name, { ':scope > .name': node(name), ':scope > .time': time ? node(time) : null }, {}, {
    tagName: button || participant ? 'BUTTON' : 'DIV', disabled,
    classList: { contains: name => participant && name === 'row-dark' }
  });
}
function fixture({ time = '23h', ownName = 'Player', total = 2, completed = 0, joinable = false, complete = false } = {}) {
  const card = (name, rows) => node('', { ':scope > .header > .name': node(name) }, { ':scope > .row': rows });
  const summary = card('Trials', [
    node('', { '.name': node('End Date'), '.date': node('1d4h2m13s') }),
    node('', { '.name': node('Trials Completed'), '.amount': node(`${completed} / ${total}`) })
  ]);
  const rows = [row('Exploring Trial', { button: joinable }), row('Another player', { participant: true, time: '3h' }),
    row('Defense Trial', { button: joinable }), row('PlayerTwo', { participant: true, time: '22h' }), row(ownName, { participant: true, time })];
  const root = node('', {}, { '.card': [summary, card('Incomplete Trials', complete ? [] : rows), card('Complete Trials', complete ? rows : [])] });
  return node('', { 'guild-page': root });
}
test('native participant groups identify the exact character and its trial, not another player or the overall deadline', () => {
  const h = harness();
  const value = h.context.readGuildTrials(fixture(), 'Player');
  assert.equal(value.activeName, 'Defense Trial');
  assert.equal(value.remaining, '23h');
  assert.equal(value.endText, '1d4h2m13s');
  assert.equal(value.available, 0);
  assert.equal(h.context.readGuildTrials(fixture(), 'Play').activeName, '');
  assert.equal(h.context.readGuildTrials(fixture(), '').identityKnown, false);
});
test('native joinable trial heading buttons count once, without inspecting participant minus icons', () => {
  const h = harness();
  assert.equal(h.context.readGuildTrials(fixture({ joinable: true, time: '' }), 'Player').available, 2);
  assert.equal(h.context.readGuildTrials(fixture({ time: '' }), 'Player').activeName, '');
});
test('capture stores participation expiry separately, preserves rounded deadlines, and invalidates old schema', () => {
  const h = harness();
  h.storage.set('iw-stats-player-name-v2', 'Player');
  h.run(`CacheStore.set('guildTrial', { schema: 3, state: 'Unavailable' })`);
  assert.equal(h.run(`CacheStore.isFresh('guildTrial')`), false);
  h.context.collectGuildTrial(fixture());
  let entry = h.run(`CacheStore.get('guildTrial')`);
  assert.equal(entry.state, 'Active');
  assert.equal(entry.activeName, 'Defense Trial');
  assert.equal(entry.stateEndsAt, 100000 + 23 * 3600000);
  assert.equal(entry.periodEndsAt, 100000 + (28 * 3600 + 2 * 60 + 13) * 1000);
  assert.equal(entry.refreshAt, 100000 + 3600000);
  assert.equal(entry.approximateTimer, true);
  assert.match(h.context.guildTrialDetail(entry), /Defense Trial · About 23h remaining/);
  h.time(101000);
  h.context.collectGuildTrial(fixture());
  assert.equal(h.run(`CacheStore.get('guildTrial').stateEndsAt`), entry.stateEndsAt);
  h.time(entry.stateEndsAt);
  assert.equal(h.context.guildTrialState(entry), 'ParticipationComplete');
  assert.match(h.context.guildTrialDetail(entry), /Participation complete/);
});
test('partially mounted lists preserve cached participation, and completed trials can still have an active participant', () => {
  const h = harness();
  h.storage.set('iw-stats-player-name-v2', 'Player');
  h.context.collectGuildTrial(fixture());
  assert.equal(h.context.collectGuildTrial(fixture({ total: 16 })), null);
  assert.equal(h.run(`CacheStore.get('guildTrial').activeName`), 'Defense Trial');
  assert.equal(h.context.readGuildTrials(fixture({ complete: true, completed: 2 }), 'Player').activeName, 'Defense Trial');
});
test('all trial states render accessible icons instead of available/unavailable text', () => {
  const h = harness();
  for (const state of ['Active', 'Available', 'Unavailable', 'Completed', 'ParticipationComplete', 'Expired', 'Unknown']) {
    const html = h.context.guildTrialStatusIcon({ schema: 5, state, activeName: 'Defense Trial', stateEndsAt: 999999 });
    assert.match(html, /<svg/);
    assert.match(html, /aria-label=/);
    assert.doesNotMatch(html, /<em/);
    assert.equal(html.includes('class="iw-hourglass"'), state === 'Active');
    assert.equal(html.includes('class="iw-task-icon done"'), ['Available', 'Completed', 'ParticipationComplete'].includes(state));
    assert.equal(html.includes('M5 12.5l4 4L19 6.5'), ['Available', 'Completed', 'ParticipationComplete'].includes(state));
  }
});

test('trial bonus requires active participation in exactly the current skill', () => {
  const h = harness();
  const entry = { schema: 5, state: 'Active', activeName: 'Defense Trial', stateEndsAt: 200000 };
  assert.equal(h.context.guildTrialBonusActive(entry, 'Defense'), true);
  assert.equal(h.context.guildTrialBonusActive(entry, ' defense '), true);
  for (const skill of ['Woodcutting', 'One-handed', 'Defense Training', '', undefined]) {
    assert.equal(h.context.guildTrialBonusActive(entry, skill), false, skill);
  }
  assert.equal(h.context.guildTrialBonusActive({ ...entry, activeName: 'One-handed Trial' }, 'One-handed'), true);
  assert.equal(h.context.guildTrialBonusActive({ ...entry, activeName: '' }, 'Defense'), false);
  for (const state of ['Available', 'Completed', 'Unavailable', 'Unknown']) {
    assert.equal(h.context.guildTrialBonusActive({ ...entry, state }, 'Defense'), false);
  }
  assert.equal(h.context.guildTrialBonusActive(entry, 'Defense', 200000), false);
  assert.equal(h.context.guildTrialBonusActive(null, 'Defense'), false);
});
test('Current Action badge follows skill switches and expiry while the Status row retains trial participation', () => {
  const h = harness();
  h.run(`
    CacheStore.set('guildTrial', { schema: 5, state: 'Active', activeName: 'Defense Trial', stateEndsAt: 200000 });
    globalThis.action = { name: 'Treant', skillName: 'Defense', isCombat: true, combatants: [] };
    readCurrentAction = () => action;
    AppState.ui.page = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } };
    StatusRenderer.render(AppState);
  `);
  let html = h.run('AppState.ui.page.innerHTML');
  assert.match(html, /class="iw-guild-trial-badge"/);
  assert.match(html, /Defense Trial bonus active \(\+10% XP\)/);
  h.run(`action = { name: 'Tree', skillName: 'Woodcutting', isCombat: false, combatants: [] }; StatusRenderer.render(AppState)`);
  html = h.run('AppState.ui.page.innerHTML');
  assert.doesNotMatch(html, /class="iw-guild-trial-badge"/);
  assert.match(html, /Defense Trial · .*remaining/);
  assert.match(html, /data-guild-trial-state="Active"/);
  h.run(`action.skillName = 'Defense'; StatusRenderer.render(AppState)`);
  assert.match(h.run('AppState.ui.page.innerHTML'), /class="iw-guild-trial-badge"/);
  h.time(200000);
  h.run('StatusRenderer.render(AppState)');
  html = h.run('AppState.ui.page.innerHTML');
  assert.doesNotMatch(html, /class="iw-guild-trial-badge"/);
  assert.match(html, /data-guild-trial-state="ParticipationComplete"/);
  assert.doesNotMatch(html, /Status could not render/);
});

test('finished personal participation gets a completed check even when guild trials remain incomplete', () => {
  const h = harness();
  h.storage.set('iw-stats-player-name-v2', 'Player');
  const entry = h.context.collectGuildTrial(fixture({ time: '', completed: 0 }));
  assert.equal(entry.state, 'ParticipationComplete');
  assert.match(h.context.guildTrialDetail(entry), /^Participation complete · resets in/);
  assert.match(h.context.guildTrialStatusIcon(entry), /iw-task-icon done/);
  assert.equal(h.context.guildTrialBonusActive(entry, 'Defense'), false);
  assert.equal(h.context.guildTrialState(entry, entry.periodEndsAt), 'Unknown');
  assert.equal(h.context.collectGuildTrial(fixture({ ownName: 'Someone else', time: '' })).state, 'Unavailable');
});
