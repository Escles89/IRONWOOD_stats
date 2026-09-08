const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');

test('toasts retain up to three recaps and can be dismissed independently',()=>{
  const h=harness();
  const first=h.context.showActionToast({title:'First'});
  const second=h.context.showActionToast({title:'Second',kind:'warning'});
  h.context.showActionToast({title:'Third'});
  h.context.showActionToast({title:'Fourth'});
  assert.equal(h.run('AppState.ui.actionToasts.length'),3);
  assert.equal(h.run('AppState.ui.actionToasts[0].id'),second.id);
  h.context.dismissActionToast(second.id);
  assert.equal(h.run('AppState.ui.actionToasts.length'),2);
  h.context.dismissActionToast(first.id);
  assert.equal(h.run('AppState.ui.actionToasts.length'),2);
});

test('toast messages are escaped and unknown allowance is not presented as zero',()=>{
  const h=harness();
  const toast=h.context.showChallengeRecap({successful:false,region:'Forest',skill:'Defense',completed:0,cancelled:0,purchased:0,scrollsUsed:0,goldSpent:0,autoCompletesRemaining:null,stopReason:'<img onerror="bad">'});
  const html=h.context.renderActionToast(toast);
  assert.match(html,/Auto-completes left<\/dt><dd>Unknown/);
  assert.match(html,/&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(html,/<img onerror/);
  assert.match(html,/data-toast-dismiss/);
});

test('challenge recap uses native icons and keeps synchronization failures separate from totals',()=>{
  const h=harness();
  const toast=h.context.showChallengeRecap({successful:true,region:'Forest',skill:'Defense',completed:7,cancelled:0,purchased:6,scrollsUsed:1,goldSpent:630000,autoCompletesRemaining:3,stopReason:'Maximum paid purchase tier reached',syncError:'Game could not sync'});
  const html=h.context.renderActionToast(toast);
  assert.equal(toast.title,'Challenge run complete');
  assert.equal(toast.kind,'warning');
  assert.equal(toast.summary,'Forest · Defense');
  for(const path of ['items/challenge-scroll.png','misc/coin.png','misc/challenges.png','misc/quests.png']) assert.ok(html.includes(`/assets/${path}`));
  assert.match(html,/Gold spent<\/dt><dd>630,000/);
  assert.match(html,/iw-toast-sync-warning/);
  assert.match(html,/Game could not sync/);
});


test('quest completion toast reports new progress once and ignores initial loads and daily resets',()=>{
  const h=harness();
  const before={schema:2,day:'today',completed:4,quests:[{id:'Defense',skill:'Defense',done:false}]};
  const after={...before,completed:5,quests:[{id:'Defense',skill:'Defense',done:true}]};
  h.context.notifyQuestCompletion(undefined,after);
  h.context.notifyQuestCompletion({...before,day:'yesterday'},after);
  h.context.notifyQuestCompletion(after,after);
  assert.equal(h.run('AppState.ui.actionToasts.length'),0);
  h.context.notifyQuestCompletion(before,after);
  const toast=h.run('AppState.ui.actionToasts[0]');
  assert.equal(toast.title,'Daily quests complete');
  assert.equal(toast.summary,'Defense');
  assert.equal(toast.metrics[0].value,'5/5');
  h.context.notifyQuestCompletion(after,after);
  assert.equal(h.run('AppState.ui.actionToasts.length'),1);
});

test('Attunement recap escapes category details and never substitutes zero for missing rewards',()=>{
  const h=harness();
  const toast=h.context.showAttunementRecap({successful:true,collected:1,categories:[{region:'Forest',skill:'Farming',xp:null,shards:null,rewards:[{name:'<img onerror=bad>',image:'javascript:bad',amount:11708}]}]});
  const html=h.context.renderActionToast(toast);
  assert.match(html,/Forest · Farming/);
  assert.match(html,/aria-label="Unknown XP gained"/);
  assert.doesNotMatch(html,/Slots collected|Total XP gained/);
  assert.match(html,/&lt;img onerror=bad&gt;/);
  assert.match(html,/11,708/);
  assert.doesNotMatch(html,/src="javascript:/);
});
