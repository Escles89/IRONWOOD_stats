const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
const lines = require('../../src/content/news-lines.json');
test('news library contains unique nonempty lines for every skill and general contexts', () => {
  for (const category of ['general','idle','combat','Woodcutting','Mining','Farming','Fishing','Delving','Exploring','Smelting','Smithing','Enchanting','Alchemy','Cooking','Imbuing','Taming','One-handed','Two-handed','Ranged','Defense']) {
    assert.ok(lines[category].length >= 2, category);
    assert.equal(new Set(lines[category]).size, lines[category].length);
  }
});
test('headlines select relevant categories and stay stable between rotations', () => {
  const h = harness();
  const action = { skillName:'Woodcutting' };
  assert.ok(h.context.newsCandidates(action).includes('Woodcutting'));
  assert.ok(h.context.newsCandidates(action).includes('sci_fi'));
  assert.ok(h.context.newsCandidates({ skillName:'Defense',isCombat:true }).includes('combat'));
  const first = h.context.selectNewsLine(action).line;
  assert.equal(h.context.selectNewsLine(action, 101000).line, first);
  assert.notEqual(h.context.selectNewsLine(action, 200000).line, first);
  assert.ok(h.context.newsCandidates(null).includes('idle'));
});
test('pause freezes the ticker across time and skill changes; resume allows rotation', () => {
  const h = harness();
  const first = h.context.selectNewsLine(null).line;
  h.run('newsTicker.paused = true');
  assert.equal(h.context.selectNewsLine({skillName:'Mining'}, 900000).line,first);
  h.run('newsTicker.paused = false');
  assert.notEqual(h.context.selectNewsLine({skillName:'Mining'}, 900000).line,first);
  const html = h.context.renderNewsTicker(null);
  assert.match(html,/data-news-pause/);
  assert.match(html,/fictional village headlines/);
});

test('player placeholders use the known name literally and fall back when unavailable', () => {
  const h = harness();
  assert.equal(h.context.personalizeNewsLine('{player} has a plan.'), 'Our local hero has a plan.');
  h.storage.set('iw-stats-player-name-v2', 'Ari $& <Mage>');
  assert.equal(h.context.personalizeNewsLine('{player} meets {player}.'), 'Ari $& <Mage> meets Ari $& <Mage>.');
  h.run("newsTicker.line = personalizeNewsLine('{player} has a plan.'); newsTicker.skill = 'idle'; newsTicker.nextAt = 200000;");
  const html = h.context.renderNewsTicker(null);
  assert.match(html, /Ari \$&amp; &lt;Mage&gt;/);
  assert.doesNotMatch(html, /<Mage>/);
  for (const [key, category] of Object.entries(lines)) if (!key.startsWith('_')) assert.ok(category.some(line => line.includes('{player}')));
});

test('rare dispatches have a one percent roll and a ten-minute cooldown', () => {
  const h = harness();
  assert.equal(h.context.chooseNewsCategory(null,100000,()=>0),'rare');
  assert.notEqual(h.context.chooseNewsCategory(null,100001,()=>0),'rare');
  assert.equal(h.context.chooseNewsCategory(null,700000,()=>0),'rare');
  assert.notEqual(h.context.chooseNewsCategory(null,1400000,()=>.02),'rare');
});

test('combat reports use the current enemy and distinguish low health and revival', () => {
  const h = harness();
  const action = { isCombat:true, name:'Treant', skillName:'Defense', combatants:[{side:'player',hpPercent:20}] };
  assert.equal(h.context.chooseNewsCategory(action,100000,()=>.2),'combat_danger');
  assert.equal(h.context.newsContext(action).enemy,'Treant');
  assert.equal(h.context.newsContext(action).hp,20);
  action.reviveRemainingMs=2000;
  assert.equal(h.context.chooseNewsCategory(action,100000,()=>.2),'combat_reviving');
  action.reviveRemainingMs=0; action.combatants=[];
  assert.equal(h.context.chooseNewsCategory(action,100000,()=>.2),'combat_live');
});

test('mastery counts use saved complete skills and require a known total for remaining counts', () => {
  const h = harness();
  assert.equal(h.context.newsMasteryValues(),null);
  h.run("setCache('mastery',{schema:1,completeSkills:['Mining','Mining','Defense']})");
  assert.equal(h.context.newsMasteryValues().mastered,2);
  assert.equal(h.context.newsMasteryValues().remaining,undefined);
  h.run("setCache('mastery',{schema:1,completeSkills:['Mining','Defense'],totalSkills:16})");
  assert.equal(h.context.newsMasteryValues().remaining,14);
  assert.ok(h.context.newsCandidates(null).includes('mastery_remaining'));
});

