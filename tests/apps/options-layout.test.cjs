const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
function setup() {
  const h=harness();
  h.run(`globalThis.action={name:'Pie',skillName:'Cooking',isCombat:false}; globalThis.queue={time:'2h',total:200,completed:1};
    readCurrentAction=()=>action; readFiniteQueue=()=>queue;
    SourceAdapter.capture=()=>Object.assign(AppState.live,{action,loot:[],consumables:[],materials:[],masteryProgress:{},finiteQueue:queue});
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};`);
  return h;
}
test('crafting queue clock uses green, amber and red thresholds and hides without a finite queue',()=>{
  const h=setup();
  for(const [time,state] of [['2h','sufficient'],['1h','sufficient'],['59m','warning'],['10m','warning'],['9m','urgent']]) {
    h.context.timeText=time;h.run('queue.time=timeText; StatusRenderer.render(AppState)');
    assert.match(h.run('AppState.ui.page.innerHTML'),new RegExp(`iw-queue-warning ${state}`));
  }
  h.run('queue=null; StatusRenderer.render(AppState)');
  assert.doesNotMatch(h.run('AppState.ui.headerBadgeMarkup'),/iw-queue-warning/);
});
test('Status always retains its full indicator group regardless of the legacy header preference',()=>{
  const h=setup();
  for (const saved of ['true','false']) {
    h.context.saved=saved;
    h.run("localStorage.setItem(HEADER_ICONS_KEY,saved); StatusRenderer.render(AppState)");
    assert.match(h.run('AppState.ui.page.innerHTML'),/class="iw-action-badges"/);
  }
});
test('compact options retain every control and explain cache lookups accurately',()=>{
  const h=setup();h.run('StatusRenderer.render(AppState)');
  const html=h.run('renderPreferences({prefs:[], automationOn:false, cacheLookupsOn:false, headerIcons:false, questSkills:[], challengePrefs:getChallengePrefs()})');
  for(const attr of ['data-automation-toggle','data-cache-lookups-toggle','data-challenge-region','data-challenge-skill','data-challenge-buy-toggle','data-challenge-buy-price','data-multiplayer-toggle','data-debug-toggle']) {
    assert.equal(html.split(attr).length-1,1,attr);
  }
  assert.match(html,/aria-labelledby="iw-options-title"/);
  assert.match(html,/Display<\/h3>/);
  assert.match(html,/usable data is missing/);
  assert.doesNotMatch(html,/expired data may be refreshed/);
});


test('legacy daily quest preferences remain checked and editable',()=>{
  const h=harness();
  const html=h.context.renderPreferences({prefs:['Quest Defense'],automationOn:false,cacheLookupsOn:false,showSuperPotions:false,headerIcons:false,questSkills:[{name:'Defense',image:'/defense.png',done:true}],challengePrefs:{region:'Forest',skill:'Defense'}});
  assert.match(html,/data-quest="Defense" checked/);
});
test('multiplayer switch restores the native control without clicking it',()=>{
  let visible;
  const control={classList:{toggle(_class,value){visible=value;}},click(){throw Error('Should not open multiplayer');}};
  const document={querySelectorAll(selector){return selector==='nav-component .row-button > .name'?[{textContent:'Multiplayer',closest:()=>control}]:[];}};
  const h=harness({document});
  h.context.installInterfaceControls(); assert.equal(visible,false);
  h.run("localStorage.setItem(MULTIPLAYER_VISIBLE_KEY,'true')");
  h.context.installInterfaceControls(); assert.equal(visible,true);
  h.run("localStorage.setItem(MULTIPLAYER_VISIBLE_KEY,'false')");
  h.context.installInterfaceControls(); assert.equal(visible,false);
});

test('action summary shows earned XP percentage, including zero after leveling up',()=>{
  const h=setup();
  for(const progress of [87,0,100]) {
    h.context.progress=progress;
    h.run('action.skillProgress=progress; action.levelRemaining=100-progress; AppState.ui.lastSignature=""; StatusRenderer.render(AppState)');
    assert.match(h.run('AppState.ui.page.innerHTML'),new RegExp(`data-live-xp-total>${progress}% XP`));
    assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/data-live-level-remaining/);
  }
});
