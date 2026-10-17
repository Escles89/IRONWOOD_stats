const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function snapshot() {
  const skill = (id, name, level = 1) => ({id, name, image:`misc/${name.toLowerCase()}.png`, owned:0, pending:0,
    levels:{xp:level,loot:level,eff:level}, costs:{xp:level+1,loot:level+1,eff:level+1}});
  return {
    passives:[{id:'xp',name:'XP',max:12},{id:'loot',name:'Loot',max:12},{id:'eff',name:'Efficiency',max:12}],
    skills:[skill('wood','Woodcutting'),skill('farm','Farming'),skill('mine','Mining'),skill('fish','Fishing'),skill('def','Defense')],
    regions:[{name:'Forest',skillIds:['wood','farm','def'],selectedId:'wood'},
      {name:'Mountain',skillIds:['mine','def'],selectedId:'mine'},
      {name:'Ocean',skillIds:['fish','def'],selectedId:'fish'}]
  };
}

test('balanced progression outranks an affordable higher level, independently of the icon', () => {
  const h=harness(), data=snapshot();
  data.skills[0].levels={xp:3,loot:3,eff:3}; data.skills[0].costs={xp:4,loot:4,eff:4}; data.skills[0].owned=4;
  const result=h.context.buildAttunementProgression(data);
  assert.equal(result.availability,'ready');
  assert.equal(result.regions[0].target.id,'farm');
  assert.equal(result.regions[0].target.missing,2);
});

test('first unlocks precede further ranks; shortfall includes only that skill’s pending shards', () => {
  const h=harness(), data=snapshot();
  data.skills[1].levels.eff=0; data.skills[1].costs.eff=1;
  data.skills[0].owned=100; data.skills[2].pending=100;
  const target=h.context.buildAttunementProgression(data).regions[0].target;
  assert.equal(target.id,'farm'); assert.equal(target.passive,'Efficiency'); assert.equal(target.missing,1);
});

test('owned and collect-first availability remain distinct and update after purchases', () => {
  const h=harness(), data=snapshot(), skill=data.skills[0];
  skill.owned=1; skill.pending=1;
  let result=h.context.buildAttunementProgression(data);
  assert.equal(result.availability,'collect'); assert.equal(result.regions[0].target.state,'collect');
  assert.equal(result.regions[0].target.owned,1);
  skill.owned=2; skill.pending=0;
  assert.equal(h.context.buildAttunementProgression(data).availability,'ready');
  skill.owned=0; skill.levels.xp=2; skill.costs.xp=3;
  result=h.context.buildAttunementProgression(data);
  assert.equal(result.availability,'none'); assert.equal(result.regions[0].target.passive,'Loot');
});

test('fewest missing shards beats set completion; set gains then break ties', () => {
  const h=harness(), data=snapshot();
  data.skills[0].levels.xp=2; data.skills[4].levels.xp=2;
  data.skills[0].pending=1;
  assert.equal(h.context.buildAttunementProgression(data).regions[0].target.id,'wood');
  data.skills[1].pending=1;
  const target=h.context.buildAttunementProgression(data).regions[0].target;
  assert.equal(target.id,'farm'); assert.equal(target.passive,'XP');
  assert.ok(target.gains.includes('Forest XP 1 → 2'));
});

test('ties retain the current skill, then use stable catalog order', () => {
  const h=harness(), data=snapshot();
  data.regions[0].selectedId='farm';
  assert.equal(h.context.buildAttunementProgression(data).regions[0].target.id,'farm');
  data.regions[0].selectedId=null;
  assert.equal(h.context.buildAttunementProgression(data).regions[0].target.id,'wood');
});

test('shared Defense advances regional and completion sets without allocating its shards repeatedly', () => {
  const h=harness(), data=snapshot();
  for (const skill of data.skills.slice(0,-1)) skill.levels={xp:2,loot:2,eff:2};
  data.skills[4].owned=2;
  const result=h.context.buildAttunementProgression(data);
  assert.equal(result.regions.length,3);
  for (const region of result.regions) {
    assert.equal(region.target.id,'def'); assert.equal(region.target.owned,2);
    assert.equal(region.target.gains.length,4);
  }
  assert.match(h.context.renderAttunementProgression(result),/Shared skill balance across regions/);
});

