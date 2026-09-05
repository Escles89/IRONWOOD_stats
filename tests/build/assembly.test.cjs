const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assemble, validate, modules, root } = require('../../src/build/assemble-userscript.js');
test('assembly is deterministic and checked-in artifact matches source', () => {
  const output = assemble();
  assert.equal(output, assemble());
  assert.equal(output, fs.readFileSync(path.join(root, 'ironwood-stats.user.js'), 'utf8'));
  assert.ok(Buffer.byteLength(output) < 2097152);
  assert.equal(new Set(modules).size, modules.length);
});
test('metadata and size failures reject publication', () => {
  const output = assemble();
  assert.throws(() => validate(output.replace('// @name ', '// @removed ')), /@name/);
  assert.throws(() => validate(output + ' '.repeat(2097152)), /size limit/);
});
test('local loader still references the generated installation artifact', () => {
  assert.match(fs.readFileSync(path.join(root, 'ironwood-stats-loader.user.js'), 'utf8'), /@require\s+file:\/\/.*\/ironwood-stats\.user\.js/);
});

test('every runtime module is listed exactly once and startup comes last', () => {
  function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.relative(path.join(root, 'src'), path.join(dir, entry.name))] : []); }
  const runtime = files(path.join(root, 'src')).filter(file => !file.startsWith('build/')).sort();
  assert.deepEqual([...modules].sort(), runtime);
  assert.equal(modules.at(-1), 'entrypoint.js');
});
