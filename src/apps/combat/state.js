  function parseReviveRemaining(statusText) {
    const reviveWordMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i);
    const reviveBareMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)(?!\s*(?:hp|level|xp))/i);
    const reviveClockMatch = statusText.match(/(\d+):(\d{2})[^a-z]{0,12}(?:revive|respawn|resurrect)/i)
      || statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+):(\d{2})/i);
    return reviveWordMatch
      ? Number(reviveWordMatch[1]) * (/m(?:in(?:ute)?s?)?\b/i.test(reviveWordMatch[2]) ? 60000 : 1000)
      : reviveClockMatch ? (Number(reviveClockMatch[1]) * 60 + Number(reviveClockMatch[2])) * 1000
      : reviveBareMatch ? Number(reviveBareMatch[1]) * 1000 : 0;
  }

  function readEquippedCombatWeapon() {
    try {
      const runtime = findNativeSyncRuntime();
      const user = runtime.state?.user$?.getValue();
      const items = Object.values(user?.equipment || {}).map(slot => runtime.catalog?.[slot?.id]);
      const weapon = items.find(item => item?.stats?.weaponType != null && /^items\/[a-z0-9/_-]+\.png$/i.test(item.image || ''));
      if (!weapon) return null;
      const style = combatWeaponStyle(weapon.name);
      return { id: weapon.id, name: weapon.name, image: `/assets/${weapon.image}`, style };
    } catch (_) { return null; }
  }
  function combatWeaponStyle(name) {
    return /boomerang/i.test(name) ? 'throw' : /bow/i.test(name) ? 'draw' : /spear/i.test(name) ? 'thrust'
      : /hammer/i.test(name) ? 'hammer' : /scythe/i.test(name) ? 'scythe' : 'swing';
  }
  function combatWeaponAnimation(style) {
    const profiles = {
      swing: { duration:560, offsets:[0,.22,.34,.48,.63,.8,1], poses:[
        'rotate(-12deg)', 'translate(-3px,-3px) rotate(-62deg)', 'translate(-2px,-4px) rotate(-68deg)',
        'translate(10px,2px) rotate(55deg)', 'translate(8px,3px) rotate(66deg)', 'translate(2px,0) rotate(-20deg)', 'rotate(-12deg)'] },
      hammer: { duration:760, offsets:[0,.3,.43,.56,.63,.79,1], poses:[
        'rotate(-12deg)', 'translate(-5px,-8px) rotate(-82deg)', 'translate(-5px,-9px) rotate(-86deg)',
        'translate(9px,7px) rotate(58deg)', 'translate(8px,4px) rotate(49deg)', 'translate(4px,3px) rotate(30deg)', 'rotate(-12deg)'] },
      scythe: { duration:880, offsets:[0,.26,.36,.54,.65,.83,1], poses:[
        'rotate(18deg)', 'rotate(5deg)', 'rotate(0deg)',
        'rotate(40deg)', 'rotate(55deg)', 'rotate(30deg)', 'rotate(18deg)'] },
      thrust: { duration:570, offsets:[0,.25,.37,.5,.62,.8,1], poses:[
        'rotate(20deg)', 'translate(-7px,2px) rotate(13deg)', 'translate(-8px,1px) rotate(10deg)',
        'translate(20px,-4px) rotate(12deg)', 'translate(17px,-3px) rotate(14deg)', 'translate(-2px,1px) rotate(18deg)', 'rotate(20deg)'] },
      draw: { duration:650, offsets:[0,.27,.47,.55,.65,.78,1], poses:[
        'rotate(35deg)', 'translate(-3px,0) rotate(31deg) scaleX(.94)', 'translate(-6px,0) rotate(29deg) scaleX(.84)',
        'translate(3px,0) rotate(38deg) scaleX(1.04)', 'translate(-2px,0) rotate(33deg) scaleX(.98)', 'translate(1px,0) rotate(36deg)', 'rotate(35deg)'] },
      throw: { duration:820, offsets:[0,.2,.4,.58,.76,.9,1], poses:[
        'rotate(-12deg)', 'translate(-5px,1px) rotate(-55deg)', 'translate(15px,-8px) rotate(140deg)',
        'translate(25px,-4px) rotate(330deg)', 'translate(12px,7px) rotate(520deg)', 'translate(1px,2px) rotate(700deg)', 'rotate(708deg)'] }
    };
    const profile = profiles[style] || profiles.swing;
    return { keyframes: profile.poses.map((transform,index) => ({ transform, offset:profile.offsets[index] })),
      options: { duration:profile.duration, easing:'cubic-bezier(.25,.6,.3,1)' } };
  }
  const weaponMotion = { key: '', meter: null, enemyKey: '', enemyHp: null, missed: false };
  function observeWeaponAttack(action) {
    const fighter = action?.combatants?.find(item => item.side === 'player');
    const enemy = action?.combatants?.find(item => item.side === 'monster');
    if (!action?.isCombat || !action.weapon || !fighter || fighter.dead || action.reviveRemainingMs > 0 || fighter.spawn || enemy?.spawn) {
      weaponMotion.key = ''; weaponMotion.meter = null; weaponMotion.enemyHp = null; weaponMotion.missed = false; return false;
    }
    const key = `${action.actionId || action.name}:${action.weapon.id}`;
    const meter = fighter.meterPercent;
    const attack = weaponMotion.key === key && Number.isFinite(meter) && Number.isFinite(weaponMotion.meter)
      && weaponMotion.meter >= 50 && weaponMotion.meter - meter > 20;
    const enemyKey = enemy ? `${enemy.name}:${enemy.image}` : '';
    // Visual estimate only: the DOM provides HP and attack meters, not hit results.
    weaponMotion.missed = Boolean(attack && enemy && enemyKey === weaponMotion.enemyKey
      && Number.isFinite(enemy.hp) && Number.isFinite(weaponMotion.enemyHp)
      && enemy.hp > 0 && enemy.hp === weaponMotion.enemyHp && !enemy.hit && !enemy.healAmount);
    weaponMotion.enemyKey = enemyKey;
    weaponMotion.enemyHp = Number.isFinite(enemy?.hp) ? enemy.hp : null;
    weaponMotion.key = key;
    weaponMotion.meter = Number.isFinite(meter) ? meter : null;
    return attack;
  }
  function updateCombatWeapon(action) {
    const attack = observeWeaponAttack(action);
    const element = AppState.ui.page?.querySelector('.iw-weapon-motion');
    if (!element) return;
    const player = action?.combatants?.find(fighter => fighter.side === 'player');
    const arrow = AppState.ui.page?.querySelector('.iw-combat-arrow');
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (action?.reviveRemainingMs > 0 || player?.dead || reducedMotion) {
      element.getAnimations?.().forEach(animation => animation.cancel());
      arrow?.getAnimations?.().forEach(animation => animation.cancel());
      return;
    }
    if (!attack) return;
    const animation = combatWeaponAnimation(action.weapon.style);
    element.getAnimations?.().forEach(animation => animation.cancel());
    element.animate?.(animation.keyframes, animation.options);
    if (action.weapon.style === 'draw') fireCombatArrow(arrow, weaponMotion.missed);
  }
  function fireCombatArrow(arrow, missed = false) {
    const target = AppState.ui.page?.querySelector('.iw-fighter-monster .iw-fighter-visual');
    if (!arrow || !target) return;
    arrow.getAnimations?.().forEach(animation => animation.cancel());
    const start = arrow.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    // Convert viewport distances back into local pixels, including scaled dashboards.
    const scale = start.width / 24;
    if (!(scale > 0) || !end.width) return;
    const x = (end.left + end.width / 2 - start.right) / scale;
    const y = (end.top + end.height / 2 - start.top - start.height / 2) / scale;
    if (x <= 0) return;
    if (missed) {
      // Fall short of the enemy and land at the fighters' feet, above the HP bars.
      const landingX = Math.max(0, Math.min(x * .55, (end.left - start.right) / scale - 12));
      const groundY = (end.top + end.height - start.top - start.height) / scale;
      arrow.animate?.([
        { transform:'translate(0,0) rotate(0deg)', opacity:1, offset:0, easing:'ease-out' },
        { transform:`translate(${landingX * .45}px,-4px) rotate(15deg)`, opacity:1, offset:.18, easing:'ease-in' },
        { transform:`translate(${landingX}px,${groundY}px) rotate(65deg)`, opacity:1, offset:.48, easing:'ease-out' },
        { transform:`translate(${landingX + 3}px,${groundY - 7}px) rotate(-15deg)`, opacity:1, offset:.6, easing:'ease-in' },
        { transform:`translate(${landingX + 5}px,${groundY}px) rotate(0deg)`, opacity:1, offset:.72 },
        { transform:`translate(${landingX + 5}px,${groundY}px) rotate(0deg)`, opacity:1, offset:.86 },
        { transform:`translate(${landingX + 5}px,${groundY}px) rotate(0deg)`, opacity:0, offset:1 }
      ], { delay:305, duration:950, easing:'linear', fill:'none' });
      return;
    }
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    arrow.animate?.([
      { transform:`translate(0,0) rotate(${angle}deg)`, opacity:1, offset:0 },
      { transform:`translate(${x * .9}px,${y * .9}px) rotate(${angle}deg)`, opacity:1, offset:.9 },
      { transform:`translate(${x}px,${y}px) rotate(${angle}deg)`, opacity:0, offset:1 }
    ], { delay:305, duration:280, easing:'linear', fill:'none' });
  }
