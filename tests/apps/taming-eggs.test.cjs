const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
function documentFor({hatchery=false,ranch=false,partial=false,panel='',timer=''}={}) {
  const text=textContent=>({textContent});
  const menuRow=(label,ready)=>({querySelector(selector){
    if(selector===':scope > .name') return text(label);
    if(selector===':scope > .claim') return ready?text('Claim'):null;
    if(selector===':scope > .amount') return partial||ready?null:text('2 / 3');
    return null;
  }});
  const menu={querySelector:()=>text('Menu'),querySelectorAll:()=>[menuRow('Hatchery',hatchery),menuRow('Pets',ranch)]};
  const panelCard={querySelector:()=>text(panel),querySelectorAll:()=>timer?[text(timer)]:[]};
  const root={querySelector:()=>null,querySelectorAll:selector=>selector==='.card'?[menu,...(panel?[panelCard]:[])]:[]};
  return {querySelector:()=>root};
}
test('ready markers from either Taming menu source show an egg; inventory eggs alone do not',()=>{
  const h=harness();
  for(const [hatchery,ranch] of [[true,false],[false,true],[true,true],[false,false]]) {
    const result=h.context.collectTaming(documentFor({hatchery,ranch}));
    assert.equal(result.hatcheryEggsReady,hatchery);
    assert.equal(result.ranchEggsReady,ranch);
    const icon=h.context.renderTamingEggIndicator(h.context.tamingEggReadiness(result));
    assert.equal(icon.includes('iw-egg-ready'),hatchery||ranch);
    if(hatchery)assert.match(icon,/Hatchery/);
    if(ranch)assert.match(icon,/Ranch/);
  }
});
test('Hatchery captures preserve expedition, snack counts and loot availability',()=>{
  const h=harness();
  h.run("setCache('taming',{schema:2,petSnacks:76852,snacksRequired:37,expeditionName:'Starlight Grotto',lootAvailable:true})");
  const result=h.context.collectTaming(documentFor({hatchery:true}));
  assert.equal(result.petSnacks,76852);
  assert.equal(result.snacksRequired,37);
  assert.equal(result.expeditionName,'Starlight Grotto');
  assert.equal(result.lootAvailable,true);
});
test('confirmed absence clears readiness, but partial menus preserve the previous snapshot',()=>{
  const h=harness();
  h.context.collectTaming(documentFor({hatchery:true}));
  assert.equal(h.context.collectTaming(documentFor({partial:true})),false);
  assert.equal(h.run('getCache().taming.hatcheryEggsReady'),true);
  h.context.collectTaming(documentFor());
  assert.equal(h.run('getCache().taming.hatcheryEggsReady'),false);
});
test('observed timers become ready conservatively without further DOM reads or lookups',()=>{
  const h=harness();
  for(const [panel,source] of [['Hatchery','hatchery'],['Ranch','ranch']]) {
    const snapshot=h.context.collectTaming(documentFor({panel,timer:'2h 3m'}));
    const deadline=snapshot[`${source}EggsReadyAt`];
    assert.equal(deadline,100000+(2*60+4)*60000);
    assert.equal(h.context.tamingEggReadiness(snapshot,deadline-1)[source],false);
    assert.equal(h.context.tamingEggReadiness(snapshot,deadline)[source],true);
  }
});
test('a fresh non-ready native marker overrides an elapsed projected deadline',()=>{
  const h=harness();
  h.run("setCache('taming',{schema:2,hatcheryEggsReadyAt:99999})");
  const result=h.context.collectTaming(documentFor());
  assert.equal(result.hatcheryEggsReadyAt,null);
  assert.equal(h.context.tamingEggReadiness(result).hatchery,false);
});
test('dashboard keeps the loot Claim alongside eggs and rerenders when a cached timer expires',()=>{
  const h=harness();
  h.run(`readCurrentAction=()=>null; SourceAdapter.capture=()=>Object.assign(AppState.live,{action:null,loot:[],consumables:[],materials:[],masteryProgress:{},finiteQueue:null});
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    setCache('taming',{schema:2,petSnacks:10,lootAvailable:true,hatcheryEggsReadyAt:101000});
    StatusRenderer.render(AppState);`);
  assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/class="iw-task-icon iw-egg-ready"/);
  h.time(101000);h.run('StatusRenderer.render(AppState)');
  assert.match(h.run('AppState.ui.page.innerHTML'),/iw-taming-actions.*iw-egg-ready.*data-collect-taming/);
});

test('ready markers arriving within the capture throttle update immediately',()=>{
  const h=harness({document:documentFor({hatchery:true})});
  h.run("location.pathname='/skill/15'; AppState.ui.page={hidden:true}; captureVisibleCaches()");
  assert.equal(h.run('getCache().taming.ranchEggsReady'),false);
  h.context.document=documentFor({hatchery:true,ranch:true});
  h.time(100500);
  h.run('captureVisibleCaches()');
  assert.equal(h.run('getCache().taming.ranchEggsReady'),true);
});
