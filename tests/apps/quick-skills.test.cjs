const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

// A small browser boundary: the feature renders real markup and receives real
// delegated user events. Native controls execute the inspected stop/start flow.
function setup(options = {}) {
  const listeners = {}, nodes = new Map(), calls = [], subscriptions = [], tasks = [];
  let h, now = 100000, amountModal = false, quantity = null, frameRuntime, frameWindow;
  const document = {
    activeElement: null, hidden: false,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    createElement() { return element(); },
    querySelector(selector) {
      if (selector === 'nav-component .nav') return wrapper;
      if (selector.startsWith('#')) return nodes.get(selector.split(' ')[0].slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) { return selector === 'nav-component .scroll > button' ? nav : []; },
    body: { appendChild(node) { nodes.set(node.id, node); node.isConnected = true; } }
  };
  function element() {
    return { innerHTML: '', style: { setProperty() {} }, dataset: {}, hidden: false,
      setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; },
      appendChild(node) { document.body.appendChild(node); node.parentElement = this; },
      querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; },
      remove() { nodes.delete(this.id); this.isConnected = false; }, focus() { document.activeElement = this; }
    };
  }
  const wrapper = { appendChild(node) { document.body.appendChild(node); node.parentElement = this; } };
  const names = ['Taming', 'Woodcutting', 'Mining', 'Smelting', 'Smithing', 'Enchanting', 'Farming', 'Alchemy', 'Fishing', 'Cooking', 'Delving', 'Imbuing', 'Exploring', 'One-handed', 'Two-handed', 'Ranged', 'Defense'];
  const ids = ['15', '1', '2', '3', '4', '11', '13', '12', '9', '10', '5', '16', '17', '6', '7', '14', '8'];
  const nav = names.map((name, index) => ({ querySelector: () => ({ textContent: name }), click() { calls.push(['navigate', ids[index]]); h.context.location.pathname = `/skill/${ids[index]}/action/native-target`; } }));
  class Observable {
    constructor(subscribe) { this.run = subscribe; }
    subscribe(observer) { return this.run(observer); }
  }
  const metadata = {
    '101': { id: '101', name: 'Copper Rock', drops: [{ id: 'ore' }] },
    '102': { id: '102', name: 'Oak Tree', drops: [{ id: 'wood' }] },
    '103': { id: '103', name: 'Copper Sword', materials: [{ id: 'ore', amount: 2 }], metalParts: 3, drops: [{ id: 'sword' }] },
    '104': { id: '104', name: 'Forest Beast', monsterId: '1', drops: [{ id: 'bone' }] },
    '105': { id: '105', name: 'Chilli', materials: [{ id: 'seeds', amount: 1 }, { id: 'compost', amount: 8 }], drops: [{ id: 'chilli' }] }
  };
  let server = { displayName: 'Player', isSolo: false, inventory: { ore: { amount: 100 }, sword: { amount: options.owned || 0 } }, metalParts: 60, action: { skillId: '2', actionId: '101' } };
  function runtime() {
    const rt = {
      state: { user: structuredClone(server), isSolo: server.isSolo, syncUser(user) { this.user = user; } },
      action: { actionLoot: { ore: { amount: 12 } }, handleActionSync() {} },
      automations: { handleAutomationSync() {} }, expedition: { handleExpeditionSync() {} }, zone: { run: task => task() },
      actionCatalog: metadata, skillCatalog: Object.fromEntries(ids.map((id, i) => [id, { id, name: names[i] }])), skillOrder: ids,
      catalog: { ore: { name: 'Copper Ore', image: 'items/ore.png' }, sword: { name: 'Copper Sword', image: 'items/sword.png' } },
      craftTime(user, skill, recipe, amount) { assert.equal(this.user, user); return { seconds: (amount || 1) * 10 }; },
      craftLimit(user, recipe) { return Math.min(Math.floor(user.inventory.ore.amount / recipe.materials[0].amount), Math.floor(user.metalParts / recipe.metalParts)); },
      firebase: {
        async stopAction() {
          calls.push(['stop']);
          return new Observable(observer => {
            subscriptions.push('stop');
            if (options.stopFailure) observer.error(Error('Collection rejected'));
            else { server = { ...server, action: null }; observer.next(structuredClone(server)); observer.complete(); }
            return { unsubscribe() {} };
          });
        },
        async startAction(skillId, actionId, amount, coinCraft, useContracts) {
          calls.push(['start', skillId, actionId, amount, coinCraft, useContracts]);
          return new Observable(observer => {
            subscriptions.push('start');
            if (options.timeout) return { unsubscribe() {} };
            if (options.startFailure) observer.error(Error('Start rejected'));
            else {
              const action = options.wrongTarget ? { skillId: '14', actionId: '104' } : { skillId, actionId, amount };
              server = { ...server, action };
              observer.next({ action, challenge: {} }); observer.complete();
            }
            return { unsubscribe() {} };
          });
        },
        async getUser() {
          calls.push(['sync']);
          return new Observable(observer => {
            if (options.syncFailure) observer.error(Error('Offline'));
            else { observer.next({ user: structuredClone(server), time: 100000 }); observer.complete(); }
            return { unsubscribe() {} };
          });
        }
      }
    };
    return rt;
  }
  const main = runtime();
  h = harness({ document, setTimeout: (task, ms) => ms <= 200 ? Promise.resolve().then(() => { now += ms; h.time(now); task(); }) : setTimeout(task, ms), clearTimeout, window: {}, history: { replaceState() {} }, location: { pathname: options.route || '/status', search: '', hash: '' } });
  h.context.findNativeSyncRuntime = target => target === frameWindow ? frameRuntime : main;
  // Only toast DOM is omitted; the real recap data remains in AppState.
  h.context.renderActionToasts = () => null;
  h.context.withPage = async (route, selector, task) => {
    calls.push(['frame', route]);
    frameRuntime = runtime();
    if (options.frameOwner) frameRuntime.state.user.displayName = options.frameOwner;
    frameWindow = { location: { pathname: route }, HTMLInputElement: class {}, Event: class {} };
    const [, skillId, actionId] = route.match(/skill\/(\d+)\/action\/(\d+)/);
    const crafting = ['3', '4', '11', '12', '10', '16'].includes(skillId);
    const current = () => frameRuntime.state.user.action?.skillId === skillId && frameRuntime.state.user.action?.actionId === actionId;
    const consume = async response => new Promise((resolve, reject) => response.subscribe({ next: resolve, error: reject, complete() {} }));
    const stop = async () => {
      const value = await consume(await frameRuntime.firebase.stopAction());
      frameRuntime.state.user = value;
      frameRuntime.action.actionLoot = {};
    };
    const start = async () => {
      if (frameRuntime.state.user.action) await stop();
      const value = await consume(await frameRuntime.firebase.startAction(skillId, actionId, crafting ? quantity : undefined, true, false));
      frameRuntime.state.user = { ...frameRuntime.state.user, action: value.action };
    };
    const actionButton = { textContent: 'Gather', disabled: !!options.unavailable, click() { tasks.push(start().catch(() => {})); } };
    const stopButton = { textContent: 'Stop & Loot', disabled: false, click() { tasks.push(stop().catch(() => {})); } };
    const amountButton = { textContent: 'Amount', disabled: !!options.unavailable, click() { calls.push(['amount-dialog']); amountModal = true; } };
    const submit = { textContent: 'Craft', disabled: false, matches: () => false, click() { calls.push(['quantity-submit', quantity]); tasks.push(start().catch(() => {})); } };
    const input = { set value(value) { quantity = Number(value); }, dispatchEvent() {} };
    const doc = {
      querySelector(selector) {
        if (selector.includes('input[name="quantity"]')) return amountModal ? input : null;
        if (selector.includes('button.action-start')) return current() ? stopButton : actionButton;
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes('modal-component form.actions')) return amountModal ? [submit] : [];
        if (selector.includes('button.action-stop')) return current() ? [stopButton] : [];
        if (selector.includes('button.action-start')) return current() ? [] : crafting ? [amountButton] : [actionButton];
        return [];
      }
    };
    if (options.noReceiptDetails) delete frameRuntime.action.actionLoot;
    if (options.zeroRewards) frameRuntime.action.actionLoot = {};
    if (options.finiteLoot) frameRuntime.action.actionLoot = { sword: { amount: 4 } };
    try { return await task(doc, frameWindow); }
    finally { calls.push(['frame-removed']); }
  };
  h.context.installEventDelegation();
  function render() { h.run('StatusRenderer.render(AppState)'); }
  function panel() { return nodes.get('iw-quick-skills-panel')?.innerHTML || ''; }
  function controls() { return nodes.get('iw-quick-controls')?.innerHTML || ''; }
  function click(attribute, value = '') {
    const source = attribute === 'data-quick-skills' || attribute === 'data-quick-loot' ? controls() : panel();
    const tag = [...source.matchAll(/<(?:button|li)\b([^>]*)>/g)].find(match => match[1].includes(`${attribute}${value ? `="${value}"` : ''}`));
    assert.ok(tag, `Rendered control ${attribute}=${value}`);
    if (/(?:^|\s)disabled(?:\s|$)/.test(tag[1])) return;
    const key = attribute.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const target = { dataset: { [key]: value }, disabled: false, closest: selector => selector.includes(`[${attribute}]`) ? target : null };
    for (const handler of listeners.click) handler({ target, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} });
  }
  async function until(predicate) { for (let i = 0; i < 500; i++) { if (predicate()) return; await Promise.resolve(); } assert.fail('Workflow did not reach expected state: ' + JSON.stringify({calls, subscriptions, now, message:h.run('AppState.ui.quickSkills.message'), sync:h.run('AppState.ui.nativeSync')})); }
  const busy = () => h.run('AppState.ui.quickSkills.busy');
  const lastToast = () => h.run('AppState.ui.actionToasts.at(-1)');
  function submit(amount, { reuse = false, save = false, mode = 'craft' } = {}) {
    assert.match(panel(), /data-quick-amount-form/);
    const form = { elements: { amount: { value: String(amount) }, reuse: { checked: reuse }, save: { checked: save } }, matches: selector => selector === '[data-quick-amount-form]', querySelector: () => ({}) };
    if (mode === 'craft') for (const handler of listeners.submit) handler({ target: form, preventDefault() {} });
    else {
      const target = { dataset: { quickAmountChoice: mode }, closest: selector => selector === 'form' ? form : selector === '[data-quick-amount-choice]' ? target : null };
      for (const handler of listeners.click) handler({ target, preventDefault() {} });
    }
  }
  function learn(skillId, actionId, amount) { main.state.user.action = { skillId, actionId, amount }; render(); }
  function current(skillId, actionId, amount) { server = { ...server, action: skillId ? { skillId, actionId, amount } : null }; main.state.user = structuredClone(server); render(); }
  render();
  return { h, main, calls, subscriptions, render, panel, controls, click, until, busy, lastToast, submit, learn, current, nodes, document, listeners,
    frame: () => frameRuntime, saved: () => JSON.parse(h.storage.get('iw-status-quick-skills-v1:["Player",false]') || '{}') };
}