test('unknown pending loot does not claim collect-first readiness or rank an uncertain shortfall', () => {
  const h=harness(), data=snapshot(); data.skills[0].pending=null;
  const result=h.context.buildAttunementProgression(data);
  assert.equal(result.availability,'none'); assert.equal(result.regions[0].state,'unknown');
  data.skills[0].owned=2;
  assert.equal(h.context.buildAttunementProgression(data).regions[0].target.state,'ready');
});

test('capped passives produce a completed region; invalid balances fail closed', () => {
  const h=harness(), data=snapshot();
  for (const skill of data.skills) skill.levels={xp:12,loot:12,eff:12};
  assert.ok(h.context.buildAttunementProgression(data).regions.every(region=>region.state==='complete'));
  data.skills[0].owned=-1;
  assert.equal(h.context.buildAttunementProgression(data).availability,'unknown');
  assert.equal(h.context.buildAttunementProgression(null).availability,'unknown');
});

function runtime() {
  const user={stats:{attunements:{attune:{points:8,spentPoints:6}}},attunements:{passives:{attune:{xp:1}},slots:{forest:{id:'attune',loot:{shard:{amount:1}}}}}};
  const native={passives:{xp:{id:'xp',name:'XP',cost:1,max:12}},slots:{forest:{id:'forest',regionId:'r',attunements:{attune:{id:'attune'}}}},
    cost:(user,id,passive)=>(user.attunements.passives?.[id]?.[passive]||0)+1};
  return {state:{user},attunementProgression:native,attunementCatalog:{attune:{id:'attune',skillId:'skill',name:'Alchemy',image:'misc/alchemy.png'}},
    regionCatalog:{r:{id:'r',name:'Forest',skills:['skill']}},catalog:{shard:{id:'shard',image:'items/attunement-shard.png'}}};
}

test('native reader maps distinct skill/attunement IDs, unspent balance, and pending loot', () => {
  const h=harness(), r=runtime(), data=h.context.readAttunementProgression(r);
  assert.equal(data.skills[0].owned,2); assert.equal(data.skills[0].pending,1);
  assert.equal(data.skills[0].costs.xp,2);
  assert.equal(data.regions[0].skillIds[0],'attune'); assert.equal(data.regions[0].selectedId,'attune');
  r.state.user.attunements.slots.second={id:'attune',loot:{shard:{amount:3}}};
  assert.equal(h.context.readAttunementProgression(r).skills[0].pending,4);
  delete r.state.user.attunements.slots.second.loot;
  assert.equal(h.context.readAttunementProgression(r).skills[0].pending,null);
});

test('native reader handles missing optional zero values but rejects incompatible catalogs and character transitions', () => {
  const h=harness(), r=runtime();
  delete r.state.user.stats; delete r.state.user.attunements.passives;
  assert.equal(h.context.readAttunementProgression(r).skills[0].owned,0);
  assert.equal(h.context.readAttunementProgression(r).skills[0].levels.xp,0);
  r.state.swappingCharacter=true; assert.equal(h.context.readAttunementProgression(r),null);
  r.state.swappingCharacter=false; r.regionCatalog.r.skills.push('missing');
  assert.equal(h.context.readAttunementProgression(r),null);
});

test('native definitions are discovered through named bindings, independent of minified export names', () => {
  const h=harness();
  function Page(){ this.ATTUNEMENT_PASSIVE_DATA=data.a; this.ATTUNEMENT_SLOT_DATA=data.b; this.calcAttunementPassiveCost=calc.c; }
  const definitions={a:{x:{id:'x',name:'XP',cost:1,max:12},l:{id:'l',name:'Loot',cost:1,max:12},e:{id:'e',name:'Efficiency',cost:1,max:12}},
    b:{f:{name:'Forest Slot',regionId:'forest'}}};
  const calculations={c:()=>2};
  assert.equal(h.context.discoverNativeAttunement(Page,[definitions,calculations]).cost,calculations.c);
  assert.equal(h.context.discoverNativeAttunement(Page,[definitions,calculations,{c:()=>3}]),null);
  assert.equal(h.context.discoverNativeAttunement(null,[]),null);
});

