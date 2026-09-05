const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/../ironwood-stats.user.js`, 'utf8');

test('idle dashboard renders empty action and remaining panels without a cache repair error', () => {
  const errors = [];
  const panel = { hidden: false, innerHTML: '', style: { setProperty() {} }, querySelector() { return null; }, querySelectorAll() { return []; } };
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, body: { textContent: '' } };
  const storage = new Map();
  const context = vm.createContext({ document, location: { pathname: '/status' }, console: { error(...args) { errors.push(args); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    panel });
  const setup = `
    page = panel;
    readCurrentAction = () => null;
    render();
  `;
  vm.runInContext(source.replace("  if (document.readyState === 'loading')", setup + "\n  if (document.readyState === 'loading')"), context);
  assert.deepEqual(errors, []);
  assert.match(panel.innerHTML, /No action in progress/);
  for (const title of ['Current Loot', 'Daily quests', 'Divine Potions', 'Automations']) assert.ok(panel.innerHTML.includes(title), title);
  assert.doesNotMatch(panel.innerHTML, /Status could not render|Repair cached data/);
});
