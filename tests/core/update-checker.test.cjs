const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

const metadata = version => `// ==UserScript==\n// @name         Ironwood RPG - Status Page\n// @namespace    ironwood-rpg-status\n// @version      ${version}\n// ==/UserScript==\n`;
function setup(fetch, info = { scriptUpdateURL: 'https://update.greasyfork.org/scripts/123456/Status.meta.js' }) {
  const heading = { dataset: {} };
  const children = [];
  const coins = { get nextElementSibling() { return children[1]; }, after(el) {
    const index = children.indexOf(el);
    if (index >= 0) children.splice(index, 1);
    children.splice(1, 0, el);
  } };
  children.push(coins);
  const document = { hidden: false,
    querySelector: selector => selector.includes('.coins') ? coins : selector.includes('.iw-status-heading') ? heading : null,
    querySelectorAll: () => [],
    getElementById: id => children.find(el => el.id === id) || null,
    createElement: () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      remove() { children.splice(children.indexOf(this), 1); } }) };
  const h = harness({ document, fetch, AbortController, URL, GM_info: info, window: { setTimeout, clearTimeout } });
  return { h, document, children, coins, heading };
}

test('a build ahead of the public release shows both versions without an update arrow', async () => {
  const installed = require('../../package.json').version;
  const { h, heading, children } = setup(async () => ({ ok: true, text: async () => metadata('1.13.14') }));
  h.context.installUpdateIndicator();
  await h.context.checkScriptUpdate();
  assert.equal(children.length, 1);
  heading.dataset.iwVersion = `v${installed}`; // A native header refresh is repaired.
  h.context.installUpdateIndicator();

  const reload = setup(async () => { throw new Error('Cached result should be used'); });
  for (const [key, value] of h.storage) reload.h.storage.set(key, value);
  await reload.h.context.checkScriptUpdate();
  for (const version of [installed, '99.0.0', '', 'invalid']) {
    h.run(`scriptUpdate.latestVersion = ${JSON.stringify(version)}`);
    h.context.installUpdateIndicator();
  }
});

test('uses the installed Greasy Fork source and strips pinned versions', () => {
  const h = harness({ URL });
  for (const info of [
    { scriptUpdateURL: 'https://update.greasyfork.org/scripts/42/Status.meta.js' },
    { script: { updateURL: 'https://update.greasyfork.org/scripts/42/Status.meta.js' } },
    { script: { downloadURL: 'https://update.greasyfork.org/scripts/42/Status.user.js?version=123#old' } },
    { script: { fileURL: 'https://update.greasyfork.org/scripts/42/Status.user.js' } }
  ]) {
    const source = h.context.greasyForkUpdateSource(info);
    assert.equal(source.updateUrl, 'https://update.greasyfork.org/scripts/42/Status.meta.js');
    assert.equal(source.pageUrl, 'https://greasyfork.org/scripts/42');
  }
  for (const address of [
    'https://raw.githubusercontent.com/Escles89/IRONWOOD_stats/main/ironwood-stats.user.js',
    'file:///tmp/ironwood-stats.user.js', 'none',
    'https://update.greasyfork.org.example.com/scripts/42/Status.meta.js',
    'https://update.greasyfork.org/scripts/42/12345/Status.user.js'
  ]) assert.equal(h.context.greasyForkUpdateSource({ scriptUpdateURL: address }), null);
});

test('a local loader checks the known public listing and ignores the stale GitHub cache', async () => {
  let requests = 0;
  const { h, children, heading } = setup(async url => {
    requests++;
    assert.equal(url, 'https://update.greasyfork.org/scripts/594029/Ironwood%20RPG%20-%20Status%20Page.meta.js');
    return { ok:true, text:async () => metadata('1.13.2').replace('ironwood-rpg-status', 'legacy-namespace') };
  }, null);
  h.storage.set('iw-status-update-check-v1', JSON.stringify({
    url: 'https://raw.githubusercontent.com/Escles89/IRONWOOD_stats/main/ironwood-stats.user.js',
    latestVersion: '99.0.0', nextCheckAt: 100001
  }));
  await h.context.checkScriptUpdate();
  assert.equal(requests, 1);
  assert.equal(children.length, 1);
  const fs = require('node:fs');
  const path = require('node:path');
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../../src/build/metadata.txt'), 'utf8'), /@(?:update|download)URL/);
});

test('versions compare numeric segments and reject invalid metadata', () => {
  const h = harness();
  for (const [remote, local, newer] of [
    ['1.13.14', '1.13.13', true], ['1.14.0', '1.13.99', true],
    ['1.10', '1.9', true], ['2.0', '1.99.99', true],
    ['1.13.13', '1.13.13', false], ['1.13.13.0', '1.13.13', false],
    ['1.13.9', '1.13.13', false], ['invalid', '1.0', false],
    ['1.2-beta', '1.0', false], ['9007199254740992', '1', false]
  ]) assert.equal(h.context.isNewerScriptVersion(remote, local), newer, `${remote} vs ${local}`);
  assert.equal(h.context.publishedScriptVersion(metadata('1.14.0').replaceAll('\n', '\r\n')), '1.14.0');
  assert.equal(h.context.publishedScriptVersion('<html>404</html>'), '');
  assert.equal(h.context.publishedScriptVersion(metadata('1.14.0').replace('Ironwood RPG - Status Page', 'Another script')), '');
  assert.equal(h.context.publishedScriptVersion(metadata('nope')), '');
});