test('UI distinguishes available, collect-first, gathering and completed targets without purchase controls', () => {
  const h=harness(), data=snapshot();
  assert.equal(h.context.renderAttunementAvailability('none'),'');
  assert.match(h.context.renderAttunementAvailability('ready'),/aria-label="Passive improvement available"/);
  assert.match(h.context.renderAttunementAvailability('collect'),/available after collection/);
  let markup=h.context.renderAttunementProgression(h.context.buildAttunementProgression(data));
  assert.match(markup,/Keep attuning Woodcutting/); assert.match(markup,/2 more shards/);
  data.skills[0].owned=2;
  markup=h.context.renderAttunementProgression(h.context.buildAttunementProgression(data));
  assert.match(markup,/Upgrade Woodcutting XP now/); assert.doesNotMatch(markup,/<button/);
  data.skills[0].owned=1; data.skills[0].pending=1;
  markup=h.context.renderAttunementProgression(h.context.buildAttunementProgression(data));
  assert.match(markup,/Collect, then upgrade/); assert.match(markup,/1 owned \+ 1 pending \/ 2 shards/);
});

test('dashboard availability refreshes from live balances without a cache change', () => {
  const h=harness(), r=runtime();
  h.context.findNativeSyncRuntime=()=>r;
  h.run(`SourceAdapter.capture=()=>Object.assign(AppState.live,{action:null,loot:[],consumables:[],materials:[],masteryProgress:{},finiteQueue:null});
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    StatusRenderer.render(AppState);`);
  assert.match(h.run('AppState.ui.page.innerHTML'),/aria-label="Passive improvement available"/);
  r.state.user.stats.attunements.attune.spentPoints=7;
  h.run('StatusRenderer.render(AppState)');
  assert.match(h.run('AppState.ui.page.innerHTML'),/aria-label="Passive improvement available after collection"/);
  r.state.user.attunements.slots.forest.loot={};
  h.run('StatusRenderer.render(AppState)');
  assert.doesNotMatch(h.run('AppState.ui.page.innerHTML'),/iw-attunement-available/);
});

test('native card mounts once, preserves controls and follows menus without repeated DOM writes', () => {
  let writes=0;
  const children=[];
  function card(name) {
    return {name,attrs:{'_ngcontent-test':''},querySelector:()=>({textContent:name}),
      get nextElementSibling(){return children[children.indexOf(this)+1]||null;},
      after(node){const old=children.indexOf(node);if(old>=0)children.splice(old,1);children.splice(children.indexOf(this)+1,0,node);writes++;},
      cloneNode(){return card('');},setAttribute(key,value){this.attrs[key]=value;},getAttributeNames(){return Object.keys(this.attrs);},
      querySelectorAll:()=>[],set innerHTML(value){this.markup=value;writes++;}};
  }
  const menu=card('Menu'), slots=card('Slots'); children.push(menu,slots);
  const root={querySelectorAll:()=>children,querySelector:()=>children.find(item=>item.id==='iw-attunement-progression')};
  const h=harness({location:{pathname:'/attunement'},document:{querySelector:()=>root,querySelectorAll:()=>[]}});
  const data=snapshot();h.context.attunementProgression=()=>h.context.buildAttunementProgression(data);
  h.context.syncAttunementProgression(); const host=children[2], firstWrites=writes;
  assert.equal(host.id,'iw-attunement-progression'); assert.equal(host.attrs['_ngcontent-test'],'');
  h.context.syncAttunementProgression(); assert.equal(writes,firstWrites);
  children.splice(children.indexOf(slots),1);
  h.context.syncAttunementProgression(); assert.equal(menu.nextElementSibling,host);
  assert.equal(children.filter(item=>item.id==='iw-attunement-progression').length,1);
  data.skills[0].owned=2; h.context.syncAttunementProgression();
  assert.match(host.markup,/Upgrade Woodcutting XP now/);
  assert.ok(children.includes(menu)); assert.doesNotMatch(host.markup,/<button/);
});
