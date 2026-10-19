const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function setup() {
  const h = harness({ setTimeout, clearTimeout });
  h.run(`
    var calls = [], fail = false, release = null, hold = false, unsubscribed = 0;
    var board = {skills: Object.fromEntries(QUICK_SKILL_ORDER.map(id => [id, [{name:'Other'}, {name:'Player', rank:1234}]]))};
    var runtime = {state:{user:{displayName:'Player',isSolo:false},isSolo:false}, firebase:{
      getLeaderboards(mode) { calls.push(mode); return {subscribe(observer) {
        const respond = () => fail ? observer.error(Error('offline')) : observer.next(board);
        if (hold) release = respond; else respond();
        return {unsubscribe(){unsubscribed++;}};
      }}; }
    }};
    quickRuntime = () => runtime;
  `);
  return h;
}

test('ranks match native explicit ranks and index fallback, including unranked skills', () => {
  const h = setup();
  h.run(`board.skills['1'] = [{name:'Other'}, {name:'Player'}]; board.skills['15'] = [];`);
  const ranks = h.run("skillRanksSnapshot(board, 'Player').ranks");
  assert.equal(ranks['2'], 1234);
  assert.equal(ranks['1'], 2);
  assert.equal(ranks['15'], null);
  h.run("delete board.skills['8']");
  assert.equal(h.run("skillRanksSnapshot(board, 'Player')"), null);
});

test('one request loads every skill, persists through reload, and refreshes only after an hour', async () => {
  const h = setup();
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 1);
  assert.equal(h.run('unsubscribed'), 1);
  assert.match(h.run("renderSkillRank({id:'2',name:'Mining'}, runtime)"), /Rank #1,234/);
  h.run('AppState.ui.quickSkills.leaderboards = null');
  h.time(3699999);
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 1);
  h.time(3700000);
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 2);
});

test('in-flight requests are deduplicated and character switches discard late responses', async () => {
  const h = setup();
  h.run('hold = true');
  const pending = h.run('refreshSkillRanks(runtime)');
  await Promise.resolve(); await Promise.resolve();
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 1);
  h.run("runtime.state.user.displayName='New character'; skillRanksState(runtime); release()");
  await pending;
  assert.equal(h.storage.size, 0);
  assert.equal(h.run('skillRanksState(runtime).snapshot'), null);
});

test('solo and multiplayer use separate boards and persisted snapshots', async () => {
  const h = setup();
  await h.run('refreshSkillRanks(runtime)');
  h.run("runtime.state.isSolo=true; runtime.state.user.isSolo=true; board.skills['2'][1].rank=42");
  await h.run('refreshSkillRanks(runtime)');
  assert.deepEqual(Array.from(h.run('calls')), ['1', '2']);
  assert.equal(h.run("skillRanksState(runtime).snapshot.ranks['2']"), 42);
  h.run('runtime.state.isSolo=false; runtime.state.user.isSolo=false');
  assert.equal(h.run("skillRanksState(runtime).snapshot.ranks['2']"), 1234);
});

test('failed refresh retains stale ranks and backs off for five minutes', async () => {
  const h = setup();
  await h.run('refreshSkillRanks(runtime)');
  h.time(3700000);
  h.run('fail = true');
  await h.run('refreshSkillRanks(runtime)');
  assert.match(h.run("renderSkillRank({id:'2',name:'Mining'}, runtime)"), /Rank #1,234 \(cached\)/);
  assert.match(h.run('renderSkillRanksNote(runtime)'), /last known ranks/);
  h.time(3999999);
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 2);
  h.time(4000000);
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 3);
});

test('unavailable data stays unknown, and hidden or busy pages make no request', async () => {
  const h = setup();
  assert.match(h.run("renderSkillRank({id:'2',name:'Mining'}, runtime)"), /Rank —/);
  h.run('document.hidden=true');
  await h.run('refreshSkillRanks(runtime)');
  h.run('document.hidden=false; AppState.ui.quickSkills.busy=true');
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 0);
  h.run('AppState.ui.quickSkills.busy=false; board={skills:{}}');
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('skillRanksState(runtime).snapshot'), null);
  assert.match(h.run('renderSkillRanksNote(runtime)'), /Ranks unavailable/);
});

test('reuses the native unexpired board and rejects corrupt persisted ranks', async () => {
  const h = setup();
  h.run("runtime.state.leaderboards={'1':{...board,expiresAt:new Date(Date.now()+60000).toISOString()}}");
  await h.run('refreshSkillRanks(runtime)');
  assert.equal(h.run('calls.length'), 0);
  h.run("localStorage.setItem(SKILL_RANKS_KEY+quickOwner(runtime), JSON.stringify({version:1,observedAt:Date.now(),ranks:{'2':-1}})); AppState.ui.quickSkills.leaderboards=null");
  assert.equal(h.run('skillRanksState(runtime).snapshot'), null);
});
