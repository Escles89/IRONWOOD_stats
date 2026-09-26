  function discoverNativeMastery(Page, modules) {
    if (!Page) return null;
    // Read the route component's named bindings, never construct a component
    // or depend on a particular build's minified module/export identifiers.
    const source = Function.prototype.toString.call(Page);
    const binding = name => source.match(new RegExp(`this\\.${name}\\s*=\\s*([\\w$]+)\\.([\\w$]+)`));
    const catalog = binding('MASTERY_DATA'), cost = binding('MASTERY_COST'), exp = binding('MASTERY_EXP'), required = binding('calcMasteryItems');
    if (!catalog || !cost || !exp || !required || cost[1] !== catalog[1] || exp[1] !== catalog[1]) return null;
    const catalogs = modules.filter(module => module[catalog[2]]?.['1']?.name === 'Woodcutting'
      && module[catalog[2]]['1'].items && module[catalog[2]]['1'].badgeId);
    const calculations = modules.filter(module => typeof module[required[2]] === 'function');
    if (catalogs.length !== 1 || calculations.length !== 1) return null;
    const data = catalogs[0];
    return { catalog: data[catalog[2]], cost: masteryNumber(data[cost[2]]), exp: masteryNumber(data[exp[2]]), required: calculations[0][required[2]] };
  }

  // This is the native Current Loot source, not inventory, queues or the
  // independent House/Taming/Attunement services. An absent map is not empty.
  function readMasteryCurrentLoot(runtime, collectionPending) {
    const state = runtime?.state, service = runtime?.action, action = state?.user?.action;
    const actions = runtime?.skillCatalog?.[action?.skillId]?.actions;
    const active = quickId(action?.skillId) && action.skillId !== '15' && quickId(action.actionId)
      && Array.isArray(actions) && actions.some(entry => entry?.id === action.actionId)
      && runtime.actionCatalog?.[action.actionId] && typeof action.startDate === 'string'
      && Number.isFinite(Date.parse(action.startDate));
    const actionKey = active ? JSON.stringify([action.skillId, action.actionId, action.startDate]) : action === null ? 'idle' : '';
    const unavailable = { complete: false, items: {}, actionKey, observedAt: null, retained: false };
    if (collectionPending || !quickOwner(runtime) || state.loadingApp !== false || state.syncingData !== false || state.appActive === false
      || service?.actionLoading !== false || !masteryRecord(service.actionLoot) || (active && !service.actionSeed)) return unavailable;
    if (!active && action !== null) return unavailable;
    if (action === null && Object.keys(service.actionLoot).length) return unavailable;
    const items = {};
    let complete = true;
    for (const [id, entry] of Object.entries(service.actionLoot)) {
      const item = runtime.catalog?.[id], amount = masteryNumber(entry?.amount);
      if (!quickId(id) || !item || (item.id && item.id !== id) || (entry?.id && entry.id !== id) || amount === null) {
        complete = false;
        continue;
      }
      items[id] = amount;
    }
    return { complete, items, actionKey, observedAt: Date.now(), retained: false };
  }