test('shared controls remain available on Status and native pages, including compact crafting, combat and idle', () => {
  for (const route of ['/status', '/inventory', '/skill/4/action/103']) {
    const f = setup({ route });
    for (const [skillName, finiteQueue, isCombat] of [['Mining', null, false], ['Smithing', { time: '1h', total: 20, completed: 4 }, false], ['Defense', null, true], ['', null, false]]) {
      f.h.context.fixture = { action: skillName ? { name: 'Fixture', skillName, isCombat, combatants: [] } : null, loot: [{ name: 'Ore', image: '/ore.png', amount: 1 }], consumables: [], materials: [], masteryProgress: {}, finiteQueue };
      f.h.context.fixtureSlot = { appendChild(node) { f.nodes.set(node.id, node); node.parentElement = this; } };
      f.h.run(`SourceAdapter.capture = () => Object.assign(AppState.live, fixture); AppState.ui.page = { hidden:false, innerHTML:'', style:{ setProperty(){} }, querySelector(selector){return selector === '[data-quick-controls-slot]' && this.innerHTML.includes('data-quick-controls-slot') ? fixtureSlot : null;} };`);
      f.render();
      assert.match(f.controls(), /Quick Loot/);
      assert.match(f.controls(), /data-quick-skills/);
      assert.equal(f.nodes.get('iw-quick-controls').parentElement, f.h.context.fixtureSlot);
      assert.doesNotMatch(f.h.run('AppState.ui.page.innerHTML'), /iw-render-error/);
      if (skillName === 'Smithing') assert.doesNotMatch(f.h.run('AppState.ui.page.innerHTML'), /iw-loot-card/);
    }
  }
});

