const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

// A small browser boundary: the feature renders real markup and receives real
// delegated user events. Native controls execute the inspected stop/start flow.
function setup(options = {}) {
  const listeners = {}, nodes = new Map(), calls = [], subscriptions = [], tasks = [];
  let h, now = 100000, amountModal = false, quantity = null, frameRuntime, frameWindow, nativeDoc, nativePage;
  const document = {
    activeElement: null, hidden: false,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    createElement() { return element(); },
    querySelector(selector) {
      if (selector === 'skill-page') return nativeDoc;
      if (selector.startsWith('skill-page ')) return nativeDoc?.querySelector(selector);
      if (selector === 'nav-component .nav') return wrapper;
      if (selector.startsWith('#')) return nodes.get(selector.split(' ')[0].slice(1)) || null;
      return null;
    },
    querySelectorAll(selector) { if (selector === 'skill-page button.action-start, skill-page button.action-invalid') return []; return selector.startsWith('skill-page ') ? nativeDoc?.querySelectorAll(selector) || [] : selector === 'nav-component .scroll > button' ? nav : []; },
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
      state: { loadingApp: false, syncingData: false, appActive: true, user: structuredClone(server), isSolo: server.isSolo, syncUser(user) { this.user = user; } },
      action: { actionLoading: false, actionLoot: server.action ? structuredClone(options.completedLoot || { ore: { amount: 12 } }) : {}, handleActionSync() { options.onActionSync?.(); } },
      automations: { handleAutomationSync() {} }, expedition: { handleExpeditionSync() {} }, zone: { run: task => task() },
      actionCatalog: metadata, skillCatalog: Object.fromEntries(ids.map((id, i) => [id, { id, name: names[i] }])), skillOrder: ids,
      catalog: { ore: { name: 'Copper Ore', image: 'items/ore.png' }, sword: { name: 'Copper Sword', image: 'items/sword.png' } },
      craftTime(user, skill, recipe, amount) { assert.equal(this.user, user); return { seconds: (amount || 1) * 10 }; },
      craftLimit(user, recipe) { return Math.min(Math.floor(user.inventory.ore.amount / recipe.materials[0].amount), Math.floor(user.metalParts / recipe.metalParts)); },
      firebase: {
        async stopAction() {
          calls.push(['stop']);
          await options.beforeCollectionResponse?.();
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
          await options.beforeSync?.();
          return new Observable(observer => {
            if (options.syncFailure || options.postStartSyncFailure && calls.some(call => call[0] === 'start')) observer.error(Error('Offline'));
            else { observer.next({ user: structuredClone(options.remoteUser?.(server) || server), time: 100000 }); observer.complete(); }
            return { unsubscribe() {} };
          });
        }
      }
    };
    return rt;
  }
  const main = runtime();
  const members = { '1': ['102'], '2': ['101'], '4': ['103'], '6': ['104'], '7': ['104'], '8': ['104'], '14': ['104'], '13': ['105'] };
  for (const [id, skill] of Object.entries(main.skillCatalog)) skill.actions = (members[id] || []).map(id => ({ id }));
  h = harness({ document, setTimeout: (task, ms) => ms <= 200 ? Promise.resolve().then(() => { now += ms; h.time(now); task(); }) : setTimeout(task, ms), clearTimeout, HTMLInputElement: class {}, Event: class {}, window: {}, history: { replaceState() {} }, location: { pathname: options.route || '/status', search: '', hash: '' } });
  h.context.findNativeSyncRuntime = target => frameWindow && target === frameWindow ? frameRuntime : main;
  // Only toast DOM is omitted; the real recap data remains in AppState.
  h.context.renderActionToasts = () => null;
  function buildNativePage(route, rt) {
    frameRuntime = rt;
    frameWindow = { location: { pathname: route }, HTMLInputElement: class {}, Event: class {} };
    const [, skillId, actionId] = route.match(/skill\/(\d+)\/action\/(\d+)/);
    const crafting = ['3', '4', '11', '12', '10', '16'].includes(skillId);
    const current = () => rt.state.user.action?.skillId === skillId && rt.state.user.action?.actionId === actionId;
    const consume = async response => new Promise((resolve, reject) => response.subscribe({ next: resolve, error: reject, complete() {} }));
    rt.action.firebaseSvc = rt.firebase;
    rt.action.handleStopAction = async function() {
      this.actionLoading = true;
      const response = await this.firebaseSvc.stopAction();
      let value;
      try { value = await consume(response); }
      catch { this.actionLoading = false; return false; }
      rt.state.user = value;
      this.actionLoot = {};
      this.actionLoading = false;
      await options.afterCollection?.(rt);
      return true;
    };
    const page = {
      skillId, actionId, actionSvc: rt.action, firebaseSvc: rt.firebase,
      canStart$: { subscribe(next) { next(!options.unavailable); return {unsubscribe() {}}; } },
      uniqueCraftable$: { subscribe(next) { next(!options.uniqueOwned); return {unsubscribe() {}}; } },
      openAmountModal() { calls.push(['amount-dialog']); amountModal = true; },
      async handleStartAction() {
        this.loading = true;
        options.beforeNativeStart?.(rt);
        if (rt.state.user.action && !await this.actionSvc.handleStopAction()) { this.loading = false; return; }
        const response = await this.firebaseSvc.startAction(skillId, actionId, crafting ? quantity : undefined, true, false);
        let value;
        try { value = await consume(response); }
        catch { this.loading = false; return; }
        if (options.nativePostStartFailure) throw new Error('Native view failed after confirmed response');
        rt.state.user = { ...rt.state.user, action: value.action };
        this.loading = false;
      }
    };
    const actionButton = { textContent: 'Gather', disabled: !!options.unavailable, click() { tasks.push(page.handleStartAction().catch(() => {})); } };
    const stopButton = { textContent: 'Stop & Loot', disabled: false, click() { tasks.push(rt.action.handleStopAction().catch(() => {})); } };
    const amountButton = { textContent: 'Amount', disabled: !!options.unavailable, click() { page.openAmountModal(); } };
    const submit = { textContent: 'Craft', disabled: false, matches: () => false, click() { calls.push(['quantity-submit', quantity]); tasks.push(page.handleStartAction().catch(() => {})); } };
    for (const control of [actionButton, stopButton, amountButton, submit]) control.closest = () => null;
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
    return { doc, page };
  }
  h.context.withPage = async (route, selector, task) => {
    calls.push(['frame', route]);
    const rt = runtime(); rt.skillCatalog = main.skillCatalog;
    if (options.frameOwner) rt.state.user.displayName = options.frameOwner;
    const { doc } = buildNativePage(route, rt);
    try { return await task(doc, frameWindow); }
    finally { calls.push(['frame-removed']); }
  };
  main.router = { url: '/skill/2/action/101', async navigateByUrl(route) {
    calls.push(['route', route]); this.url = route;
    const result = buildNativePage(route, main); nativeDoc = result.doc; nativePage = result.page;
    return true;
  } };
  main.outletContexts = { getContext: () => ({ outlet: { get component() { return nativePage; } } }) };
  h.context.installEventDelegation();
  function render() { h.run('StatusRenderer.render(AppState)'); }
  function panel() { return nodes.get('iw-quick-skills-panel')?.innerHTML || ''; }
  function controls() { return nodes.get('iw-quick-controls')?.innerHTML || ''; }
  function click(attribute, value = '') {
    const source = attribute.startsWith('data-planned-') ? h.run('renderPlannedActionCard()') : attribute === 'data-quick-skills' || attribute === 'data-quick-loot' ? controls() : panel();
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
  function current(skillId, actionId, amount) { server = { ...server, action: skillId ? { skillId, actionId, amount, startDate: '2026-09-27T06:00:00Z' } : null }; main.state.user = structuredClone(server); if (!skillId) main.action.actionLoot = {}; render(); }
  render();
  return { h, main, calls, subscriptions, render, panel, controls, click, until, busy, lastToast, submit, learn, current, nodes, document, listeners,
    frame: () => frameRuntime,
    drainNative: () => Promise.all(tasks),
    planCard: () => h.run('renderPlannedActionCard()'),
    savePlan(skillId, actionId, amount = '') {
      const form = { dataset: { plannedOwner: JSON.stringify([main.state.user.displayName, main.state.isSolo]) }, elements: { skill: {value: skillId}, action: {value: actionId}, amount: {value: String(amount)} }, matches: selector => selector === '[data-planned-form]' };
      for (const handler of listeners.submit) handler({target: form, preventDefault() {}});
    }, saved: () => JSON.parse(h.storage.get('iw-status-quick-skills-v1:["Player",false]') || '{}') };
}

module.exports = setup;
