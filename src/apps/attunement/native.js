  function discoverNativeAttunement(Page, modules) {
    if (!Page) return null;
    const source = Function.prototype.toString.call(Page);
    const binding = name => source.match(new RegExp(`this\\.${name}\\s*=\\s*([\\w$]+)\\.([\\w$]+)`));
    const passive = binding('ATTUNEMENT_PASSIVE_DATA'), slot = binding('ATTUNEMENT_SLOT_DATA');
    const cost = binding('calcAttunementPassiveCost');
    if (!passive || !slot || !cost || passive[1] !== slot[1]) return null;
    const catalogs = modules.filter(module => {
      const values = Object.values(module[passive[2]] || {});
      return values.length === 3 && ['XP', 'Loot', 'Efficiency'].every(name => values.some(item => item?.name === name
        && item.id != null && Number.isSafeInteger(item.max) && item.max > 0 && item.cost > 0))
        && Object.values(module[slot[2]] || {}).some(item => item?.name === 'Forest Slot' && item.regionId != null);
    });
    const calculations = modules.filter(module => typeof module[cost[2]] === 'function');
    if (catalogs.length !== 1 || calculations.length !== 1) return null;
    return { passives: catalogs[0][passive[2]], slots: catalogs[0][slot[2]], cost: calculations[0][cost[2]] };
  }

  function readAttunementProgression(runtime) {
    try {
      runtime ||= findNativeSyncRuntime(globalThis);
      const state = runtime.state, user = state?.user$?.getValue?.() || state?.user;
      const native = runtime.attunementProgression;
      if (!user?.attunements || !native || state.swappingCharacter || state.loadingApp || state.syncingData || state.newVersion) return null;
      const catalog = Object.values(runtime.attunementCatalog || {});
      const passives = Object.values(native.passives);
      const shard = Object.values(runtime.catalog || {}).find(item => item.image === 'items/attunement-shard.png');
      const slots = Object.values(user.attunements.slots || {});
      if (!catalog.length || !shard || !runtime.regionCatalog) return null;
      if (slots.some(slot => !slot || !catalog.some(item => item.id === slot.id))) return null;
      const skills = catalog.map(item => {
        const stats = user.stats?.attunements?.[item.id];
        const earned = stats?.points ?? 0, spent = stats?.spentPoints ?? 0;
        const owned = Number.isSafeInteger(earned) && Number.isSafeInteger(spent) && earned >= 0 && spent >= 0 ? earned - spent : null;
        let pending = 0;
        for (const slot of slots.filter(slot => slot.id === item.id)) {
          const count = slot.loot?.[shard.id]?.amount ?? 0;
          if (!slot.loot || !Number.isSafeInteger(count) || count < 0) { pending = null; break; }
          pending += count;
        }
        const levels = {}, costs = {};
        for (const passive of passives) {
          levels[passive.id] = user.attunements.passives?.[item.id]?.[passive.id] ?? 0;
          if (levels[passive.id] < passive.max) costs[passive.id] = native.cost(user, item.id, passive.id);
        }
        return { id: item.id, name: item.name, image: item.image, skillId: item.skillId, owned, pending, levels, costs };
      });
      const regions = Object.values(runtime.regionCatalog).map(region => {
        const slot = Object.values(native.slots).find(slot => slot.regionId === region.id);
        const members = region.skills.map(id => catalog.find(item => item.skillId === id));
        if (!slot || members.some(item => !item || !slot.attunements?.[item.id])) throw new Error('Attunement region unavailable');
        return { id: region.id, name: region.name, skillIds: members.map(item => item.id),
          selectedId: user.attunements.slots?.[slot.id]?.id || null };
      });
      return { skills, passives, regions };
    } catch { return null; }
  }

  function attunementProgression() {
    return buildAttunementProgression(readAttunementProgression());
  }
