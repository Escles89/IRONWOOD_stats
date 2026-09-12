const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('pending shards read active Attunement loot, not earned or spent balances', () => {
  const h = harness();
  const user = {stats:{attunements:{1:{points:999,spentPoints:10}}},attunements:{slots:{forest:{id:1,loot:{shard:{amount:7}}},mountain:{id:2,loot:{shard:{amount:12}}}}}};
  h.context.findNativeSyncRuntime = () => ({state:{user$:{getValue:()=>user}},attunementCatalog:{1:{id:1,name:'Mining'},2:{id:2,name:'Woodcutting'}},catalog:{shard:{id:'shard',image:'items/attunement-shard.png'}}});
  assert.equal(h.context.readPendingAttunementShards('Mining'),7);
  assert.equal(h.context.readPendingAttunementShards('Woodcutting'),12);
  user.attunements.slots.forest.loot = {};
  assert.equal(h.context.readPendingAttunementShards('Mining'),0);
  assert.equal(h.context.readPendingAttunementShards('Smelting'),null);
});

test('unavailable pending loot does not invent a zero balance', () => {
  const h = harness();
  h.context.findNativeSyncRuntime = () => { throw new Error('Unavailable'); };
  assert.equal(h.context.readPendingAttunementShards('Mining'),null);
});