test('first use learns actual running actions, keeps native order and navigates Taming without mutation', () => {
  const f = setup();
  f.click('data-quick-skills');
  assert.match(f.panel(), /Copper Rock/);
  assert.match(f.panel(), />Current<\/button>/);
  assert.match(f.panel(), /No last action yet/);
  assert.ok(f.panel().indexOf('Taming') < f.panel().indexOf('Woodcutting'));
  assert.ok(f.panel().indexOf('Exploring') < f.panel().indexOf('One-handed'));
  f.click('data-quick-page', '15');
  assert.deepEqual(f.calls, [['navigate', '15']]);
  assert.equal(f.saved().last['15'], undefined);
  assert.equal(f.saved().last['2'].actionId, '101');
});

test('explicit Start uses one native switch with automation off, confirms exact target and preserves route', async () => {
  const f = setup({ route: '/inventory' });
  f.learn('1', '102'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '1');
  await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'stop').length, 1);
  assert.equal(f.main.state.user.action.actionId, '102');
  assert.equal(f.h.context.location.pathname, '/inventory');
  assert.equal(f.lastToast().title, 'Started Oak Tree');
  assert.equal(f.lastToast().metrics[0].value, '12');
  assert.equal(f.panel(), '');
  assert.equal(f.calls.at(-2)[0], 'frame-removed');
});

