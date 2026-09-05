const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { modules, root } = require('../src/build/assemble-userscript.js');
module.exports = function harness(overrides = {}) {
  const storage = new Map();
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ Date: Clock, console,
    location: { pathname: '/status' },
    document: { querySelector() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    ...overrides });
  for (const file of modules.filter(name => name !== 'entrypoint.js')) vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), context, { filename: file });
  return { context, storage, time(value) { now = value; }, run(code) { return vm.runInContext(code, context); } };
};
