const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup() {
  let now = 100000, amount = '100', nextTimer = 0;
  const timers = new Map();
  const item = { querySelector(selector) {
    if (selector === 'img') return { getAttribute: () => '/assets/items/wood.png' };
    if (selector === '.amount') return { textContent: amount };
    if (selector === '.name') return { textContent: 'Wood' };
    return null;
  } };
  const document = {
    querySelector: selector => selector === 'inventory-page' ? {}
      : selector === 'app-component > .scroll > .padding > .wrapper' ? { children: [] } : null,
    querySelectorAll: selector => selector === 'inventory-page button.item' ? [item] : []
  };
  const h = harness({ document, location: { pathname: '/inventory' },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  h.run('AppState.ui.page = { hidden: true }; setCacheLookupsEnabled(false)');
  return { h, setAmount(value) { amount = String(value); },
    advance(time) {
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; h.time(now); next[1].callback();
      }
      now = time; h.time(now);
    }
  };
}

test('a final native update inside the capture throttle reaches the cache without another mutation', () => {
  const { h, setAmount, advance } = setup();
  h.context.captureVisibleCaches();
  advance(100100); setAmount(80); h.context.captureVisibleCaches();
  advance(102001);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 80);
});

test('the inventory reader and persisted cache accept the final native value', () => {
  const { h, setAmount, advance } = setup();
  h.context.captureVisibleCaches();
  advance(100100); setAmount(80);
  assert.equal(h.context.collectInventory(h.context.document), true);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 80);
  assert.equal(JSON.parse(h.storage.get(h.run('CACHE_KEY'))).records.inventory.allItems[0].amount, 80);
});

test('opening Status immediately captures the latest native values despite the throttle', () => {
  const { h, setAmount, advance } = setup();
  h.run(`setStatusHeader = () => {}; render = () => {};
    refreshAdventureSnapshot = refreshChallengesSnapshot = refreshTamingSnapshot = refreshAutomationsSnapshot = refreshGuildEventSnapshot = refreshGuildTrialSnapshot = () => {};
    globalThis.history = { pushState() { location.pathname = '/status'; } };`);
  h.context.captureVisibleCaches();
  advance(100100); setAmount(80); h.context.captureVisibleCaches();
  h.context.showStats();
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 80);
});

test('a quick return to Inventory starts a new capture window', () => {
  const { h, setAmount, advance } = setup();
  h.context.captureVisibleCaches();
  advance(100100); h.context.location.pathname = '/equipment'; h.context.captureVisibleCaches();
  advance(100200); setAmount(80); h.context.location.pathname = '/inventory'; h.context.captureVisibleCaches();
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 80);
});

test('a deferred capture cannot read a page after navigating away', () => {
  const { h, setAmount, advance } = setup();
  h.context.captureVisibleCaches();
  advance(100100); setAmount(80); h.context.captureVisibleCaches();
  h.context.location.pathname = '/equipment';
  advance(102100);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 100);
});

function attunementDocument({ mounted = true, slots = true, tribute = 100 } = {}) {
  const slot = { querySelector(selector) {
    if (selector === ':scope > .name') return { childNodes: [{ textContent: 'Forest' }] };
    if (selector === '.name .secondary') return { textContent: 'Woodcutting' };
    return null;
  } };
  const cards = mounted ? [
    { querySelector: () => ({ textContent: 'Slots' }), querySelectorAll: () => slots ? [slot] : [] },
    { querySelector: () => ({ textContent: 'Requirements' }), querySelectorAll: () => [{ querySelector: selector => ({ textContent: selector === '.name' ? 'Forest Tribute' : String(tribute) }) }] }
  ] : [];
  const root = { querySelectorAll: () => cards };
  return { querySelector: selector => selector === 'attunement-page' ? root : null, querySelectorAll: () => [] };
}

test('an unsuccessful Attunement read does not delay a fully mounted page', () => {
  const { h, advance } = setup();
  h.context.location.pathname = '/attunement';
  h.context.document = attunementDocument({ mounted: false });
  h.context.captureVisibleCaches();
  assert.equal(h.run('AppState.ui.visibleCaptureTimes.attunement'), undefined);
  advance(100100); h.context.document = attunementDocument(); h.context.captureVisibleCaches();
  assert.equal(h.run('getCache().attunement.tributes.Forest'), 100);
});

test('an empty Attunement slot mount preserves previously observed selections', () => {
  const { h } = setup();
  h.context.location.pathname = '/attunement';
  h.context.document = attunementDocument(); h.context.captureVisibleCaches();
  h.context.document = attunementDocument({ slots: false });
  h.context.captureVisibleCaches({ force: true });
  assert.equal(h.run('getCache().attunement.selected[0]?.skill'), 'Woodcutting');
});

test('a late Attunement Tribute update is captured without another page mutation', () => {
  const { h, advance } = setup();
  h.context.location.pathname = '/attunement';
  h.context.document = attunementDocument(); h.context.captureVisibleCaches();
  advance(100100); h.context.document = attunementDocument({ tribute: 80 }); h.context.captureVisibleCaches();
  advance(102001);
  assert.equal(h.run('getCache().attunement.tributes.Forest'), 80);
});

test('native text-only updates trigger a new capture after an incomplete Attunement mount', () => {
  const { h } = setup();
  const document = h.context.document;
  h.context.location.pathname = '/attunement';
  Object.assign(document, attunementDocument({ mounted: false }), { readyState: 'loading', body: {}, addEventListener() {} });
  let observer, options;
  h.context.MutationObserver = class {
    constructor(callback) { observer = callback; }
    observe(_target, value) { options = value; }
  };
  h.context.window = { addEventListener() {}, setInterval() {} };
  h.run(`installNativeQuantityPrecision = addStyles = createPage = installNavButton = installHeaderTools = installInterfaceControls = installEventDelegation = syncQuickSkills = checkScriptUpdate = installUpdateIndicator = syncHeaderActionBadges = () => {};`);
  h.run(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/entrypoint.js'), 'utf8'));
  h.context.initialise();
  h.context.captureVisibleCaches();
  Object.assign(document, attunementDocument());
  h.run('AppState.ui.page.contains = () => false');
  if (options.characterData) observer([{ type: 'characterData', target: { nodeType: 3, parentElement: { closest: () => null } } }]);
  assert.equal(h.run('getCache().attunement?.tributes.Forest'), 100);
  // Text from our controls remains output, not another native observation.
  let captures = 0;
  h.context.captureVisibleCaches = () => { captures++; };
  observer([{ type: 'characterData', target: { nodeType: 3, parentElement: { closest: () => ({}) } } }]);
  assert.equal(captures, 0);
});
