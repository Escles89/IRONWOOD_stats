const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('../harness.cjs');
test('combat weapon comes from equipped native item, not enemy loot or the trained skill',()=>{
 const h=harness();
 h.context.findNativeSyncRuntime=()=>({state:{user$:{getValue:()=>({equipment:{weapon:{id:12},helm:{id:13}}})}},catalog:{12:{id:12,name:'Infernal Spear',image:'items/infernal-spear.png',stats:{weaponType:3}},13:{id:13,name:'Helm',image:'items/helm.png',stats:{}}}});
 const weapon=h.context.readEquippedCombatWeapon();
 assert.equal(weapon.image,'/assets/items/infernal-spear.png');
 assert.equal(weapon.style,'thrust');
 assert.equal(h.context.renderCombatWeapon({weapon},{side:'monster'}),'');
 assert.equal(h.context.renderCombatWeapon({weapon,reviveRemainingMs:100},{side:'player'}),'');
 assert.match(h.context.renderCombatWeapon({weapon},{side:'player'}),/Infernal Spear/);
});
test('attack animation follows observed meter resets without looping on initial mount or repeated frames',()=>{
 const h=harness();
 const action={isCombat:true,actionId:1,weapon:{id:12},combatants:[{side:'player',meterPercent:90}]};
 assert.equal(h.context.observeWeaponAttack(action),false);
 action.combatants[0].meterPercent=10;
 assert.equal(h.context.observeWeaponAttack(action),true);
 assert.equal(h.context.observeWeaponAttack(action),false);
 action.combatants[0].meterPercent=90; h.context.observeWeaponAttack(action);
 action.weapon.id=13;action.combatants[0].meterPercent=0;
 assert.equal(h.context.observeWeaponAttack(action),false);
 action.reviveRemainingMs=1000;
 assert.equal(h.context.observeWeaponAttack(action),false);
});
test('unavailable equipment omits the weapon instead of guessing',()=>{
 const h=harness();
 h.context.findNativeSyncRuntime=()=>{throw Error('Not ready');};
 assert.equal(h.context.readEquippedCombatWeapon(),null);
});

test('six weapon families have distinct choreography and return to their resting pose',()=>{
 const h=harness();
 const names=['Sword','Hammer','Scythe','Spear','Bow','Boomerang'];
 const expected=['swing','hammer','scythe','thrust','draw','throw'];
 const animations=names.map((name,index)=>{
   const style=h.context.combatWeaponStyle(`Infernal ${name}`);
   assert.equal(style,expected[index]);
   const animation=h.context.combatWeaponAnimation(style);
   assert.equal(animation.keyframes.length,7);
   assert.equal(animation.keyframes[0].offset,0);
   assert.equal(animation.keyframes.at(-1).offset,1);
   assert.ok(animation.options.duration<1000);
   for(let i=1;i<animation.keyframes.length;i++) assert.ok(animation.keyframes[i].offset>animation.keyframes[i-1].offset);
   if(style!=='throw') assert.equal(animation.keyframes[0].transform,animation.keyframes.at(-1).transform);
   else assert.match(animation.keyframes.at(-1).transform,/708deg/); // -12 degrees after two revolutions.
   return JSON.stringify(animation.keyframes);
 });
 assert.equal(new Set(animations).size,6);
});

test('only bows render an arrow, and shots follow attacks with a delayed release',()=>{
 const shots=[];
 const arrow={getAnimations:()=>[],getBoundingClientRect:()=>({left:100,right:148,top:80,width:48,height:16}),animate:(frames,options)=>shots.push({frames,options})};
 const weapon={getAnimations:()=>[],animate:()=>{}};
 const target={getBoundingClientRect:()=>({left:400,top:40,width:100,height:100})};
 const h=harness({matchMedia:()=>({matches:false})});
 h.context.testPage={querySelector:selector=>selector==='.iw-combat-arrow'?arrow:selector==='.iw-weapon-motion'?weapon:target};
 h.run('AppState.ui.page = testPage');
 const action={isCombat:true,actionId:1,weapon:{id:1,style:'draw',name:'Bow'},combatants:[{side:'player',meterPercent:90}]};
 assert.match(h.context.renderCombatWeapon(action,{side:'player'}),/iw-combat-arrow/);
 assert.doesNotMatch(h.context.renderCombatWeapon({...action,weapon:{style:'swing'}},{side:'player'}),/iw-combat-arrow/);
 h.context.updateCombatWeapon(action);
 assert.equal(shots.length,0);
 action.combatants[0].meterPercent=5;
 h.context.updateCombatWeapon(action);
 assert.equal(shots.length,1);
 assert.equal(shots[0].options.delay,305);
 assert.match(shots[0].frames.at(-1).transform,/translate\(151px,1px\)/);
 assert.equal(shots[0].frames.at(-1).opacity,0);
 h.context.updateCombatWeapon(action);
 assert.equal(shots.length,1);
 h.context.matchMedia=()=>({matches:true});
 action.combatants[0].meterPercent=90;h.context.updateCombatWeapon(action);
 action.combatants[0].meterPercent=5;h.context.updateCombatWeapon(action);
 assert.equal(shots.length,1);
});

test('miss estimates require unchanged known HP on the same enemy',()=>{
 const h=harness();
 const player={side:'player',meterPercent:90};
 const enemy={side:'monster',name:'Wolf',image:'wolf.png',hp:100};
 const action={isCombat:true,actionId:1,weapon:{id:1},combatants:[player,enemy]};
 const missed=()=>h.run('weaponMotion.missed');
 h.context.observeWeaponAttack(action);
 player.meterPercent=0;h.context.observeWeaponAttack(action);
 assert.equal(missed(),true);
 player.meterPercent=90;h.context.observeWeaponAttack(action);
 player.meterPercent=0;enemy.hp=80;h.context.observeWeaponAttack(action);
 assert.equal(missed(),false);
 player.meterPercent=90;h.context.observeWeaponAttack(action);
 player.meterPercent=0;enemy.name='Bear';h.context.observeWeaponAttack(action);
 assert.equal(missed(),false);
 player.meterPercent=90;enemy.hp=undefined;h.context.observeWeaponAttack(action);
 player.meterPercent=0;h.context.observeWeaponAttack(action);
 assert.equal(missed(),false);
});

test('missed arrows fall short, bounce at ground level and settle before fading',()=>{
 const h=harness();let shot;
 const arrow={getAnimations:()=>[],getBoundingClientRect:()=>({left:100,right:124,top:80,width:24,height:8}),animate:(frames,options)=>{shot={frames,options};}};
 h.context.testPage={querySelector:()=>({getBoundingClientRect:()=>({left:300,top:40,width:100,height:84})})};
 h.run('AppState.ui.page = testPage');
 h.context.fireCombatArrow(arrow,true);
 assert.match(shot.frames[2].transform,/,36px\) rotate\(65deg\)/);
 assert.match(shot.frames[3].transform,/,29px\) rotate\(-15deg\)/);
 assert.equal(shot.frames[4].transform,shot.frames[5].transform);
 assert.equal(shot.frames[5].opacity,1);
 assert.equal(shot.frames.at(-1).opacity,0);
 assert.equal(shot.options.duration,950);
 assert.equal(shot.options.delay,305);
});
