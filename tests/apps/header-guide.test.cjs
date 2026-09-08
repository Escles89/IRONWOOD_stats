const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('header controls share one bar, preserve the native gold button and recover after replacement', () => {
  class Element {
    constructor(id = '') { this.id = id; this.children = []; this.parentElement = null; }
    setAttribute() {}
    appendChild(child) {
      if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child), 1);
      this.children.push(child); child.parentElement = this;
    }
    before(child) {
      const parent = this.parentElement;
      if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child), 1);
      parent.children.splice(parent.children.indexOf(this), 0, child); child.parentElement = parent;
    }
    after(child) {
      const parent = this.parentElement;
      if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child), 1);
      parent.children.splice(parent.children.indexOf(this) + 1, 0, child); child.parentElement = parent;
    }
    get previousElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1]; }
    querySelector(selector) {
      for (const child of this.children) {
        if ((selector === '.coins' && child.id === 'coins') || selector === '#' + child.id) return child;
        const match = child.querySelector(selector); if (match) return match;
      }
      return null;
    }
  }
  let header;
  const replaceHeader = () => {
    header = new Element();
    header.appendChild(new Element('iw-header-action-badges'));
    header.appendChild(new Element('coins'));
  };
  replaceHeader();
  const h = harness({ document: {
    querySelector: selector => selector === 'header-component > .header' ? header : header.querySelector(selector),
    createElement: () => new Element()
  } });
  for (let generation = 0; generation < 2; generation++) {
    const coins = header.querySelector('.coins');
    h.run("location.pathname='/inventory'; AppState.ui.page={hidden:true}; installHeaderTools()");
    const bar = header.querySelector('#iw-header-bar');
    const host = header.querySelector('#iw-header-tools');
    assert.deepEqual(bar.children.map(el => el.id), ['iw-header-action-badges', 'coins', 'iw-header-tools']);
    assert.equal(header.querySelector('.coins'), coins);
    assert.match(host.innerHTML, /data-guide-modal/);
    assert.match(host.innerHTML, /data-quest-modal/);
    h.context.installHeaderTools();
    assert.equal(header.querySelector('#iw-header-tools'), host);
    assert.equal(bar.children.length, 3);
    replaceHeader();
  }
});

test('settings update before the hidden Status page render guard', () => {
  const h = harness();
  h.run('globalThis.dialogRenders=0; renderGlobalDialog=()=>dialogRenders++; AppState.ui.page={hidden:true}; render()');
  assert.equal(h.run('dialogRenders'), 1);
});

test('guide examples share live badge markup without claim controls or live data bindings', () => {
  const h = harness();
  const html = h.context.renderGuide();
  for (const state of ['iw-mastery-badge achieved', 'iw-queue-warning sufficient', 'iw-queue-warning warning', 'iw-queue-warning urgent', 'iw-material-warning urgent', 'iw-revive-badge', 'iw-adventure-badge', 'iw-guild-trial-badge']) assert.ok(html.includes(state), state);
  assert.match(html, /aria-labelledby="iw-guide-title"/);
  assert.doesNotMatch(html, /data-collect-|data-run-challenge|data-live-/);
});

test('important header badges show at most activity, queue and materials, including an idle state', () => {
  const h = harness();
  const html = h.context.renderImportantActionBadges({ action:{skillName:'Cooking',reviveRemainingMs:2000}, queueWarning:'urgent',finiteQueue:{time:'5m'},materialWarning:'warning',materialWarningText:'Low ore' });
  assert.match(html,/revive-active/);
  assert.match(html,/iw-queue-warning urgent/);
  assert.match(html,/iw-material-warning warning/);
  assert.doesNotMatch(html,/iw-mastery-badge|iw-revive-badge|iw-combat-live/);
  assert.match(h.context.renderImportantActionBadges(null),/No action in progress/);
});

test('header snapshot follows the native action and projects a known queue across routes', () => {
  let nativePage = true, active = true, name = 'Pie';
  const shortcut = {textContent:'Pie Cooking',querySelector:selector=>({textContent:selector.includes('name')?name:'Cooking'})};
  const h = harness({ document:{querySelector:selector=>selector.startsWith('nav-component')?(active?shortcut:null):(nativePage?{}:null)} });
  h.run("readFiniteQueue=()=>({time:'11m'});readMaterials=()=>[{name:'Flour',available:200}]");
  assert.equal(h.context.readHeaderActionSummary().queueWarning,'warning');
  nativePage=false; h.time(220000);
  assert.equal(h.context.readHeaderActionSummary().queueWarning,'urgent');
  name='Bar';
  const changed=h.context.readHeaderActionSummary();
  assert.equal(changed.queueWarning,''); assert.equal(changed.materialWarning,'');
  active=false;
  assert.equal(h.context.readHeaderActionSummary(),null);
});


test('guide navigation targets a chapter without changing game routes or invoking controls', () => {
  const calls=[];
  const heading={dataset:{guideSection:'rows'},scrollIntoView(options){calls.push(['scroll',options.block]);},focus(options){calls.push(['focus',options.preventScroll]);}};
  const h=harness({document:{querySelector:()=>({querySelectorAll:()=>[heading]})}});
  h.context.navigateGuideSection('rows');
  assert.deepEqual(calls,[['scroll','start'],['focus',true]]);
  assert.equal(h.context.location.pathname,'/status');
  h.context.navigateGuideSection('not-a-chapter');
  assert.equal(calls.length,2);
});

test('visual guide has matching navigation targets and no executable example claims', () => {
  const h=harness();
  const html=h.context.renderGuide();
  for(const name of ['start','panels','icons','rows','data']) {
    assert.ok(html.includes(`data-guide-jump="${name}"`));
    assert.ok(html.includes(`id="iw-guide-${name}"`));
  }
  assert.match(html,/Example · frozen combat moment/);
  assert.match(html,/iw-guide-preview/);
  assert.match(html,/iw-guide-feature/);
  assert.doesNotMatch(html,/data-collect-|data-run-challenge|data-live-/);
});
