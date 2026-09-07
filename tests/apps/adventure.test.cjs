const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
function el(text = '', singles = {}, lists = {}, extra = {}) {
  return { textContent:text, querySelector:s=>singles[s] || null, querySelectorAll:s=>lists[s] || [], ...extra };
}
function row(name, value) {
  const label = el(name, {}, {}, {classList:{contains:() => true}});
  const amount = el(value, {}, {}, {classList:{contains:() => false}});
  return el(`${name} ${value}`, {'.name':label, '.amount':amount}, {}, {children:[label,amount]});
}
function fixture({ detail = false, timer = '7h33m28s', state = '', map = 'Defense Map', research = true, partial = false } = {}) {
  const adventure = el('', {'.name':el('Adventure'), '.time':timer ? el(timer) : null, '.event-icon, .amount':el(state)}, {}, {classList:{contains:()=>detail}});
  const storage = row('Storage','11 / 20');
  const menu = el('', {':scope > .header > .name':el('Menu')}, {':scope > button.row':[adventure,storage]});
  const rows = partial ? [] : [row('Daily Map Limit','9 / 9'), row('Weekly Limit Reset','11h47m')];
  if (research) rows.push(row('Research Points','51,576 / 2,400'));
  const cards = [menu];
  if (map) cards.push(el('', {':scope > .header > .name':el(map)}));
  if (detail) cards.push(el('', {':scope > .header > .name':el('Adventure')}, {'.row':[row('Remaining Time',timer)]}));
  const root = el('', {}, {'.card':cards, '.row':rows});
  return el('', {'adventure-page':root}, {'adventure-page button.row':[adventure,storage]});
}

test('native time element identifies the running Defense map independently of completed map creation', () => {
  const h = harness();
  const data = h.context.collectAdventure(fixture({detail:true}));
  assert.equal(data.state,'Active');
  assert.equal(data.mapSkill,'Defense');
  assert.equal(data.mapName,'Defense Map');
  assert.equal(data.stateEndsAt,100000 + (7*3600+33*60+28)*1000);
  assert.equal(data.mapsComplete,true);
  assert.equal(data.researchPoints,51576);
  assert.match(h.context.adventureDetail(data),/^Defense Map · 7h 34m remaining$/);
  assert.equal(h.run("CacheStore.isFresh('adventure')"),true);
});

test('stored/selected maps never replace the running map, and detail captures preserve creation resources', () => {
  const h = harness();
  const storage = h.context.collectAdventure(fixture({map:'Mining Map'}));
  assert.equal(storage.mapSkill,'');
  assert.equal(h.run("CacheStore.isFresh('adventure')"),false);
  const running = h.context.collectAdventure(fixture({detail:true,research:false}));
  assert.equal(running.mapSkill,'Defense');
  assert.equal(running.researchPoints,51576);
  assert.equal(running.mapCost,2400);
  const later = h.context.collectAdventure(fixture({map:'Mining Map'}));
  assert.equal(later.mapSkill,'Defense');
  const nextRun = h.context.collectAdventure(fixture({timer:'23h',map:'Mining Map'}));
  assert.equal(nextRun.mapSkill,'');
});

test('partial pages preserve the active snapshot; confirmed idle/cooldown clears the map', () => {
  const h = harness();
  h.context.collectAdventure(fixture({detail:true}));
  const previous = h.run("CacheStore.get('adventure')");
  assert.equal(h.context.collectAdventure(fixture({timer:'',partial:true})),null);
  assert.equal(h.run("CacheStore.get('adventure')"),previous);
  assert.equal(h.context.collectAdventure(el()),null);
  for (const state of ['Idle','Cooldown']) {
    const data = h.context.collectAdventure(fixture({timer:'',state}));
    assert.equal(data.state,state);
    assert.equal(data.mapSkill,'');
    assert.ok(data.expiresAt <= 400000);
  }
});

