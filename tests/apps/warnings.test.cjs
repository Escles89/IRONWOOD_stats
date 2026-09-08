const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

test('warning preferences preserve existing queue defaults and normalize saved thresholds',()=>{
  const h=harness();
  assert.equal(h.run('getWarningPrefs().queueMinutes'),60);
  assert.equal(h.run('getWarningPrefs().queueUrgentMinutes'),10);
  assert.equal(h.run('getWarningPrefs().materials'),1000);
  assert.equal(h.run('getWarningPrefs().materialsUrgent'),500);
  h.run('setWarningPrefs({queueMinutes:5,materials:100,researchPoints:25000})');
  assert.equal(h.run('getWarningPrefs().queueUrgentMinutes'),5);
  assert.equal(h.run('getWarningPrefs().materialsUrgent'),100);
  assert.equal(h.run('getWarningPrefs().researchPoints'),25000);
  h.run('setWarningPrefs({tribute:60000})');
  assert.equal(h.run('getWarningPrefs().researchPoints'),25000);
  h.run("localStorage.setItem(WARNING_PREFS_KEY,'broken')");
  assert.equal(h.run('getWarningPrefs().queueMinutes'),60);
  h.run("localStorage.setItem(WARNING_PREFS_KEY,JSON.stringify({queueMinutes:-1,materials:1.5,researchPoints:'0'}))");
  assert.equal(h.run('getWarningPrefs().queueMinutes'),60);
  assert.equal(h.run('getWarningPrefs().materials'),1000);
  assert.equal(h.run('getWarningPrefs().researchPoints'),10000);
});

test('custom time and material boundaries control amber/red and can be disabled',()=>{
  const h=harness();
  const prefs=h.context.setWarningPrefs({queueMinutes:120,queueUrgentMinutes:30,materials:2000,materialsUrgent:200});
  assert.equal(h.context.queueWarningState(120*60000,true,prefs),'sufficient');
  assert.equal(h.context.queueWarningState(119*60000,true,prefs),'warning');
  assert.equal(h.context.queueWarningState(30*60000,true,prefs),'warning');
  assert.equal(h.context.queueWarningState(29*60000,true,prefs),'urgent');
  assert.equal(h.context.queueWarningState(0,true,prefs),'');
  const alert=h.context.lowMaterialWarning([{name:'Ore',available:400},{name:'Wood',available:100},{name:'Unknown',available:null}],prefs);
  assert.equal(alert.state,'urgent');assert.match(alert.text,/Wood 100, Ore 400/);assert.doesNotMatch(alert.text,/Unknown/);
  assert.equal(h.context.lowMaterialWarning([{name:'Ore',available:200}],prefs).state,'warning');
  assert.equal(h.context.lowMaterialWarning([{name:'Ore',available:2000}],prefs).state,'');
  const disabled=h.context.setWarningPrefs({queueMinutes:0,materials:0});
  assert.equal(h.context.queueWarningState(1000,true,disabled),'sufficient');
  assert.equal(h.context.lowMaterialWarning([{name:'Ore',available:0}],disabled).state,'');
});

test('RP and each Tribute warn independently for known low balances, including zero',()=>{
  const h=harness();
  const result=h.context.statusResourceWarnings({adventure:{researchPoints:0},attunement:{tributes:{Forest:9999,Mountain:10000,Ocean:0}}});
  assert.match(result.rp,/Low RP: 0/);
  assert.match(result.tributes,/Forest 9,999/);
  assert.match(result.tributes,/Ocean 0/);
  assert.doesNotMatch(result.tributes,/Mountain/);
  for(const value of [undefined,null,NaN,'500',-1]) {
    const warnings=h.context.statusResourceWarnings({adventure:{researchPoints:value},attunement:{tributes:{Forest:value}}});
    assert.equal(warnings.rp,'');assert.equal(warnings.tributes,'');
  }
  assert.equal(h.context.statusResourceWarnings({adventure:{researchPoints:10000}}).rp,'');
  const prefs=h.context.setWarningPrefs({researchPoints:0,tribute:0});
  const warnings=h.context.statusResourceWarnings({adventure:{researchPoints:0},attunement:{tributes:{Forest:0}}},prefs);
  assert.equal(warnings.rp,'');assert.equal(warnings.tributes,'');
});

test('Tribute reader retains compact precision and distinguishes missing values from zero',()=>{
  const h=harness();
  assert.equal(h.context.readTributeBalance('12.1K / 100'),12100);
  assert.equal(h.context.readTributeBalance('51,234 / 400'),51234);
  assert.equal(h.context.readTributeBalance('0 / 400'),0);
  for(const value of [undefined,'','Loading…','Unknown / 400']) assert.equal(h.context.readTributeBalance(value),null);
});

test('natural Attunement capture preserves other regions and ignores missing balances',()=>{
  let amount='12.1K / 100';
  const text=textContent=>({textContent});
  const tribute={querySelector:selector=>text(selector==='.name'?'Forest Tribute':amount)};
  const slots={querySelector:()=>text('Slots'),querySelectorAll:()=>[]};
  const requirements={querySelector:()=>text('Requirements'),querySelectorAll:()=>[tribute]};
  const root={querySelectorAll:()=>[slots,requirements]};
  const h=harness({document:{querySelector:()=>root}});
  h.run("setCache('attunement',{schema:3,tributes:{Mountain:35000}}); captureVisibleAttunement()");
  assert.equal(h.run('getCache().attunement.tributes.Forest'),12100);
  assert.equal(h.run('getCache().attunement.tributes.Mountain'),35000);
  amount='Loading…';h.run('captureVisibleAttunement()');
  assert.equal(h.run('getCache().attunement.tributes.Forest'),12100);
});

test('Status warnings retain activity indicators and claims and react to setting changes',()=>{
  const h=harness();
  h.run(`readCurrentAction=()=>null; SourceAdapter.capture=()=>Object.assign(AppState.live,{action:null,loot:[],consumables:[],materials:[],masteryProgress:{},finiteQueue:null});
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    setCache('adventure',{schema:11,state:'Active',stateEndsAt:200000,mapName:'Forest',researchPoints:5000});
    setCache('attunement',{schema:3,selected:[{skill:'Mining'}],tributes:{Forest:10}});
    StatusRenderer.render(AppState);`);
  let html=h.run('AppState.ui.page.innerHTML');
  assert.match(html,/iw-resource-warning-text.*Low RP: 5,000/);
  assert.match(html,/Adventure in progress/);
  assert.match(html,/aria-label="Forest Tribute: 10 \(low\)"/);
  assert.match(html,/data-collect-attunement/);
  h.run('setWarningPrefs({researchPoints:0,tribute:0});StatusRenderer.render(AppState)');
  html=h.run('AppState.ui.page.innerHTML');
  assert.doesNotMatch(html,/iw-resource-warning-text/);
  assert.match(html,/Adventure in progress/);
});