test('finite actions prompt before mutation; cancellation leaves the current action and configured amount untouched', async () => {
  const f = setup();
  f.learn('4', '103'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), /<span>Craftable<\/span><b>20<\/b>/); // secondary resource is limiting
  f.click('data-quick-close'); await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, []);
  assert.equal(f.main.state.user.action.actionId, '101');
  assert.deepEqual(f.saved().amounts, {});
});

test('Farming with material costs has no configured amount control', () => {
  const f = setup();
  f.learn('13', '105'); f.current('2', '101');
  f.click('data-quick-skills');
  assert.doesNotMatch(f.panel(), /data-quick-edit="13"/);
  assert.equal(f.saved().last['13'].finite, false);
});

test('saved gathering history with the old finite flag resumes without a quantity prompt', async () => {
  const f = setup();
  f.h.storage.set('iw-status-quick-skills-v1:["Player",false]', JSON.stringify({ version: 1,
    last: { 13: { skillId: '13', actionId: '105', name: 'Chilli', finite: true } },
    amounts: { '13:105': { amount: 50, reuse: true } } }));
  f.h.run('AppState.ui.quickSkills.owner=null');
  f.render(); f.click('data-quick-skills');
  assert.doesNotMatch(f.panel(), /data-quick-edit="13"|50 configured/);
  f.click('data-quick-resume', '13');
  await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Started Chilli');
  assert.equal(f.main.state.user.action.skillId, '13');
  assert.equal(f.calls.some(call => ['amount-dialog', 'quantity-submit'].includes(call[0])), false);
  assert.equal(f.calls.find(call => call[0] === 'start')[3], undefined);
});

// Status reads the native skill page hidden underneath it. Updating the game
// services alone leaves that page on the previous, now idle action.
function attachStatusSource(f) {
  let selected = { ...f.main.state.user.action };
  const nativePage = { tagName: 'SKILL-PAGE', dataset: {}, style: { display: 'none' } };
  const page = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } };
  const wrapper = { children: [nativePage, page] };
  const originalQuery = f.document.querySelector.bind(f.document);
  const text = value => ({ textContent: value });
  const active = () => selected.skillId === f.main.state.user.action?.skillId && selected.actionId === f.main.state.user.action?.actionId;
  const card = { querySelector(selector) {
    if (selector === ':scope > .bars .fill') return active() ? { style: { width: '42%' } } : null;
    if (selector === ':scope > .header > .name') return text(f.main.actionCatalog[selected.actionId].name);
    return null;
  } };
  const tracker = { querySelector(selector) { return selector === '.header .name' ? text(f.main.skillCatalog[selected.skillId].name) : null; } };
  f.document.querySelector = selector => {
    if (selector === 'app-component > .scroll > .padding > .wrapper') return wrapper;
    if (selector === 'skill-page action-component > .card') return card;
    if (selector === 'skill-page tracker-component .skill') return tracker;
    if (selector === 'skill-page action-component > .card .bars .fill, skill-page combat-component .interface.monster, skill-page combat-component > .card') return active() ? {} : null;
    return originalQuery(selector);
  };
  f.main.router = { async navigateByUrl(route, options) {
    f.calls.push(['view', route, options]);
    assert.equal(options.skipLocationChange, true);
    const [, skillId, actionId] = route.match(/skill\/(\d+)\/action\/(\d+)/);
    selected = { skillId, actionId };
    return true;
  } };
  f.h.context.statusSourcePage = page;
  f.h.run(`AppState.ui.page = statusSourcePage; AppState.ui.previousUrl = '/skill/2/action/101';`);
  return page;
}

test('starting Chilli refreshes the live Status source after the confirmed switch', async () => {
  const f = setup();
  f.learn('13', '105'); f.current('2', '101');
  const page = attachStatusSource(f);
  f.render();
  assert.match(page.innerHTML, /Copper Rock/);
  f.click('data-quick-skills'); f.click('data-quick-resume', '13');
  await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Started Chilli');
  assert.equal(f.main.state.user.action.actionId, '105');
  assert.doesNotMatch(page.innerHTML, /No action in progress/);
  assert.match(page.innerHTML, /Chilli/);
  assert.equal(f.h.run('AppState.live.action.skillName'), 'Farming');
  assert.equal(f.h.run('AppState.live.action.actionId'), '105');
  assert.equal(f.h.run('AppState.live.action.progress'), 42);
  assert.equal(f.h.context.location.pathname, '/status');
  assert.equal(f.h.run('AppState.ui.previousUrl'), '/skill/13/action/105');
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
});

