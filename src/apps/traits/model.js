  function buildTraitTracking(snapshot, preference = '', previous = null) {
    if (!snapshot) return { available: false, rows: [], sets: [], recommendations: [], warning: '' };
    const { traits, equipped, capacity, training } = snapshot;
    const byId = new Map(traits.map(trait => [trait.id, trait]));
    const sets = snapshot.sets.map(set => ({ ...set, reached: set.traitIds.filter(id => byId.get(id).xp >= set.xp).length }));
    const target = sets.filter(set => set.region === 'All').sort((a, b) => a.level - b.level).find(set => set.reached < set.traitIds.length) || null;
    const preferred = sets.find(set => set.region === preference && set.level === target?.level);
    const rank = trait => preferred?.traitIds.includes(trait.id) ? 0 : 1;
    const candidates = target ? traits.filter(trait => trait.unlocked && trait.xp < target.xp && !equipped.includes(trait.id))
      .sort((a, b) => rank(a) - rank(b) || a.xp - b.xp || a.id.localeCompare(b.id, undefined, { numeric: true })) : [];
    const recommendations = [], used = new Set();
    const ordered = [...equipped].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const rows = Array.from({ length: capacity }, (_, index) => {
      const trait = byId.get(ordered[index]) || null, key = trait?.id || `empty:${index}`;
      let replacement = null;
      if (target && (!trait || trait.xp >= target.xp)) {
        const eligible = candidates.filter(item => !used.has(item.id));
        const retained = previous?.target?.id === target.id && previous.preference === preference
          ? eligible.find(item => previous.recommendations.some(entry => entry.key === key && entry.to === item.id)) : null;
        // Preserve a displayed choice while XP trickles into unequipped traits;
        // a newly available preferred-region candidate still takes priority.
        replacement = retained && rank(retained) === rank(eligible[0]) ? retained : eligible[0] || null;
        if (replacement) {
          used.add(replacement.id);
          recommendations.push({ key, from: trait?.id || '', to: replacement.id });
        }
      }
      return { key, trait, replacement, percent: trait && target ? Math.min(100, trait.xp / target.xp * 100) : null };
    });
    const locked = target ? traits.filter(trait => !trait.unlocked).length : 0;
    const ready = sets.filter(set => set.ready && !set.claimed).length;
    const warning = [recommendations.length ? `${recommendations.length} Trait training slot${recommendations.length === 1 ? '' : 's'} ready to change` : '',
      ready ? `${ready} Trait set bonus${ready === 1 ? '' : 'es'} ready to claim` : ''].filter(Boolean).join(' · ');
    return { available: true, target, preference, rows, sets, recommendations, training, locked, warning };
  }
