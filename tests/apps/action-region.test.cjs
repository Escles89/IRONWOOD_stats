const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
test('Defense uses the native equipped-weapon region and changes with equipment',()=>{
 const h=harness(); let region=3;
 const user={equipment:{weapon:{id:123}}};
 h.context.findNativeSyncRuntime=()=>({state:{user$:{getValue:()=>user}},skillCatalog:{16:{id:16,name:'Defense'}},regionCatalog:{1:{name:'Forest'},2:{name:'Mountain'},3:{name:'Ocean'}},skillRegion:(actual,id)=>{assert.equal(actual,user);assert.equal(id,16);return region;}});
 assert.equal(h.context.currentActionRegion({skillName:'Defense',location:'Mountain'}),'Ocean');
 region=1;assert.equal(h.context.currentActionRegion({skillName:'Defense'}),'Forest');
 region=2;assert.equal(h.context.currentActionRegion({skillName:'Defense'}),'Mountain');
});
test('unknown Defense equipment shows no guessed region; other skills retain their one region',()=>{
 const h=harness();
 h.context.findNativeSyncRuntime=()=>{throw Error('Not loaded');};
 assert.equal(h.context.currentActionRegion({skillName:'Defense',location:'Ocean'}),'');
 assert.equal(h.context.currentActionRegion({skillName:'Woodcutting'}),'Forest');
 assert.equal(h.context.currentActionRegion({skillName:'One-handed'}),'Mountain');
 assert.equal(h.context.currentActionRegion({skillName:'Two-handed'}),'Ocean');
});
