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
test('saved header option relocates the entire indicator group, restores it when disabled, and clears on idle',()=>{
  const h=setup();
  h.run('StatusRenderer.render(AppState)');
  assert.match(h.run('AppState.ui.page.innerHTML'),/class="iw-action-badges"/);
  h.run("localStorage.setItem(HEADER_ICONS_KEY,'true'); StatusRenderer.render(AppState)");
  assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/class="iw-action-badges"/);
  assert.match(h.run('AppState.ui.headerBadgeMarkup'),/iw-mastery-badge/);
  assert.match(h.run('AppState.ui.headerBadgeMarkup'),/iw-active-badge/);
  assert.match(h.run('AppState.ui.headerBadgeMarkup'),/iw-queue-warning sufficient/);
  h.run("localStorage.setItem(HEADER_ICONS_KEY,'false'); StatusRenderer.render(AppState)");
  assert.match(h.run('AppState.ui.page.innerHTML'),/class="iw-action-badges"/);
  h.run('action=null; queue=null; StatusRenderer.render(AppState)');
  assert.equal(h.run('AppState.ui.headerBadgeMarkup'),'');
});
test('compact options retain every control and explain cache lookups accurately',()=>{
  const h=setup();h.run('StatusRenderer.render(AppState)');
  const html=h.run('AppState.ui.page.innerHTML');
  for(const attr of ['data-header-icons-toggle','data-potion-type-add','data-automation-toggle','data-cache-lookups-toggle','data-challenge-region','data-challenge-skill','data-multiplayer-toggle','data-debug-toggle']) {
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

test('potion selection preserves the legacy setting and supports an explicitly empty selection',()=>{
  const h=harness();
  assert.equal(h.run('JSON.stringify(getPotionTypes())'),'["Divine"]');
  h.run("localStorage.setItem(SUPER_POTIONS_KEY,'true')");
  assert.equal(h.run('JSON.stringify(getPotionTypes())'),'["Divine","Super"]');
  h.run("localStorage.setItem(POTION_TYPES_KEY,'[]')");
  assert.equal(h.run('JSON.stringify(getPotionTypes())'),'[]');
});

test('all potion tiers merge inventory and equipped counts, exclude other consumables, and respond to filtering',()=>{
  const h=setup();
  h.run(`
    CacheStore.set('inventory',{schema:1,items:[],allItems:[
      {key:'potion-gather-yield.png',name:'Gather Yield Potion',image:'/assets/items/potion-gather-yield.png',amount:12},
      {key:'potion-super-combat-loot.png',name:'Super Combat Loot Potion',image:'/assets/items/potion-super-combat-loot.png',amount:7},
      {key:'potion-super-craft-efficiency.png',name:'Super Craft Efficiency Potion',image:'/assets/items/potion-super-craft-efficiency.png',amount:0},
      {key:'brew-mastery.png',name:'Mastery Brew',image:'/assets/items/brew-mastery.png',amount:40}
    ]});
    SourceAdapter.capture=()=>Object.assign(AppState.live,{action,loot:[],materials:[],masteryProgress:{},finiteQueue:queue,consumables:[
      {name:'Super Combat Loot Potion',image:'/assets/items/potion-super-combat-loot.png',amount:'25'},
      {name:'Regular Craft Efficiency Potion',image:'/assets/items/potion-regular-craft-efficiency.png',amount:'1.2K'}
    ]});
    localStorage.setItem(POTION_TYPES_KEY,JSON.stringify(POTION_TYPES));
    StatusRenderer.render(AppState);
  `);
  const potions=JSON.parse(h.run('JSON.stringify(AppState.derived.displayedPotions)'));
  assert.equal(potions.find(p=>p.name==='Gather Yield Potion').stored,12);
  assert.equal(potions.find(p=>p.name==='Super Combat Loot Potion').equipped,25);
  assert.equal(potions.find(p=>p.name==='Super Combat Loot Potion').stored,7);
  assert.equal(potions.find(p=>p.name==='Regular Craft Efficiency Potion').equipped,1200);
  assert.ok(!potions.some(p=>p.name==='Mastery Brew'||p.name==='Super Craft Efficiency Potion'));
  h.run("localStorage.setItem(POTION_TYPES_KEY,'[\"Regular\"]'); StatusRenderer.render(AppState)");
  assert.equal(h.run('AppState.derived.displayedPotions.length'),2);
  assert.equal(h.run('AppState.derived.displayedPotions.every(p=>p.tier===\"Regular\")'),true);
  h.run("localStorage.setItem(POTION_TYPES_KEY,'[]'); StatusRenderer.render(AppState)");
  assert.equal(h.run('AppState.derived.displayedPotions.length'),0);
});
