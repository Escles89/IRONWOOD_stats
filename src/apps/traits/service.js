  const TRAITS_PREFERENCE_KEY = 'iw-status-traits-v1:';

  function traitsObserve(runtime = quickRuntime()) {
    const ui = AppState.ui.traits, owner = quickOwner(runtime);
    if (owner !== ui.owner) {
      Object.assign(ui, { owner, preference: '', model: null, message: '', retry: null, needsRefresh: false });
      if (owner) {
        try {
          const preference = localStorage.getItem(TRAITS_PREFERENCE_KEY + owner);
          if (['Forest', 'Mountain', 'Ocean'].includes(preference)) ui.preference = preference;
        } catch {}
      }
    }
    const snapshot = ui.needsRefresh ? null : readTraits(runtime);
    const transient = owner && !ui.needsRefresh && (runtime.state.loadingApp || runtime.state.syncingData || runtime.state.appActive === false);
    ui.model = !snapshot && transient && ui.model?.available
      ? { ...ui.model, stale: true, warning: '' }
      : { ...buildTraitTracking(snapshot, ui.preference, ui.model), stale: false };
    if (ui.retry && snapshot && ui.model.available && (!ui.model.target || ui.model.target.id !== ui.retry.target
      || snapshot.equipped.includes(ui.retry.to) || snapshot.equipped.length >= snapshot.capacity
      || !snapshot.traits.some(trait => trait.id === ui.retry.to && trait.unlocked && trait.xp < ui.model.target.xp))) ui.retry = null;
    return ui;
  }

  function setTraitPreference(preference) {
    const ui = traitsObserve();
    if (!ui.owner || ui.busy || !['', 'Forest', 'Mountain', 'Ocean'].includes(preference)) return;
    ui.preference = preference;
    ui.retry = null;
    ui.message = '';
    try { localStorage.setItem(TRAITS_PREFERENCE_KEY + ui.owner, preference); }
    catch { ui.message = 'Region preference could not be saved in this browser.'; }
    traitsObserve();
    render();
  }

  function traitControlsAvailable(runtime = quickRuntime()) {
    return Boolean(runtime?.state?.user$?.next && runtime.zone?.run
      && ['getUser', 'equipTrait', 'unequipTrait', 'claimTraitSet'].every(method => typeof runtime.firebase?.[method] === 'function'));
  }

  async function refreshTraits() {
    const ui = traitsObserve(), runtime = quickRuntime(), owner = ui.owner;
    if (!owner || quickBusy()) return;
    ui.busy = true;
    ui.message = 'Refreshing Traits…';
    render();
    try {
      const current = await readCurrentTraits(runtime, owner);
      applyNativeTraits(runtime, owner, current.traits);
      ui.needsRefresh = false;
      ui.message = '';
    } catch (error) {
      if (quickOwner(quickRuntime()) === owner) { ui.needsRefresh = true; ui.message = `Refresh unavailable: ${error.message}`; }
    } finally { ui.busy = false; traitsObserve(); render(); }
  }

  function assertTraitReplacement(snapshot, plan, preference, previous, retry = false) {
    const model = buildTraitTracking(snapshot, preference, previous);
    const candidate = snapshot.traits.find(trait => trait.id === plan.to);
    if (!model.target || model.target.id !== plan.target || !candidate?.unlocked || candidate.xp >= model.target.xp
      || snapshot.equipped.includes(plan.to)) throw new Error('The Trait recommendation changed. Check the updated panel.');
    if (retry) {
      if (snapshot.equipped.length >= snapshot.capacity) throw new Error('There is no empty Trait slot. Check the updated panel.');
    } else if (!model.recommendations.some(entry => entry.from === plan.from && entry.to === plan.to)) {
      throw new Error('The equipped Traits changed. Check the updated panel.');
    }
    return model;
  }

  async function runTraitControl(command) {
    const ui = traitsObserve(), runtime = quickRuntime(), owner = ui.owner;
    if (!owner || quickBusy() || ui.needsRefresh || !ui.model.available || ui.model.stale || !traitControlsAvailable(runtime)) return;
    const previous = ui.model, preference = ui.preference;
    const retry = command.type === 'retry';
    const recommendation = retry ? ui.retry : previous.recommendations.find(entry => entry.from === command.from && entry.to === command.to);
    const plan = recommendation ? { ...recommendation, target: previous.target?.id } : null;
    const claim = command.type === 'claim' ? previous.sets.find(set => set.id === command.id && set.ready && !set.claimed) : null;
    if (command.type === 'claim' ? !claim : !['switch', 'retry'].includes(command.type) || !plan) return;
    ui.busy = true;
    ui.message = claim ? `Checking ${claim.name}…` : 'Checking current Traits…';
    render();
    let unequipped = false, attempted = false;
    try {
      let current = await readCurrentTraits(runtime, owner);
      if (claim) {
        const ready = current.snapshot.sets.find(set => set.id === claim.id);
        if (!ready?.ready || ready.claimed) throw new Error('This Trait set is no longer ready to claim.');
        attempted = true;
        const result = await requestTraitMutation(runtime, 'claimTraitSet', claim.id, owner);
        applyNativeTraits(runtime, owner, result);
        if (!result.sets?.[claim.id]) throw new Error('The game did not confirm the Trait set claim.');
        ui.message = `${claim.name} claimed.`;
      } else {
        assertTraitReplacement(current.snapshot, plan, preference, previous, retry);
        if (plan.from && !retry) {
          attempted = true;
          const result = await requestTraitMutation(runtime, 'unequipTrait', plan.from, owner);
          applyNativeTraits(runtime, owner, result);
          if (result.equippedIds[plan.from]) throw new Error('The game did not confirm unequipping the Trait.');
          unequipped = true;
          // Equip is a separate request: recheck the server after unequip,
          // including capacity, XP, membership and character identity.
          current = await readCurrentTraits(runtime, owner);
          assertTraitReplacement(current.snapshot, plan, preference, previous, true);
        }
        attempted = true;
        const result = await requestTraitMutation(runtime, 'equipTrait', plan.to, owner);
        applyNativeTraits(runtime, owner, result);
        if (!result.equippedIds[plan.to]) throw new Error('The game did not confirm equipping the Trait.');
        ui.retry = null;
        ui.message = `${runtime.traits.catalog[plan.to].name} equipped for training.`;
      }
    } catch (error) {
      if (quickOwner(quickRuntime()) === owner) {
        let current = null;
        try {
          current = await readCurrentTraits(runtime, owner);
          applyNativeTraits(runtime, owner, current.traits);
          ui.needsRefresh = false;
        } catch { ui.needsRefresh = true; }
        const equipped = current?.snapshot.equipped;
        const changed = plan && equipped && !equipped.includes(plan.to) && equipped.length < current.snapshot.capacity
          && (!plan.from || !equipped.includes(plan.from));
        if (plan && (changed || unequipped || retry)) ui.retry = plan;
        if (plan && equipped?.includes(plan.to)) {
          ui.retry = null;
          ui.message = `${runtime.traits.catalog[plan.to].name} is equipped; confirmed after checking the game.`;
        } else if (claim && current?.traits.sets?.[claim.id]) ui.message = `${claim.name} is claimed; confirmed after checking the game.`;
        else ui.message = `${changed ? 'A Trait slot is empty. Retry equip when ready. ' : unequipped ? 'Unequip succeeded; equip is not confirmed. ' : attempted ? 'Trait change not confirmed. ' : ''}${error.message}${ui.needsRefresh ? ' Refresh before retrying.' : ''}`;
      }
    } finally {
      ui.busy = false;
      traitsObserve();
      render();
    }
  }
