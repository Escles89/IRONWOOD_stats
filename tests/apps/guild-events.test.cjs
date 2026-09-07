const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('Guild event dashboard retains icons when switching between cooldown, available and participating', () => {
  const h = harness();
  h.run(`AppState.ui.page = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } }`);
  for (const [state, className] of [['Cooldown', 'waiting'], ['Available', 'event-available'], ['Participating', 'participating'], ['Completed', 'done']]) {
    h.context.entry = { schema: 9, state, eventName: 'Combat', stateEndsAt: 200000, expiresAt: 200000 };
    h.run(`CacheStore.set('guildEvent', entry); StatusRenderer.render(AppState)`);
    const html = h.run('AppState.ui.page.innerHTML');
    assert.match(html, new RegExp(`class="iw-task-icon ${className}" data-guild-event-state="${state}"`));
    assert.doesNotMatch(html, /<em[^>]*>Available<\/em>|Status could not render/);
    if (state === 'Available') assert.match(html, /Guild event ready to start/);
  }
});

test('only participating events animate; missing and unrecognized states use an accessible unknown icon', () => {
  const h = harness();
  for (const state of ['Available', 'Participating', 'Completed', 'Cooldown', 'Unavailable', 'Unknown', 'Unexpected']) {
    const html = h.context.guildEventStatusIcon({ schema: 9, state });
    assert.match(html, /<svg/);
    assert.match(html, /aria-label=/);
    assert.doesNotMatch(html, /<em/);
    assert.equal(html.includes('class="iw-hourglass"'), state === 'Participating');
  }
  assert.match(h.context.guildEventStatusIcon(null), /data-guild-event-state="Unknown"/);
});

function element(text = '', singles = {}, lists = {}, extra = {}) {
  return { textContent: text, querySelector: selector => singles[selector] || null,
    querySelectorAll: selector => lists[selector] || [], ...extra };
}
function eventFixture({ loaded = true, own = true, join = false, menuTime = '23h', player = 'Player', cooldown = false, ownTime = '23h', ownXp = '0 XP', eventTime = '1d 18h' } = {}) {
  const row = (name, amount, time) => element(`${name} ${amount || ''} ${time || ''}`, {
    ':scope > .name': element(name), '.name': element(name),
    ':scope > .amount': amount === undefined ? null : element(amount),
    ':scope > .time': time == null ? null : element(time)
  });
  const eventRow = element(`Combat Event ${eventTime}`, { ':scope > .name': element('Combat Event'), ':scope > .date': element(eventTime) });
  const xpRow = element('Guild Event XP 157,516 / 420,000 XP', { ':scope > .name': element('Guild Event XP'), '.name': element('Guild Event XP'), '.date, .time, .amount': element('157,516 / 420,000 XP') });
  const participants = loaded ? [row('OtherPlayer', '67,413 XP', '19h'), ...(own ? [row(player, ownXp, ownTime)] : [])] : [];
  const cards = [element('', { ':scope > .header > .name': element('Event') }, { ':scope > .row': loaded ? [eventRow, xpRow] : [] }),
    element('', { ':scope > .header > .name': element('Participants') }, { 'button.row, .row': participants, button: join ? [element('Participate', {}, {}, { disabled: false })] : [] })];
  const cooldownRow = element('Event Cooldown 2h', { '.name': element('Event Cooldown'), '.date, .time, .amount': element('2h') });
  const root = element('', {}, { '.card': cards, '.row': cooldown ? [cooldownRow] : [], 'button.row': [row('Events', undefined, menuTime)] });
  return element('', { 'guild-page': root });
}

test('partial event mounts never overwrite participation or create an Available snapshot', () => {
  const h = harness();
  h.run(`localStorage.setItem(PLAYER_NAME_KEY, 'Player'); CacheStore.set('guildEvent', { schema: 9, state: 'Participating', eventName: 'Combat Event' })`);
  const previous = h.run("CacheStore.get('guildEvent')");
  assert.equal(h.context.collectGuildEvent(eventFixture({ loaded: false })), false);
  assert.equal(h.context.collectGuildEvent(eventFixture({ own: false })), false);
  assert.equal(h.run("CacheStore.get('guildEvent')"), previous);
  assert.equal(h.context.collectGuildEvent(eventFixture()), true);
  const entry = h.run("CacheStore.get('guildEvent')");
  assert.equal(entry.state, 'Participating');
  assert.equal(entry.eventName, 'Combat Event');
  assert.equal(entry.personalXp, 0);
  assert.equal(entry.stateEndsAt, 100000 + 23 * 3600000);
  assert.equal(entry.eventXp, 157516);
  assert.equal(h.context.guildEventIncludesSkill(entry.eventName, 'Defense'), true);
});