test('a failed live view refresh preserves the confirmed start and reports a separate warning', async () => {
  const f = setup();
  f.learn('13', '105'); f.current('2', '101');
  attachStatusSource(f);
  f.main.router.navigateByUrl = async () => false;
  f.click('data-quick-skills'); f.click('data-quick-resume', '13');
  await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Started Chilli');
  assert.match(f.lastToast().warning, /Live action view refresh failed/);
  assert.equal(f.main.state.user.action.actionId, '105');
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
});

test('a quick start on another native page refreshes game state without replacing that page', async () => {
  const f = setup({ route: '/inventory' });
  f.learn('13', '105'); f.current('2', '101');
  const page = attachStatusSource(f);
  page.hidden = true;
  f.click('data-quick-skills'); f.click('data-quick-resume', '13');
  await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Started Chilli');
  assert.equal(f.calls.some(call => call[0] === 'view'), false);
  assert.equal(f.h.context.location.pathname, '/inventory');
});

test('leaving Status during source refresh is respected', async () => {
  const f = setup();
  f.learn('13', '105'); f.current('2', '101');
  const page = attachStatusSource(f);
  f.main.router.navigateByUrl = async () => {
    page.hidden = true;
    f.h.context.location.pathname = '/inventory';
    return false;
  };
  f.click('data-quick-skills'); f.click('data-quick-resume', '13');
  await f.until(() => !f.busy());
  assert.equal(f.h.context.location.pathname, '/inventory');
  assert.equal(page.hidden, true);
  assert.equal(f.lastToast().title, 'Started Chilli');
  assert.equal(f.lastToast().warning, '');
  assert.equal(f.h.run('AppState.ui.previousUrl'), '/skill/2/action/101');
});

test('Quick Loot continues gathering with material costs without a quantity', async () => {
  const f = setup();
  f.h.storage.set('iw-stats-automation-enabled', 'true');
  f.current('13', '105');
  f.click('data-quick-loot'); await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Loot collected — action continued');
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
  assert.equal(f.calls.some(call => ['amount-dialog', 'quantity-submit'].includes(call[0])), false);
});

test('closing Skills while a native page is preparing cancels the pending Start', async () => {
  const f = setup();
  f.learn('1', '102'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '1'); f.click('data-quick-close');
  await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, []);
  assert.equal(f.main.state.user.action.actionId, '101');
  assert.equal(f.panel(), '');
});

test('Defense starts with its explicit skill identity even for a shared combat target', async () => {
  const f = setup();
  f.learn('8', '104'); f.current('14', '104');
  f.click('data-quick-skills'); f.click('data-quick-resume', '8');
  await f.until(() => !f.busy());
  assert.equal(f.main.state.user.action.skillId, '8');
  assert.equal(f.main.state.user.action.actionId, '104');
  assert.equal(f.lastToast().summary, 'Defense');
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
});

test('Quick Loot stays visible with clear disabled reasons and respects its automation setting', () => {
  const f = setup();
  assert.match(f.controls(), /Enable automation to use Quick Loot/);
  f.click('data-quick-loot'); assert.deepEqual(f.calls, []);
  f.h.storage.set('iw-stats-automation-enabled', 'true');
  f.current(null); assert.match(f.controls(), /No current action/);
  f.current('2', '101'); f.main.action.actionLoot = {}; f.render();
  assert.match(f.controls(), /Nothing to collect/);
});

test('quantity submit, saved reuse, edit, shortage and native options stay scoped to the recipe', async () => {
  const f = setup();
  f.learn('4', '103'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), /name="reuse" checked/);
  assert.doesNotMatch(f.panel(), /<details|<summary/);
  f.submit(10, { reuse: true }); await f.until(() => !f.busy());
  assert.deepEqual(f.calls.find(call => call[0] === 'start'), ['start', '4', '103', 10, true, false]);
  assert.ok(f.calls.some(call => call[0] === 'quantity-submit'));
  assert.deepEqual(f.saved().amounts['4:103'], { amount: 10, reuse: true });
  f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  await f.until(() => !f.busy());
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 2);
  f.current('2', '101'); f.click('data-quick-skills'); f.click('data-quick-edit', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  f.submit(15, { reuse: true }); await f.until(() => !f.busy());
  assert.equal(f.saved().amounts['4:103'].amount, 15);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 2);
  f.click('data-quick-resume', '4');
  await f.until(() => f.frame() && f.busy());
  f.frame().state.user.metalParts = 12;
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), /configured amount exceeds/);
  f.submit(3); await f.until(() => !f.busy());
  assert.equal(f.saved().amounts['4:103'].amount, 15);
  assert.equal(f.calls.filter(call => call[0] === 'start').at(-1)[3], 3);
});

