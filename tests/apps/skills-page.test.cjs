const test = require('node:test');
const assert = require('node:assert/strict');
const setupQuick = require('../fixtures/quick-skills.cjs');

function setup() {
  const f = setupQuick({route:'/inventory'});
  const classes = () => {const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x)};};
  const native = {tagName:'INVENTORY-PAGE',style:{display:'flex'},dataset:{}};
  const status = {id:'iw-stats-page',hidden:true,style:{},dataset:{},classList:classes(),contains:()=>false,querySelector:()=>null};
  const wrapper = {children:[native,status],appendChild(node){this.children.push(node);f.document.body.appendChild(node);node.parentElement=this;}};
  f.document.getElementById = id => f.nodes.get(id) || null;
  f.nodes.set(status.id,status);
  const querySelector = f.document.querySelector;
  f.document.querySelector = selector => selector === 'app-component > .scroll > .padding > .wrapper' ? wrapper : querySelector(selector);
  f.h.context.history = {pushState(_state,_unused,path){f.h.context.location.pathname=path;},replaceState(_state,_unused,path){f.h.context.location.pathname=path;}};
  f.h.run('AppState.ui.page = null');
  f.h.context.statusPage = status;
  f.h.run('AppState.ui.page=statusPage; AppState.ui.previousUrl="/inventory"');
  f.h.run('captureVisibleCaches = setStatusHeader = syncHeaderActionBadges = () => {}; refreshAdventureSnapshot = refreshChallengesSnapshot = refreshTamingSnapshot = refreshAutomationsSnapshot = refreshGuildEventSnapshot = refreshGuildTrialSnapshot = () => {};');
  f.h.context.render = () => f.h.context.syncQuickSkills();
  return {...f,native,status,wrapper,classes};
}

test('Skills page renders the shared 16-skill list without modal semantics or dismiss controls', () => {
  const f=setup(); f.h.context.showSkillsPage();
  const page=f.h.run('AppState.ui.skillsPage');
  assert.equal(f.h.context.location.pathname,'/skills');
  assert.equal(page.hidden,false); assert.equal(f.status.hidden,true);
  assert.equal(f.native.style.display,'none');
  assert.equal((page.innerHTML.match(/<li class="iw-quick-skill/g)||[]).length,16);
  assert.doesNotMatch(page.innerHTML,/role="dialog"|aria-modal|data-quick-close|Open Taming/);
  assert.match(page.innerHTML,/iw-quick-rank/);
  assert.match(page.innerHTML,/iw-skills-plan-summary/);
  assert.match(page.innerHTML,/iw-skills-planner-panel/);
  assert.ok(page.innerHTML.indexOf('iw-skills-planner-panel') > page.innerHTML.lastIndexOf('<li class="iw-quick-skill'));
  assert.ok(page.innerHTML.indexOf('iw-skills-plan-summary') < page.innerHTML.indexOf('Woodcutting'));
  assert.equal(f.panel(),'');
});

test('Skills, Status and native navigation restore the correct page and original native display', () => {
  const f=setup();
  f.h.context.showSkillsPage();
  f.h.context.showStats();
  assert.equal(f.h.run('AppState.ui.skillsPage.hidden'),true);
  assert.equal(f.status.hidden,false);
  assert.equal(f.h.run('AppState.ui.previousUrl'),'/inventory');
  f.h.context.location.pathname='/skills'; f.h.context.restorePortalRoute();
  assert.equal(f.h.run('skillsPageVisible()'),true);
  f.h.context.location.pathname='/inventory'; f.h.context.restorePortalRoute();
  assert.equal(f.h.run('skillsPageVisible()'),false);
  assert.equal(f.native.style.display,'flex');
  f.h.context.showSkillsPage(); f.h.context.leaveStats();
  assert.equal(f.h.context.location.pathname,'/inventory');
  assert.equal(f.native.style.display,'flex');
});

for (const edit of [false,true]) test(`${edit?'Edit':'Start'} from Skills opens an amount dialog and returns to the page on cancel`, async () => {
  const f=setup(); f.learn('4','103'); f.current('2','101'); f.h.context.showSkillsPage();
  const target={dataset:edit?{quickEdit:'4'}:{quickResume:'4'},disabled:false,closest(selector){return selector.includes(edit?'[data-quick-edit]':'[data-quick-resume]')?this:null;}};
  for(const listener of f.listeners.click) listener({type:'click',target,preventDefault(){},stopImmediatePropagation(){}});
  await f.until(()=>f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), edit?/Configured amount/:/Start action/);
  assert.equal(f.h.run('skillsPageVisible()'),true);
  f.click('data-quick-close'); await f.until(()=>!f.busy());
  assert.equal(f.panel(),''); assert.equal(f.h.run('skillsPageVisible()'),true);
  assert.deepEqual(f.subscriptions,[]);
});

test('Skills navigation is inserted directly after Status once and uses the shared page', () => {
  const f=setup(); let inserted,handler;
  const name={textContent:''}; const icon={replaceWith(node){this.replacement=node;}};
  const button={classList:f.classes(),setAttribute(){},querySelector(selector){return selector==='.name'?name:icon;},addEventListener(_type,fn){handler=fn;}};
  f.h.context.statusButton={cloneNode(){return button;},after(node){inserted=node;f.nodes.set(node.id,node);}};
  f.h.run('AppState.ui.navButton=statusButton');
  f.h.context.installSkillsNav();
  assert.equal(inserted.id,'iw-skills-nav'); assert.equal(name.textContent,'Skills');
  assert.equal(icon.replacement.getAttribute('src'),'/assets/misc/tome-runic-wisdom.png');
  f.h.context.installSkillsNav();
  handler(); assert.equal(f.h.run('skillsPageVisible()'),true);
  assert.equal(button.classList.contains('active-link'),true);
});


test('queued native history sync skips only virtual portal routes and preserves other router calls', () => {
  const f=setup(), calls=[];
  const router={navigateToSyncWithBrowser(...args){calls.push({receiver:this,args});return 'native';}};
  f.h.context.installPortalHistoryGuard({router});
  const wrapped=router.navigateToSyncWithBrowser;
  f.h.context.installPortalHistoryGuard({router});
  assert.equal(router.navigateToSyncWithBrowser,wrapped);
  for(const path of ['/skills','/status','/skills?view=all','/status#top']) router.navigateToSyncWithBrowser(path,'popstate',{});
  assert.equal(calls.length,0);
  for(const [path,source] of [['/inventory','popstate'],['/skills-extra','popstate'],['/skills','imperative']]) {
    const state={navigationId:3};
    assert.equal(router.navigateToSyncWithBrowser(path,source,state),'native');
    assert.equal(calls.at(-1).receiver,router);
    assert.deepEqual(calls.at(-1).args,[path,source,state]);
  }
});