test('Available requires a loaded event, known player and explicit join control without a participation timer', () => {
  const h = harness();
  assert.equal(h.context.collectGuildEvent(eventFixture({ own: false, join: true, menuTime: '' })), false);
  h.run(`localStorage.setItem(PLAYER_NAME_KEY, 'Player')`);
  assert.equal(h.context.collectGuildEvent(eventFixture({ own: false, join: false, menuTime: '' })), false);
  assert.equal(h.context.collectGuildEvent(eventFixture({ own: false, join: true })), false);
  assert.equal(h.context.collectGuildEvent(eventFixture({ own: false, join: true, menuTime: '' })), true);
  assert.equal(h.run("CacheStore.get('guildEvent').state"), 'Available');
  assert.equal(h.run("CacheStore.get('guildEvent').expiresAt"), 400000);
  assert.equal(h.context.collectGuildEvent(eventFixture({ cooldown: true, loaded: false })), true);
  assert.equal(h.run("CacheStore.get('guildEvent').state"), 'Cooldown');
});

test('an own participant row without a timer completes contribution while other players and the event remain active', () => {
  const h = harness();
  h.run(`localStorage.setItem(PLAYER_NAME_KEY, 'Player')`);
  assert.equal(h.context.collectGuildEvent(eventFixture({ ownTime: null, ownXp: '85,102 XP', menuTime: '' })), true);
  const entry = h.run("CacheStore.get('guildEvent')");
  assert.equal(entry.state, 'Completed');
  assert.equal(entry.personalXp, 85102);
  assert.equal(entry.stateEndsAt, null);
  assert.equal(entry.eventEndsAt, 100000 + 42 * 3600000);
  assert.match(h.context.guildEventStatusIcon(entry), /class="iw-task-icon done"/);
  assert.match(h.context.guildEventStatusIcon(entry), /M5 12.5l4 4L19 6.5/);
  assert.doesNotMatch(h.context.guildEventStatusIcon(entry), /iw-hourglass/);
  assert.match(h.context.guildEventDetail(entry), /Contribution complete · 85,102 XP · Event ends in/);

  // A later partial mount cannot erase the completed snapshot.
  for (const options of [{ ownTime: '' }, { ownTime: null, ownXp: '' }, { ownTime: null, eventTime: '' }, { own: false }]) {
    assert.equal(h.context.collectGuildEvent(eventFixture(options)), false);
    assert.equal(h.run("CacheStore.get('guildEvent')"), entry);
  }
});

test('personal timer expiry switches the rendered icon to a checkmark and removes the action bonus', () => {
  const h = harness();
  h.run(`
    CacheStore.set('guildEvent', { schema:9, state:'Participating', eventName:'Combat Event', personalXp:50, stateEndsAt:200000, eventEndsAt:300000 });
    globalThis.action = {name:'Treant', skillName:'Defense', isCombat:true, combatants:[]};
    readCurrentAction = () => action;
    AppState.ui.page = {hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    StatusRenderer.render(AppState);
  `);
  assert.match(h.run('AppState.ui.page.innerHTML'), /class="iw-guild-event-badge"/);
  h.time(200000);
  h.run('StatusRenderer.render(AppState)');
  let html = h.run('AppState.ui.page.innerHTML');
  assert.match(html, /data-guild-event-state="Completed"/);
  assert.match(html, /Contribution complete/);
  assert.doesNotMatch(html, /class="iw-guild-event-badge"|Status could not render/);
  h.time(300000);
  h.run('StatusRenderer.render(AppState)');
  assert.match(h.run('AppState.ui.page.innerHTML'), /data-guild-event-state="Unknown"/);
});

test('personal timer expiry refreshes the status icon even with an unrelated current skill', () => {
  const h = harness();
  h.run(`
    CacheStore.set('guildEvent', {schema:9,state:'Participating',eventName:'Combat Event',stateEndsAt:200000,eventEndsAt:300000});
    readCurrentAction = () => ({name:'Tree',skillName:'Woodcutting',isCombat:false});
    AppState.ui.page = {hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    StatusRenderer.render(AppState);
  `);
  h.time(200000);
  h.run('StatusRenderer.render(AppState)');
  assert.match(h.run('AppState.ui.page.innerHTML'), /data-guild-event-state="Completed"/);
});

test('old event snapshots are stale and no longer display a guessed availability state', () => {
  const h = harness();
  h.run(`CacheStore.set('guildEvent', { schema: 8, state: 'Participating', expiresAt: 999999 })`);
  assert.equal(h.run("CacheStore.isFresh('guildEvent')"), false);
  assert.match(h.run("guildEventStatusIcon(CacheStore.get('guildEvent'))"), /data-guild-event-state="Unknown"/);
  assert.doesNotMatch(h.run("guildEventDetail(CacheStore.get('guildEvent'))"), /Ready to start/);
});

test('a partial visible capture does not throttle the participant rows that arrive next', () => {
  const document = element('', {}, { 'guild-page .card > .header > .name': [element('Event'), element('Participants')] });
  const h = harness({ document, location: { pathname: '/guild' } });
  h.run(`AppState.ui.page = { hidden: true }; globalThis.ready = false; globalThis.attempts = 0; collectGuildEvent = () => { attempts++; return ready; }; captureVisibleCaches()`);
  assert.equal(h.run('AppState.ui.visibleCaptureTimes.guildEvent'), undefined);
  h.time(100100);
  h.run('ready = true; captureVisibleCaches()');
  assert.equal(h.run('attempts'), 2);
  assert.equal(h.run('AppState.ui.visibleCaptureTimes.guildEvent'), 100100);
});
