const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

test('an unloaded quest shell does not overwrite the saved daily snapshot',()=>{
  const h=harness();
  h.run("CacheStore.set('quests',{schema:2,day:dayKey(),completed:3,quests:[],dailyComplete:false})");
  h.context.collectQuests({querySelectorAll:()=>[]});
  assert.equal(h.run('getCache().quests.completed'),3);
});

test('quest automation waits for asynchronously rendered rows',async()=>{
  let polls=0;
  const h=harness({setTimeout(callback,ms){polls++;h.time(100000+polls*ms);callback();}});
  h.context.collectQuests=()=>({card:{},quests:polls>=3?[{skill:'Mining'}]:[]});
  const result=await h.context.waitForQuestRows({});
  assert.equal(polls,3);
  assert.equal(result.quests[0].skill,'Mining');
});

test('missing quest rows produce an explicit retry error',async()=>{
  let now=100000;
  const h=harness({setTimeout(callback,ms){h.time(now+=ms);callback();}});
  h.context.collectQuests=()=>({card:null,quests:[]});
  await assert.rejects(h.context.waitForQuestRows({},600),/quest rows did not load/);
});
