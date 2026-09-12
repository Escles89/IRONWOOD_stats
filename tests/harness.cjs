const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { modules, root } = require('../src/build/assemble-userscript.js');
module.exports = function harness(overrides = {}) {
  const storage = new Map();
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ NEWS_LINES: require('../src/content/news-lines.json'), NEWS_OUTLETS: require('../src/content/news-outlets.json'), Date: Clock, console, USERSCRIPT_VERSION: require('../package.json').version,
    location: { pathname: '/status' },
    document: { querySelector() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    ...overrides });
  for (const file of modules.filter(name => name !== 'entrypoint.js')) vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), context, { filename: file });
  return { context, storage, time(value) { now = value; }, run(code) { return vm.runInContext(code, context); } };
};