test('new updates appear on the options button instead of beside coins', async () => {
  const { h, children } = setup(async () => ({ ok: true, text: async () => metadata('99.0.0') }));
  await h.context.checkScriptUpdate();
  assert.equal(children.length, 1);
  assert.match(h.context.renderScriptUpdateButton(), /Update available/);
});

test('manual check bypasses cached schedules and opens the userscript installer only for a fresh newer version', async () => {
  let requests = 0, version = '99.0.0', fail = false;
  const { h } = setup(async () => { requests++; if (fail) throw Error('offline'); return { ok: true, text: async () => metadata(version) }; });
  const destinations = [], toasts = [];
  h.context.location.assign = url => destinations.push(url);
  h.context.showActionToast = toast => toasts.push(toast);
  await h.context.checkScriptUpdate();
  await h.context.checkAndInstallScriptUpdate();
  assert.equal(requests, 2);
  assert.deepEqual(destinations, ['https://update.greasyfork.org/scripts/123456/Status.user.js']);
  fail = true;
  await h.context.checkAndInstallScriptUpdate();
  assert.equal(destinations.length, 1);
  assert.equal(toasts.at(-1).kind, 'warning');
  fail = false; version = require('../../package.json').version;
  await h.context.checkAndInstallScriptUpdate();
  assert.equal(destinations.length, 1);
  assert.equal(toasts.at(-1).title, 'No update available');
  assert.equal(h.run('scriptUpdate.manual'), false);
});

test('current/local-ahead versions and failed checks never show an update', async () => {
  for (const response of [
    { ok: true, text: async () => metadata(require('../../package.json').version) },
    { ok: true, text: async () => metadata('1.0.0') },
    { ok: false }, { ok: true, text: async () => '<html>Not found</html>' },
    null
  ]) {
    const { h, children } = setup(async () => { if (!response) throw new Error('Offline'); return response; });
    await h.context.checkScriptUpdate();
    assert.equal(children.length, 1);
    assert.ok(h.run('scriptUpdate.nextCheckAt > Date.now()'));
    assert.equal(h.run('scriptUpdate.pending'), null);
  }
});

test('checks coalesce, pause while hidden, cache across reloads and retry failures after 15 minutes', async () => {
  let requests = 0, resolve;
  const { h, document } = setup(() => { requests++; return new Promise(done => { resolve = done; }); });
  document.hidden = true;
  await h.context.checkScriptUpdate();
  assert.equal(requests, 0);
  document.hidden = false;
  const first = h.context.checkScriptUpdate();
  const second = h.context.checkScriptUpdate();
  assert.equal(requests, 1);
  resolve({ ok: true, text: async () => metadata('99.0.0') });
  await Promise.all([first, second]);
  const { h: reloaded, children } = setup(async () => { requests++; throw new Error('Offline'); });
  for (const [key, value] of h.storage) reloaded.storage.set(key, value);
  await reloaded.context.checkScriptUpdate();
  assert.equal(requests, 1);
  assert.equal(children.length, 1);
  assert.match(reloaded.context.renderScriptUpdateButton(), /Update available/);
  reloaded.time(100000 + 6 * 60 * 60 * 1000);
  await reloaded.context.checkScriptUpdate();
  assert.equal(requests, 2);
  assert.equal(children.length, 1);
  assert.match(reloaded.context.renderScriptUpdateButton(), /Update available/);
  await reloaded.context.checkScriptUpdate();
  assert.equal(requests, 2);
  reloaded.time(100000 + (6 * 60 + 15) * 60 * 1000);
  await reloaded.context.checkScriptUpdate();
  assert.equal(requests, 3);
});

test('timeout aborts a slow request and blocked storage does not break checks', async () => {
  const { h, children } = setup((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  let timeoutCallback;
  h.context.window.setTimeout = callback => { timeoutCallback = callback; return 1; };
  h.context.window.clearTimeout = () => {};
  h.context.localStorage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const check = h.context.checkScriptUpdate();
  timeoutCallback();
  await check;
  assert.equal(children.length, 1);
  assert.equal(h.run('scriptUpdate.nextCheckAt - Date.now()'), 15 * 60 * 1000);
});

test('each settings open checks immediately and reports availability without opening the installer', async () => {
  let requests = 0, version = '99.0.0', fail = false;
  const { h } = setup(async () => { requests++; if (fail) throw Error('offline'); return { ok:true, text:async () => metadata(version) }; });
  h.context.render = () => {};
  h.context.location.assign = () => { throw Error('Settings must not install automatically'); };
  h.context.openPreferences();
  assert.equal(h.context.scriptUpdateButtonLabel(), 'Checking…');
  await h.run('scriptUpdate.pending');
  await Promise.resolve();
  assert.match(h.context.scriptUpdateButtonLabel(), /Update available · v99.0.0/);
  version = require('../../package.json').version;
  await h.context.checkSettingsUpdate();
  assert.equal(requests, 2);
  assert.equal(h.context.scriptUpdateButtonLabel(), 'Up to date');
  fail = true;
  await h.context.checkSettingsUpdate();
  assert.equal(h.context.scriptUpdateButtonLabel(), 'Check failed · Retry');
});
