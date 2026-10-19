const test = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fixtures/quick-skills.cjs');

for (const input of ['pointer', 'keyboard']) for (const attribute of ['data-quick-resume', 'data-quick-edit']) {
  test(`${input} ${attribute}: an XP update between press and release must not swallow the click`, async () => {
    const f = setup();
    f.learn('4', '103'); f.current('2', '101');
    f.main.skillLevel = () => 1;
    f.main.skillLevelXp = level => level === 1 ? 0 : 1000;
    f.main.state.user.skills = {2:{exp:25}};
    f.click('data-quick-skills');
    const host = f.nodes.get('iw-quick-skills-panel');
    let markup = host.innerHTML, revision = 0;
    Object.defineProperty(host, 'innerHTML', {get:()=>markup,set:value=>{markup=value;revision++;}});
    const pressedAt = revision;
    const control = {dataset:{[attribute === 'data-quick-edit' ? 'quickEdit' : 'quickResume']:'4'}, disabled:false,
      closest(selector) { return selector.includes('#iw-quick-skills-panel') ? this : selector.includes(`[${attribute}]`) ? this : null; }};
    const down = input === 'pointer' ? 'pointerdown' : 'keydown';
    const up = input === 'pointer' ? 'pointerup' : 'keyup';
    for (const handler of f.listeners[down] || []) handler({type:down,key:' ',target:control,button:0,pointerId:1,preventDefault(){}});
    f.main.state.user.skills[2].exp = 30;
    f.render();
    assert.equal(revision, pressedAt, 'Live XP rendering detached the pressed button before its click');
    for (const handler of f.listeners[up] || []) handler({type:up,key:' ',target:control,button:0,pointerId:1});
    f.render();
    assert.equal(revision, pressedAt, 'Release must preserve the button until click');
    for (const handler of f.listeners.click) handler({type:'click',target:control,preventDefault(){},stopImmediatePropagation(){}});
    await f.until(()=>f.panel().includes('data-quick-amount-form'));
    assert.match(f.panel(), attribute === 'data-quick-edit' ? /Configured amount/ : /Start action/);
    f.click('data-quick-close'); await f.until(()=>!f.busy());
    assert.deepEqual(f.subscriptions, []);
  });
}

for (const end of ['cancel', 'missing click', 'character change']) {
  test(`panel resumes updating after ${end}`, () => {
    const f = setup(); f.click('data-quick-skills');
    const control = {closest:()=>control};
    f.h.context.holdQuickInteraction({type:'pointerdown',target:control,button:0});
    f.h.run("AppState.ui.quickSkills.message='Updated'");
    if (end === 'cancel') f.h.context.releaseQuickInteraction({type:'pointercancel'});
    if (end === 'missing click') {
      f.h.context.releaseQuickInteraction({type:'pointerup'});
      f.h.time(101001);
    }
    if (end === 'character change') f.main.state.user.displayName='Other';
    f.render();
    assert.equal(f.h.run('AppState.ui.quickSkills.interaction'), null);
    assert.match(f.panel(), end === 'character change' ? /Start a remembered action/ : /Updated/);
  });
}

function actionPanelFixture() {
  const f = setup();
  const panel = { isConnected: true, matches: selector => selector === '[data-action-skills]',
    closest: selector => selector === '[data-action-skills]' ? panel : null,
    focus() { f.document.activeElement = panel; }, click() { dispatch(panel); } };
  f.h.context.actionPanel = panel;
  f.h.run('AppState.ui.page = { hidden: true, contains: node => node === actionPanel };');
  function dispatch(target, options = {}) {
    const event = { type: 'click', target, button: 0, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {}, ...options };
    for (const handler of f.listeners.click) handler(event);
  }
  function child(tag = 'span', attribute = '', value = '') {
    const node = { dataset: attribute ? { [attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]: value } : {},
      closest(selector) {
        const choices = selector.split(',').map(value => value.trim());
        if (choices.includes(tag) || attribute && choices.includes(`[${attribute}]`)) return node;
        return choices.includes('[data-action-skills]') ? panel : null;
      }, matches() { return false; } };
    return node;
  }
  return { ...f, actionPanel: panel, dispatch, child };
}

test('Current Action background opens Skills without a gameplay request and restores panel focus', () => {
  const f = actionPanelFixture();
  f.dispatch(f.child('img'));
  assert.match(f.panel(), /Your last actions, ready when you are/);
  assert.equal(f.h.run('AppState.ui.quickSkills.trigger'), f.actionPanel);
  assert.deepEqual(f.calls, []);
  f.h.context.quickClose();
  assert.equal(f.document.activeElement, f.actionPanel);
});

test('Current Action keeps consumable, mastery and planner controls independent of Skills', () => {
  const f = actionPanelFixture(), opened = [];
  f.h.context.openConsumableOverview = category => opened.push(category);
  f.h.context.openMastery = () => opened.push('mastery');
  f.h.context.recipeOpenPlanner = () => opened.push('planner');
  for (const [attribute, value] of [['data-consumable-open', 'Food'], ['data-mastery-open', 'current'], ['data-recipe-open', '']]) {
    f.dispatch(f.child('button', attribute, value));
    assert.equal(f.h.run('AppState.ui.quickSkills.open'), false);
  }
  assert.deepEqual(opened, ['Food', 'mastery', 'planner']);
  for (const tag of ['a', 'button', 'input', 'select', 'textarea', 'summary', '[role="link"]', '[role="button"]', '[contenteditable]']) {
    f.dispatch(f.child(tag));
    assert.equal(f.h.run('AppState.ui.quickSkills.open'), false, tag);
  }
  assert.deepEqual(f.calls, []);
});

test('Current Action ignores selected text, modified clicks and guide examples', () => {
  const f = actionPanelFixture(), child = f.child();
  for (const options of [{ctrlKey:true}, {metaKey:true}, {altKey:true}, {shiftKey:true}, {button:1}, {defaultPrevented:true}]) {
    f.dispatch(child, options);
    assert.equal(f.h.run('AppState.ui.quickSkills.open'), false);
  }
  f.document.getSelection = () => ({ isCollapsed: false });
  f.dispatch(child);
  assert.equal(f.h.run('AppState.ui.quickSkills.open'), false);
  f.document.getSelection = () => ({ isCollapsed: true });
  f.dispatch({ closest: () => null });
  assert.equal(f.h.run('AppState.ui.quickSkills.open'), false);
  assert.doesNotMatch(f.h.context.renderGuide(), /data-action-skills/);
});

for (const key of ['Enter', ' ']) test(`Current Action supports ${key === ' ' ? 'Space' : key} without activating nested controls`, () => {
  const f = actionPanelFixture();
  const dispatchKey = target => {
    const event = {type:'keydown', key, target, preventDefault(){this.defaultPrevented=true;}};
    for (const handler of f.listeners.keydown) handler(event);
    return event;
  };
  dispatchKey(f.child('button'));
  assert.equal(f.h.run('AppState.ui.quickSkills.open'), false);
  assert.equal(dispatchKey(f.actionPanel).defaultPrevented, true);
  assert.match(f.panel(), /Your last actions, ready when you are/);
  f.h.context.quickClose();
  assert.equal(f.document.activeElement, f.actionPanel);
  assert.deepEqual(f.calls, []);
});