test('dashboard shows active map and header badge even after all daily maps are created', () => {
  const h = harness();
  h.context.collectAdventure(fixture({detail:true}));
  h.run(`readCurrentAction = () => ({name:'Treant',isCombat:true,skillName:'Defense',combatants:[]}); AppState.ui.page = {hidden:false, innerHTML:'', style:{setProperty(){}},querySelector(){return null;}}; StatusRenderer.render(AppState)`);
  const html = h.run('AppState.ui.page.innerHTML');
  assert.match(html,/Defense Map · 7h 34m remaining/);
  assert.match(html,/class="iw-adventure-badge" title="Defense Map in progress"/);
  assert.doesNotMatch(html,/No adventure running|Status could not render/);
});

test('old adventure snapshots are refreshed to obtain map skill', () => {
  const h = harness();
  h.run(`CacheStore.set('adventure', {schema:10,state:'Idle',expiresAt:999999999})`);
  assert.equal(h.run("CacheStore.isFresh('adventure')"),false);
  assert.equal(h.run("adventureDetail(CacheStore.get('adventure'))"),'Adventure needs checking');
});

test('background map capture opens Adventure details to read the running skill', async () => {
  const h = harness();
  let current = fixture({map:'Mining Map'});
  let clicks = 0;
  current.querySelectorAll('adventure-page button.row')[0].click = () => { clicks++; current = fixture({detail:true,research:false}); };
  const document = { querySelector:s=>current.querySelector(s), querySelectorAll:s=>current.querySelectorAll(s) };
  const data = await h.context.captureAdventureMapDetails(document);
  assert.equal(clicks,1);
  assert.equal(data.mapSkill,'Defense');
  assert.equal(data.researchPoints,51576);
});

test('adventure bonus requires an active unexpired map and an exact skill match', () => {
  const h = harness();
  const entry = {schema:11,state:'Active',mapSkill:'Defense',stateEndsAt:200000};
  assert.equal(h.context.adventureBonusActive(entry,' defense '),true);
  for (const skill of ['Mining','Defense Training','',undefined]) assert.equal(h.context.adventureBonusActive(entry,skill),false);
  assert.equal(h.context.adventureBonusActive({...entry,mapSkill:'One-handed'},'One-handed'),true);
  for (const state of ['Idle','Cooldown','Unknown']) assert.equal(h.context.adventureBonusActive({...entry,state},'Defense'),false);
  assert.equal(h.context.adventureBonusActive(entry,'Defense',200000),false);
  assert.equal(h.context.adventureBonusActive({...entry,schema:10},'Defense'),false);
  assert.equal(h.context.adventureBonusActive({...entry,mapSkill:''},'Defense'),false);
  assert.equal(h.context.adventureBonusActive(null,'Defense'),false);
});

test('adventure action icon follows skill changes while the Status row keeps the running map', () => {
  const h = harness();
  h.context.collectAdventure(fixture({detail:true}));
  h.run(`globalThis.action = {name:'Treant',isCombat:true,skillName:'Defense',combatants:[]}; readCurrentAction = () => action; AppState.ui.page = {hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}}; StatusRenderer.render(AppState)`);
  assert.match(h.run('AppState.ui.page.innerHTML'),/class="iw-adventure-badge"/);
  h.run(`action = {name:'Ore',isCombat:false,skillName:'Mining',combatants:[]}; StatusRenderer.render(AppState)`);
  assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/class="iw-adventure-badge"/);
  assert.match(h.run('AppState.ui.page.innerHTML'),/Defense Map · 7h 34m remaining/);
  assert.equal(h.run('AppState.derived.panels.adventureActive'),true);
  h.run(`action.skillName = 'Defense'; StatusRenderer.render(AppState)`);
  assert.match(h.run('AppState.ui.page.innerHTML'),/class="iw-adventure-badge"/);
  h.time(h.run("CacheStore.get('adventure').stateEndsAt"));
  h.run('StatusRenderer.render(AppState)');
  assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/class="iw-adventure-badge"/);
});
