'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, assemble } = require('./assemble-userscript.js');
function files(dir, suffix) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name), suffix) : entry.name.endsWith(suffix) ? [path.join(dir, entry.name)] : []); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of [...files(path.join(root, 'src'), '.js'), path.join(root, 'ironwood-stats.user.js')]) run(process.execPath, ['--check', file]);
if (assemble() !== fs.readFileSync(path.join(root, 'ironwood-stats.user.js'), 'utf8')) throw new Error('Generated artifact differs from source');
run(process.execPath, ['--test', ...files(path.join(root, 'tests'), '.test.cjs')]);
run('git', ['diff', '--check']);