test('history survives reload without repeated writes and remains isolated by character and mode', () => {
  const f = setup();
  let writes = 0;
  const setItem = f.h.context.localStorage.setItem;
  f.h.context.localStorage.setItem = (key, value) => { writes++; setItem(key, value); };
  f.render(); f.render();
  assert.equal(writes, 0);
  f.main.state.user.action = null;
  f.h.run('AppState.ui.quickSkills.owner=null; AppState.ui.quickSkills.data=null'); f.render();
  f.click('data-quick-skills'); assert.match(f.panel(), /Copper Rock/);
  f.main.state.user.displayName = 'Other'; f.render();
  assert.doesNotMatch(f.panel(), /Copper Rock/);
  f.main.state.user.displayName = 'Player'; f.main.state.user.isSolo = true; f.main.state.isSolo = true; f.render();
  assert.doesNotMatch(f.panel(), /Copper Rock/);
  delete f.main.state.user.displayName; f.render();
  assert.match(f.panel(), /Character/);
  assert.equal(writes, 0);
});

test('a character change during the amount prompt cancels without mutation or cross-character persistence', async () => {
  const f = setup();
  f.learn('4', '103'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  f.main.state.user.displayName = 'Other'; f.render();
  await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, []);
  assert.deepEqual(f.saved().amounts, {});
});

test('collection success followed by start failure retains confirmed rewards and reconciles idle state', async () => {
  const f = setup({ startFailure: true });
  f.learn('1', '102'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '1');
  await f.until(() => !f.busy());
  assert.equal(f.lastToast().title, 'Loot collected — action did not start');
  assert.equal(f.lastToast().metrics[0].value, '12');
  assert.equal(f.main.state.user.action, null);
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
});

test('confirmed starts keep missing details, valid zero rewards and synchronization errors distinct', async () => {
  for (const options of [{ noReceiptDetails: true }, { zeroRewards: true }, { syncFailure: true }]) {
    const f = setup(options);
    f.learn('1', '102'); f.current('2', '101');
    f.click('data-quick-skills'); f.click('data-quick-resume', '1');
    await f.until(() => !f.busy());
    assert.equal(f.lastToast().title, 'Started Oak Tree');
    if (options.noReceiptDetails) assert.match(f.lastToast().detail, /details unavailable/);
    if (options.zeroRewards) assert.match(f.lastToast().detail, /No rewards/);
    if (options.syncFailure) assert.match(f.lastToast().warning, /synchronization failed/);
    assert.equal(f.subscriptions.filter(method => method === 'start').length, 1);
  }
});

test('wrong target, rejection and timeout never report success or retry a start', async () => {
  for (const options of [{ wrongTarget: true }, { timeout: true }, { stopFailure: true }, { unavailable: true }, { frameOwner: 'Other' }]) {
    const f = setup(options);
    f.learn('8', '104'); f.current('2', '101');
    f.click('data-quick-skills'); f.click('data-quick-resume', '8');
    await f.until(() => !f.busy());
    assert.notEqual(f.lastToast().kind, 'success');
    assert.ok(f.subscriptions.filter(method => method === 'start').length <= 1);
    assert.equal(f.calls.at(-1)[0], options.unavailable || options.frameOwner ? 'frame-removed' : 'sync');
  }
});

test('busy resume blocks overlapping Quick Loot, other resumes and cache refreshes', async () => {
  const f = setup();
  f.h.storage.set('iw-stats-automation-enabled', 'true');
  f.learn('4', '103'); f.learn('1', '102'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  f.click('data-quick-loot'); f.click('data-quick-resume', '1');
  await f.h.context.refreshAllCachedData();
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.equal(f.calls.filter(call => call[0] === 'frame').length, 1);
  assert.deepEqual(f.subscriptions, []);
  f.click('data-quick-close'); await f.until(() => !f.busy());
});

test('Quick Loot resumes the finite queue remainder through native quantity submission', async () => {
  const f = setup({ finiteLoot: true });
  f.h.storage.set('iw-stats-automation-enabled', 'true');
  f.current('4', '103', 14);
  f.click('data-quick-loot'); await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, ['stop', 'start']);
  assert.equal(f.calls.find(call => call[0] === 'quantity-submit')[1], 10);
  assert.equal(f.lastToast().title, 'Loot collected — action continued');
  assert.equal(f.h.context.location.pathname, '/status');
});

