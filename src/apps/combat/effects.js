  // Transition keys are scoped to observations, so a later identical hit is a new event.
  function recordCombatEffect(side, type, payload, ttl) {
    return EventLedger.record(`combat:${side}:${type}:${Date.now()}`, payload, ttl);
  }

  function combatEffectDelays(fighter, now = Date.now()) {
    return ['hit', 'heal', 'spawn', 'death'].map(type => {
      const started = fighter.effectStarted?.[type];
      return `--iw-${type}-delay:-${Number.isFinite(started) ? Math.max(0, now - started) : 0}ms`;
    }).join(';');
  }
