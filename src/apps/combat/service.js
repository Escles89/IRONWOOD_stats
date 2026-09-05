  function transitionCombatants(combatants, previousCombatants = [], now = Date.now()) {
    return combatants.map((fighter) => {
        const previous = previousCombatants.find((item) => item.side === fighter.side);
        const hit = Boolean(previous && fighter.hp < previous.hp);
        if (hit) recordCombatEffect(fighter.side, 'hit', { before: previous.hp, after: fighter.hp }, 500);
        const healAmount = previous && fighter.hp > previous.hp ? fighter.hp - previous.hp : 0;
        // A defeated enemy can respawn with the same name and sprite. Detect the
        // zero-HP to positive-HP transition as a replacement as well.
        const spawn = fighter.side === 'monster' && Boolean(previous && (
          previous.name !== fighter.name
          || previous.image !== fighter.image
          || ((previous.hpPercent === 0 || previous.hp <= 0) && (fighter.hpPercent > 0 || fighter.hp > 0))
        ));
        const key = fighter.side;
        const remembered = AppState.ui.combatEffects.get(key) || {};
        const healAlreadyActive = remembered.healUntil > now;
        const newHeal = healAmount && !healAlreadyActive;
        const detectedEffect = newHeal || spawn;
        const effectWasAvailable = now >= AppState.ui.combatEffectLockUntil;
        if (detectedEffect && effectWasAvailable) {
          AppState.ui.combatEffects.clear();
          AppState.ui.combatEffectLockUntil = now + 1800;
        }
        const effectAllowed = !detectedEffect || effectWasAvailable;
        if (effectAllowed && newHeal && recordCombatEffect(key, 'heal', { healAmount }, 3200)) AppState.ui.combatEffects.set(key, { ...(AppState.ui.combatEffects.get(key) || remembered), healAmount, healStarted: now, healUntil: now + 3200 });
        if (effectAllowed && spawn && recordCombatEffect(key, 'spawn', fighter, 4500)) AppState.ui.combatEffects.set(key, { ...(AppState.ui.combatEffects.get(key) || remembered), spawnStarted: now, spawnUntil: now + 4500 });
        const defeated = fighter.side === 'monster' && (fighter.hpPercent === 0 || fighter.hp <= 0);
        if (defeated && (!previous || (previous.hpPercent !== 0 && previous.hp > 0)) && recordCombatEffect(key, 'death', fighter, 3600)) {
          AppState.ui.combatEffects.set(key, { ...(AppState.ui.combatEffects.get(key) || remembered), deathStarted: now, deathUntil: now + 3600 });
        }
        const effect = AppState.ui.combatEffects.get(key) || remembered;
        const activeHeal = effect.healUntil > now ? effect.healAmount : 0;
        return { ...fighter, effectStarted: { hit: hit ? now : previous?.effectStarted?.hit, heal: effect.healStarted, spawn: effect.spawnStarted, death: effect.deathStarted }, hit, healAmount: healAmount || activeHeal, healStartPercent: healAmount && Number.isFinite(previous?.hpPercent) ? previous.hpPercent : null, spawn: spawn || effect.spawnUntil > now, lostPercent: hit && Number.isFinite(previous.hpPercent) ? Math.max(fighter.hpPercent || 0, previous.hpPercent) : null, dead: defeated || effect.deathUntil > now };
      });
  }