test('Skills keeps its grid icon and every regional skill has an inline region, including Defense', () => {
  const f = setup();
  f.click('data-quick-skills');
  assert.match(f.controls(), /aria-label="Skills"/);
  assert.doesNotMatch(f.controls(), /iw-region-icon|mining.png/);
  const row = name => [...f.panel().matchAll(/<li class="iw-quick-skill[^]*?<\/li>/g)].map(match => match[0]).find(markup => markup.includes(`>${name}</a>`));
  for (const [name, region] of [['Mining', 'Mountain'], ['Woodcutting', 'Forest'], ['Imbuing', 'Ocean'], ['Farming', 'Forest']]) {
    assert.match(row(name), new RegExp(`aria-label="${region}"`));
    assert.doesNotMatch(row(name), /<small class="iw-quick-region"/);
  }
  assert.doesNotMatch(row('Taming'), /iw-region-icon/);
  for (const region of ['Forest', 'Mountain', 'Ocean']) assert.match(row('Defense'), new RegExp(`aria-label="${region}"`));
  f.main.regionCatalog = { 3: { name: 'Ocean' } };
  f.main.state.user.equipment = { weapon: 'ocean-weapon' };
  f.main.skillRegion = (user, skillId) => {
    assert.equal(skillId, '8');
    assert.equal(user.equipment.weapon, 'ocean-weapon');
    return '3';
  };
  f.learn('8', '104');
  assert.match(row('Defense'), /aria-label="Ocean"/);
  assert.doesNotMatch(row('Defense'), /aria-label="Forest"|aria-label="Mountain"/);
  assert.match(f.controls(), /aria-label="Skills"/);
  f.current(null);
  assert.match(f.controls(), /aria-label="Skills"/);
  assert.match(row('Mining'), /aria-label="Mountain"/);
});

test('invalid saved records cannot inject markup, create false targets or reuse invalid amounts', () => {
  const f = setup();
  f.h.storage.set('iw-status-quick-skills-v1:["Player",false]', JSON.stringify({ version: 1, last: { 1: { skillId: '1', actionId: '../bad', name: '<script>bad</script>' }, 4: { skillId: '4', actionId: '103', name: '<img src=x onerror=bad>', finite: true } }, amounts: { '4:103': { amount: -1, reuse: true } } }));
  f.h.run('AppState.ui.quickSkills.owner=null'); f.render(); f.click('data-quick-skills');
  assert.doesNotMatch(f.panel(), /<script>|<img src=x|data-quick-resume="1"/);
  assert.match(f.panel(), /&lt;img/);
  assert.doesNotMatch(f.panel(), /reuse on/);
});

test('native Quick Loot is shown only for the exact running skill and action', () => {
  const f = setup({ route: '/skill/4/action/103' });
  const nativeControls = () => f.h.run('renderQuickControls(quickRuntime(), true)');
  assert.doesNotMatch(nativeControls(), /data-quick-loot/, 'Browsing inactive crafting must not show Quick Loot');
  assert.match(nativeControls(), /data-quick-skills/);
  f.h.context.location.pathname = '/skill/2/action/101';
  assert.match(nativeControls(), /data-quick-loot/);
  f.h.context.location.pathname = '/skill/2/action/102';
  assert.doesNotMatch(nativeControls(), /data-quick-loot/, 'Another resource in the same skill is not the running action');
  f.current('8', '104');
  f.h.context.location.pathname = '/skill/14/action/104';
  assert.doesNotMatch(nativeControls(), /data-quick-loot/, 'The same enemy under another combat skill is not current');
  f.h.context.location.pathname = '/skill/8/action/104';
  assert.match(nativeControls(), /data-quick-loot/);
  f.current(null);
  assert.doesNotMatch(nativeControls(), /data-quick-loot/, 'Idle characters have no Quick Loot');
});

test('native Skills mounts after the whole Amount/Craft group, never between its buttons', () => {
  const f = setup({ route: '/skill/4/action/103' });
  const column = {}, group = { parentElement: column };
  const amount = { parentElement: group, closest: selector => selector === '.actions' ? group : null };
  const craft = { parentElement: group, closest: selector => selector === '.actions' ? group : null };
  const originalQuery = f.document.querySelector.bind(f.document);
  const originalAll = f.document.querySelectorAll.bind(f.document);
  f.document.querySelector = selector => selector === 'skill-page button.action-start, skill-page button.action-invalid' ? amount : originalQuery(selector);
  f.document.querySelectorAll = selector => selector === 'skill-page button.action-start, skill-page button.action-invalid' ? [amount, craft] : originalAll(selector);
  const mount = f.h.run('quickControlsMount()');
  assert.equal(mount.parent, column);
  assert.equal(mount.after, group);
});


test('native-style quantity choices show owned and native time, and submit Craft All or inventory Target quantities', async () => {
  for (const [mode, entered, expected] of [['all', '', 20], ['target', 12, 5], ['craft', 12, 12]]) {
    const f = setup({ owned: 7 });
    f.learn('4', '103'); f.current('2', '101');
    f.click('data-quick-skills'); f.click('data-quick-resume', '4');
    await f.until(() => f.panel().includes('data-quick-amount-form'));
    assert.match(f.panel(), /data-quick-owned>7</);
    assert.match(f.panel(), /data-quick-time>10s</);
    assert.match(f.panel(), /Craft All/);
    f.submit(entered, { mode });
    await f.until(() => !f.busy());
    assert.equal(f.calls.find(call => call[0] === 'quantity-submit')[1], expected);
    assert.equal(f.saved().amounts['4:103'].amount, expected);
  }
});

test('amount dialogs identify the recipe with its item icon and skill name', async () => {
  for (const edit of [false, true]) {
    const f = setup();
    f.learn('4', '103'); f.current('2', '101');
    f.click('data-quick-skills'); f.click(edit ? 'data-quick-edit' : 'data-quick-resume', '4');
    await f.until(() => f.panel().includes('data-quick-amount-form'));
    assert.match(f.panel(), /class="iw-guide-brand" src="\/assets\/items\/sword.png"/);
    assert.match(f.panel(), /Smithing · Copper Sword/);
    f.main.actionCatalog['103'].image = 'actions/sword.png';
    f.render();
    assert.match(f.panel(), /class="iw-guide-brand" src="\/assets\/actions\/sword.png"/);
    delete f.main.actionCatalog['103'].image;
    delete f.main.catalog.sword.image;
    f.render();
    assert.match(f.panel(), /class="iw-guide-brand" src="\/assets\/misc\/smithing.png"/);
    f.click('data-quick-close'); await f.until(() => !f.busy());
    assert.deepEqual(f.subscriptions, []);
  }
});

test('inventory Target rejects satisfied targets and shortages without starting or saving', async () => {
  const f = setup({ owned: 7 });
  f.learn('4', '103'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-resume', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
  for (const amount of [7, 6, 28]) {
    f.submit(amount, { mode: 'target' });
    assert.deepEqual(f.subscriptions, []);
    assert.deepEqual(f.saved().amounts, {});
    assert.equal(f.busy(), true);
  }
  f.click('data-quick-close'); await f.until(() => !f.busy());
});

test('skill XP progress uses native level thresholds and recipe rates without sharing the current action rate', () => {
  const f = setup();
  f.main.state.user.skills = { 2: { exp: 1250 }, 1: { exp: 1800 }, 4: { exp: 2000 } };
  f.main.skillLevel = xp => xp >= 2000 ? 3 : 2;
  f.main.skillLevelXp = level => ({ 2: 1000, 3: 2000, 4: 4000 })[level];
  f.main.skillEstimates = (user, skill, action) => {
    assert.equal(user, f.main.state.user);
    assert.equal(action, f.main.actionCatalog['101']);
    assert.equal(skill.id, '2');
    return { exp: 500 };
  };
  f.click('data-quick-skills');
  const progress = f.h.context.quickSkillProgress(f.main, { id: '2' }, { skillId: '2', actionId: '101' });
  assert.equal(progress.percent, 25);
  assert.equal(progress.remaining, 750);
  assert.equal(progress.seconds, 5400);
  assert.match(f.panel(), /250 \/ 1,000 XP/);
  assert.match(f.panel(), /Lv\. 3 in ~1h 30m/);
  const idle = f.h.context.quickSkillProgress(f.main, { id: '1' });
  assert.equal(idle.percent, 80);
  assert.equal(idle.seconds, null);
  const nextLevel = f.h.context.quickSkillProgress(f.main, { id: '4' });
  assert.equal(nextLevel.level, 3);
  assert.equal(nextLevel.percent, 0);
  assert.equal(nextLevel.needed, 2000);
  f.main.state.user.action = null;
  f.render();
  assert.match(f.panel(), /If started · Lv\. 3/);
});

test('missing XP, unavailable estimates and zero gains never invent progress or a next-level time', () => {
  const f = setup();
  f.main.skillLevel = () => 1;
  f.main.skillLevelXp = level => level === 1 ? 0 : 100;
  const skill = { id: '2' }, target = { skillId: '2', actionId: '101' };
  assert.equal(f.h.context.quickSkillProgress(f.main, skill, target), null);
  f.main.state.user.skills = { 2: { exp: 25 } };
  for (const rate of [0, -1, NaN, Infinity]) {
    f.main.skillEstimates = () => ({ exp: rate });
    const progress = f.h.context.quickSkillProgress(f.main, skill, target);
    assert.equal(progress.percent, 25);
    assert.equal(progress.seconds, null);
  }
  f.main.skillEstimates = () => { throw Error('Unavailable'); };
  assert.equal(f.h.context.quickSkillProgress(f.main, skill, target).seconds, null);
});
