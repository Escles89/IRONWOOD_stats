  function buildAttunementProgression(snapshot) {
    const unavailable = { availability: 'unknown', regions: [] };
    if (!snapshot?.skills?.length || !snapshot.passives?.length || !snapshot.regions?.length) return unavailable;
    const { skills, passives, regions } = snapshot;
    const amount = value => Number.isSafeInteger(value) && value >= 0;
    if (skills.some(skill => !amount(skill.owned) || (skill.pending !== null && !amount(skill.pending))
      || passives.some(passive => !amount(skill.levels[passive.id]) || skill.levels[passive.id] > passive.max
        || (skill.levels[passive.id] < passive.max && (!amount(skill.costs[passive.id]) || !skill.costs[passive.id]))))) return unavailable;
    const candidates = skills.flatMap((skill, skillOrder) => passives.flatMap((passive, passiveOrder) => {
      const level = skill.levels[passive.id];
      if (level >= passive.max) return [];
      const cost = skill.costs[passive.id], missingNow = Math.max(0, cost - skill.owned);
      const missing = !missingNow ? 0 : skill.pending === null ? null : Math.max(0, missingNow - skill.pending);
      // A purchase advances a set only when this skill is its sole minimum.
      const sets = [...regions, { name: 'All', skillIds: skills.map(item => item.id) }];
      const gains = sets.filter(set => set.skillIds.includes(skill.id) && set.skillIds.every(id => {
        const member = skills.find(item => item.id === id);
        return member && (id === skill.id || member.levels[passive.id] > level);
      })).map(set => `${set.name} ${passive.name} ${level} → ${level + 1}`);
      return [{ ...skill, passiveId: passive.id, passive: passive.name, level, next: level + 1, cost,
        missingNow, missing, gains, order: skillOrder * passives.length + passiveOrder,
        state: !missingNow ? 'ready' : missing === 0 ? 'collect' : 'gather' }];
    }));
    const availability = candidates.some(item => item.state === 'ready') ? 'ready'
      : candidates.some(item => item.state === 'collect') ? 'collect' : 'none';
    return { availability, regions: regions.map(region => {
      const choices = candidates.filter(item => region.skillIds.includes(item.id));
      if (!choices.length) return { ...region, state: 'complete', target: null };
      const lowest = Math.min(...choices.map(item => item.level));
      const balanced = choices.filter(item => item.level === lowest);
      if (balanced.some(item => item.missing === null)) return { ...region, state: 'unknown', target: null };
      balanced.sort((a, b) => a.missing - b.missing || b.gains.length - a.gains.length
        || Number(b.id === region.selectedId) - Number(a.id === region.selectedId) || a.order - b.order);
      return { ...region, state: 'target', target: balanced[0] };
    }) };
  }