test('level-ups and special loot require observed changes, and reports are not repeated each render', () => {
  const h = harness();
  const action = {skillName:'Mining',skillLevel:10,actionId:1};
  const item = {name:'Loot Amulet',image:'amulet.png',amount:2};
  h.context.observeNewsEvents(action,[item],true);
  assert.equal(h.run('newsTicker.events.length'),0);
  action.skillLevel=11; item.amount=3;
  h.context.observeNewsEvents(action,[item],true);
  assert.equal(h.run('newsTicker.events.length'),2);
  assert.equal(h.run('newsTicker.events[0].category'),'level_up');
  assert.equal(h.run('newsTicker.events[1].values.amount'),'1');
  h.context.observeNewsEvents(action,[item],true);
  assert.equal(h.run('newsTicker.events.length'),2);
  action.skillName='Smelting'; action.skillLevel=100; action.actionId=2;
  h.context.observeNewsEvents(action,[{...item,amount:50}],true);
  assert.equal(h.run('newsTicker.events.length'),2);
  h.run('newsTicker.nextAt=0');
  assert.equal(h.context.selectNewsLine(action).category,'level_up');
});

test('missing loot mounts and approximate quantities cannot invent special drops; events expire', () => {
  const h = harness();
  const action={skillName:'Mining',skillLevel:10,actionId:1};
  const item={name:'Loot Amulet',image:'amulet.png',amount:2};
  h.context.observeNewsEvents(action,[item],true);
  h.context.observeNewsEvents(action,[],false);
  h.context.observeNewsEvents(action,[item],true);
  assert.equal(h.run('newsTicker.events.length'),0);
  h.context.observeNewsEvents(action,[{...item,amount:3000,approximate:true}],true);
  assert.equal(h.run('newsTicker.events.length'),0);
  h.context.queueNewsEvent('level_up',{skill:'Mining',level:11},100000);
  h.context.selectNewsLine(action,161000);
  assert.equal(h.run('newsTicker.events.length'),0);
});

test('source attribution rotates without consecutive repeats and includes press and social outlets', () => {
  const h=harness();
  const first=h.context.selectNewsLine(null,100000).source;
  const next=h.context.selectNewsLine(null,200000).source;
  assert.notEqual(first,next);
  assert.ok(lines._sources.some(source=>source.includes('Herald')));
  assert.ok(lines._sources.some(source=>source.includes('QuestTok')));
  assert.ok(lines._sources.some(source=>source.includes('Forum')));
});

test('reference library retains every context with sixteen unique templates', () => {
  const categories = Object.entries(lines).filter(([key])=>!key.startsWith('_'));
  const all = categories.flatMap(([,values])=>values);
  assert.equal(all.length,608);
  assert.equal(new Set(all).size,all.length);
  for(const [key,values] of categories) assert.equal(values.length,16,key);
  for(const key of ['league_of_legends','diablo','rollercoaster_tycoon','cookie_clicker','runescape']) assert.ok(lines[key].length>=12);
});

test('each category exhausts its library before repeating and avoids repeats across cycle boundaries', () => {
  const h=harness();
  const category='combat_danger';
  const first=[];
  for(let i=0;i<lines[category].length;i++) {
    const line=h.context.nextNewsTemplate(category,()=>0);
    h.context.newsLast=line;
    h.run('newsTicker.template=newsLast');
    first.push(line);
  }
  assert.equal(new Set(first).size,lines[category].length);
  const next=h.context.nextNewsTemplate(category,()=>0);
  assert.equal(next,first[0]);
  assert.notEqual(next,first.at(-1));
  assert.ok(h.run('newsTicker.recent.length')<=40);
});

test('every outlet has its own icon and the ticker displays it in the brand block', () => {
  const outlets = require('../../src/content/news-outlets.json');
  const h = harness();
  assert.equal(Object.keys(outlets).length,lines._sources.length);
  assert.equal(new Set(Object.values(outlets).map(outlet=>outlet.icon)).size,20);
  for (const source of lines._sources) {
    assert.ok(outlets[source]);
    const html = h.context.renderNewsOutlet(source);
    assert.match(html,/<svg/);
    assert.ok(html.includes(outlets[source].name));
  }
  const html = h.context.renderNewsTicker(null);
  assert.match(html,/iw-news-brand[^>]*data-news-source=/);
  assert.doesNotMatch(html,/<span>Ironwood Dispatch<\/span>/);
});

test('outlet identities use custom silhouettes, palettes and wordmark families', () => {
  const outlets=require('../../src/content/news-outlets.json');
  const h=harness();
  assert.ok(new Set(Object.values(outlets).map(value=>value.shape)).size>=10);
  assert.ok(new Set(Object.values(outlets).map(value=>value.family)).size>=6);
  for(const [source,outlet] of Object.entries(outlets)) {
    assert.match(outlet.secondary,/^#[0-9a-f]{6}$/i);
    const markup=h.context.renderNewsOutlet(source);
    assert.ok(markup.includes(`iw-brand-${outlet.family}`));
    assert.match(markup,/iw-brand-field/);
    assert.match(markup,/iw-brand-glyph/);
  }
});

test('ticker countdown freezes on pause and resumes with the same remaining reading time', () => {
  const h=harness();
  h.context.selectNewsLine(null,100000);
  const before=h.context.newsRemainingFraction(107000);
  h.context.toggleNewsPause(107000);
  assert.equal(h.context.newsRemainingFraction(500000),before);
  h.context.toggleNewsPause(500000);
  assert.equal(h.context.newsRemainingFraction(500000),before);
  assert.equal(h.context.newsRemainingFraction(600000),0);
  assert.match(h.context.newsPauseIcon(true),/<svg/);
});
