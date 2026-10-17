  function discoverNativeTraits(Page, modules) {
    if (!Page) return null;
    const source = Function.prototype.toString.call(Page);
    const binding = name => source.match(new RegExp(`this\\.${name}\\s*=\\s*([\\w$]+)\\.([\\w$]+)`));
    const catalog = binding('TRAIT_DATA'), sets = binding('TRAIT_SET_DATA');
    const level = binding('calcTraitLevel'), gain = binding('calcTraitExpGain'), claim = binding('canClaimTraitSet');
    const limitSource = source.split('this.equipLimit$=')[1]?.split(',this.')[0];
    const limit = limitSource?.match(/=>\s*\(0,\s*([\w$]+)\.([\w$]+)\)\(/);
    if (!catalog || !sets || !level || !gain || !claim || !limit || catalog[1] !== sets[1]
      || [gain, claim, limit].some(match => match[1] !== level[1])) return null;
    const catalogs = modules.filter(module => {
      const traits = Object.values(module[catalog[2]] || {}), bonuses = Object.values(module[sets[2]] || {});
      return traits.some(trait => trait?.name === 'Woodcutting XP') && traits.every(trait => quickId(trait?.id) && typeof trait.name === 'string')
        && bonuses.length === 12 && bonuses.every(set => quickId(set?.id) && /^Lv\. (100|115|130) (Forest|Mountain|Ocean|All) Set$/.test(set.name)
          && Number.isFinite(set.exp) && set.exp > 0 && Array.isArray(set.traitIds) && set.traitIds.length
          && set.traitIds.every(id => module[catalog[2]][id]));
    });
    const calculations = modules.filter(module => [level, gain, claim, limit].every(match => typeof module[match[2]] === 'function'));
    if (catalogs.length !== 1 || calculations.length !== 1) return null;
    return { catalog: catalogs[0][catalog[2]], sets: catalogs[0][sets[2]], level: calculations[0][level[2]],
      gain: calculations[0][gain[2]], canClaim: calculations[0][claim[2]], capacity: calculations[0][limit[2]] };
  }

  function traitStateAvailable(runtime) {
    const state = runtime?.state;
    return Boolean(quickOwner(runtime) && runtime.traits && !state.loadingApp && !state.syncingData && state.appActive !== false);
  }

  function readTraits(runtime = quickRuntime(), user = runtime?.state?.user) {
    const native = runtime?.traits;
    if (!traitStateAvailable(runtime) || !masteryRecord(user?.traits?.storage) || !masteryRecord(user.traits.equippedIds) || !masteryRecord(user.traits.upgrades)
      || (user.traits.sets !== undefined && !masteryRecord(user.traits.sets))) return null;
    try {
      const traits = Object.values(native.catalog).map(trait => {
        const unlocked = Object.hasOwn(user.traits.storage, trait.id), stored = user.traits.storage[trait.id];
        if (unlocked && (stored?.id !== trait.id || masteryNumber(stored.exp) === null)) throw new Error('Invalid Trait XP');
        const level = unlocked ? native.level(user, trait.id) : 0;
        if (!Number.isFinite(level) || level < 0) throw new Error('Invalid Trait level');
        return { id: trait.id, name: trait.name, image: masteryImage(`/assets/${trait.image}`), unlocked, xp: unlocked ? stored.exp : 0, level };
      });
      const equipped = Object.keys(user.traits.equippedIds), capacity = native.capacity(user);
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 3 || equipped.length > capacity
        || equipped.some(id => !user.traits.equippedIds[id] || !traits.some(trait => trait.id === id && trait.unlocked))) return null;
      const sets = Object.values(native.sets).map(set => {
        const match = set.name.match(/^Lv\. (100|115|130) (Forest|Mountain|Ocean|All) Set$/);
        if (!match || !Number.isFinite(set.exp) || set.exp <= 0 || !set.traitIds?.length
          || set.traitIds.some(id => !traits.some(trait => trait.id === id))) throw new Error('Invalid Trait set');
        const ready = native.canClaim(user, set.id);
        if (typeof ready !== 'boolean') throw new Error('Invalid Trait claim state');
        return { id: set.id, name: set.name, description: set.description || '', level: Number(match[1]), region: match[2],
          xp: set.exp, traitIds: [...set.traitIds], claimed: Boolean(user.traits.sets?.[set.id]), ready };
      });
      // A complete catalog is needed to distinguish finished from missing sets.
      if (sets.length !== 12 || new Set(sets.map(set => `${set.region}:${set.level}`)).size !== 12) return null;
      const allIds = traits.map(trait => trait.id);
      for (const level of [100, 115, 130]) {
        const group = sets.filter(set => set.level === level), all = group.find(set => set.region === 'All');
        if (!all || new Set(all.traitIds).size !== allIds.length || allIds.some(id => !all.traitIds.includes(id))
          || group.some(set => set.xp !== all.xp)) return null;
      }
      let training = 'unknown';
      if (user.action === null) training = 'idle';
      else if (user.action?.skillId && user.action?.actionId) {
        const gain = native.gain(user);
        if (masteryNumber(gain) !== null) training = gain > 0 ? 'running' : 'sigil';
      }
      return { traits, equipped, capacity, sets, training };
    } catch { return null; }
  }

  function requestTraitMutation(runtime, method, id, owner, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let finished = false, subscription;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        subscription?.unsubscribe();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Trait request timed out. Refresh to check its outcome.')), timeoutMs);
      Promise.resolve().then(() => {
        quickAssertOwner(owner, runtime);
        if (!['equipTrait', 'unequipTrait', 'claimTraitSet'].includes(method) || typeof runtime.firebase?.[method] !== 'function') throw new Error('Trait controls are unavailable in this game build.');
        return runtime.zone.run(() => runtime.firebase[method](id));
      }).then(response => {
        if (finished) return;
        quickAssertOwner(owner, runtime);
        if (typeof response?.subscribe !== 'function') throw new Error('Trait response unavailable. Refresh to check its outcome.');
        subscription = runtime.zone.run(() => response.subscribe({ next: value => finish(null, value), error: error => finish(error),
          complete: () => finish(new Error('Trait request returned no state.')) }));
        if (finished) subscription?.unsubscribe();
      }).catch(error => finish(error));
    });
  }

  async function readCurrentTraits(runtime, owner) {
    quickAssertOwner(owner, runtime);
    if (!traitStateAvailable(runtime)) throw new Error('Trait data is unavailable while the game is loading or synchronizing.');
    // A plain read avoids replaying action loops, which may collect a finished
    // batch. Trait controls must never start, stop, or collect the main action.
    const response = await runtime.zone.run(() => requestNativeUser(runtime.firebase));
    quickAssertOwner(owner, runtime);
    if (!traitStateAvailable(runtime)) throw new Error('Trait data became unavailable during the check.');
    const remote = { ...runtime, state: { ...runtime.state, user: response?.user } };
    if (quickOwner(remote) !== owner) throw new Error('Character changed during the Trait check.');
    const snapshot = readTraits(remote, response.user);
    if (!snapshot) throw new Error('Current Trait data unavailable. No further change was requested.');
    return { snapshot, traits: response.user.traits };
  }

  function applyNativeTraits(runtime, owner, traits) {
    quickAssertOwner(owner, runtime);
    const user = { ...runtime.state.user, traits };
    if (!readTraits(runtime, user)) throw new Error('Updated Trait data unavailable. Refresh to check the outcome.');
    runtime.zone.run(() => runtime.state.user$.next(user));
  }
