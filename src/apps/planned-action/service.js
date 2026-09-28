  const PLANNED_ACTION_KEY = 'iw-status-planned-action-v1:';

  function plannedTargets(runtime = quickRuntime(), fresh = false) {
    if (!runtime) return [];
    const cache = AppState.ui.plannedCatalog;
    const cached = cache.entries.get(runtime);
    if (!fresh && cached && cached.skills === runtime.skillCatalog && cached.actions === runtime.actionCatalog) return cached.targets;
    const targets = quickSkills(runtime).filter(skill => skill.id !== '15').flatMap(skill => (Array.isArray(runtime?.skillCatalog?.[skill.id]?.actions) ? runtime.skillCatalog[skill.id].actions : []).flatMap(member => {
      const metadata = runtime.actionCatalog?.[member?.id];
      return quickId(member?.id) && metadata?.id === member.id && typeof metadata.name === 'string'
        ? [{ skillId: skill.id, actionId: member.id, skillName: skill.name, name: metadata.name, finite: quickFiniteAction(skill.id, metadata, runtime) }] : [];
    }));
    cache.entries.set(runtime, { skills: runtime.skillCatalog, actions: runtime.actionCatalog, targets });
    cache.revision++;
    return targets;
  }

  function plannedObserve() {
    const ui = AppState.ui.plannedAction, runtime = quickRuntime(), owner = quickOwner(runtime);
    if (ui.owner !== owner) {
      Object.assign(ui, { owner, plan: null, editing: false, draft: { skillId: '', actionId: '', amount: '' }, filter: '', message: '', observation: null });
      if (owner) try {
        const saved = JSON.parse(localStorage.getItem(PLANNED_ACTION_KEY + owner));
        const plan = saved?.plan;
        if (saved?.version === 2 && recipeValidPlan(plan)) ui.plan = plan;
        if (saved?.version === 1 && quickId(plan?.skillId) && plan.skillId !== '15' && quickId(plan.actionId)
          && (plan.amount === null || quickAmount(plan.amount))) ui.plan = { skillId: plan.skillId, actionId: plan.actionId, amount: plan.amount };
      } catch {}
    }
    return ui;
  }

  function plannedPersist(plan) {
    const ui = AppState.ui.plannedAction;
    if (!ui.owner || quickOwner(quickRuntime()) !== ui.owner) return false;
    try {
      localStorage.setItem(PLANNED_ACTION_KEY + ui.owner, JSON.stringify({ version: plan?.kind === 'recipe' ? 2 : 1, plan }));
      ui.plan = plan;
      AppState.ui.recipePlan.quantityDrafts = {};
      ui.message = '';
      ui.observation = null;
      return true;
    } catch { ui.message = 'The plan could not be saved in this browser.'; return false; }
  }

  function plannedCurrentState(runtime = quickRuntime(), collecting = false) {
    const unknown = reason => ({ kind: 'unknown', reason });
    if (!quickOwner(runtime)) return unknown('Character identity unavailable.');
    if ((!collecting && runtime.action?.actionLoading !== false) || runtime.state.loadingApp !== false || runtime.state.syncingData !== false || runtime.state.appActive === false)
      return unknown('Current action state is unknown or synchronizing. Refresh to check.');
    const action = runtime.state.user.action;
    if (action === null) return runtime.action.actionLoot && !Object.keys(runtime.action.actionLoot).length
      ? { kind: 'idle', reason: '' } : unknown('Current action state is inconsistent. Refresh to check.');
    const metadata = runtime.actionCatalog?.[action?.actionId];
    const members = runtime.skillCatalog?.[action?.skillId]?.actions;
    if (!quickId(action?.skillId) || !metadata || !Array.isArray(members) || !members.some(member => member?.id === action.actionId))
      return unknown('Current action state is unknown. Refresh to check.');
    if (!quickFiniteAction(action.skillId, metadata, runtime))
      return { kind: 'continuous', reason: 'Stop continuous work manually before starting the plan.' };
    const output = metadata.drops?.[0]?.id, loot = runtime.action.actionLoot;
    if (!output || !loot || typeof loot !== 'object' || Array.isArray(loot))
      return unknown('Finite batch progress is unknown. Refresh to check.');
    const completed = loot[output]?.amount;
    if (completed !== undefined && (!Number.isSafeInteger(completed) || completed < 0))
      return unknown('Finite batch progress is inconsistent. Refresh to check.');
    // The native engine caps finite work using primary-output loot, not loops
    // or elapsed estimates. Missing output is not evidence of completion.
    if (!quickAmount(action.amount) || typeof action.startDate !== 'string' || !Number.isFinite(Date.parse(action.startDate)))
      return unknown('Finite batch identity or quantity is unknown. Refresh to check.');
    if (Number.isSafeInteger(completed) && completed >= action.amount)
      return { kind: 'completed', reason: '' };
    return { kind: 'unfinished', reason: 'Finite batch completion is unconfirmed. Unfinished work cannot be interrupted. Refresh to check.' };
  }

  function plannedCurrentBlockReason(runtime = quickRuntime()) {
    return plannedCurrentState(runtime).reason;
  }

  function plannedReadyMessage(runtime = quickRuntime()) {
    return plannedCurrentState(runtime).kind === 'completed'
      ? 'Batch complete. Start when ready; the native start will collect its pending loot.' : 'Idle confirmed. Start when ready.';
  }

  function plannedActionIdentity(action) {
    return action === null ? 'idle' : JSON.stringify([action?.skillId, action?.actionId, action?.startDate, action?.seed, action?.amount, action?.coinCraft, action?.useContracts]);
  }

  async function plannedReadCurrent(owner, expected, target = null, amount = null) {
    const runtime = quickRuntime();
    quickAssertOwner(owner, runtime);
    // Do not run handleActionSync: native replay can automatically collect a
    // finished batch. Reading getUser supplies evidence without that mutation.
    const response = await runtime.zone.run(() => requestNativeUser(runtime.firebase));
    quickAssertOwner(owner, runtime);
    const remote = { ...runtime, state: { user: response?.user, isSolo: runtime.state.isSolo,
      swappingCharacter: runtime.state.swappingCharacter, newVersion: runtime.state.newVersion } };
    if (quickOwner(remote) !== owner)
      throw new Error('Character changed. Refresh before starting.');
    if (!response?.user?.inventory || response.user.action === undefined)
      throw new Error('Current action evidence is unavailable. Refresh to check.');
    if (plannedActionIdentity(response.user.action) !== expected)
      throw new Error('The current action changed. Refresh to check; no further action was requested.');
    if (target) {
      if (target.recipePlan) recipeValidateSnapshot({ ...runtime, state: { ...runtime.state, isSolo: runtime.state.isSolo, user: response.user } }, target.recipePlan, target.recipeToken);
      const reason = plannedKnownReason(remote, target);
      if (reason) throw new Error(reason);
      if (target.finite && (!quickAmount(amount) || amount > remote.craftLimit?.(remote.state.user, remote.actionCatalog[target.actionId])))
        throw new Error('Available supply changed. Start again to choose a new quantity.');
    }
    return response;
  }

  function plannedSave(form) {
    const ui = plannedObserve();
    if (!ui.owner || ui.owner !== form.dataset.plannedOwner || quickBusy()) return;
    const target = plannedTargets().find(target => target.skillId === form.elements.skill.value && target.actionId === form.elements.action.value);
    const amount = target?.finite ? Number(form.elements.amount?.value) : null;
    if (!target || (target.finite && !quickAmount(amount))) ui.message = 'Choose a current main action and a whole native quantity between 1 and 1,000,000.';
    else if (plannedPersist({ skillId: target.skillId, actionId: target.actionId, amount })) ui.editing = false;
    render();
  }

  function plannedEdit() {
    const ui = plannedObserve();
    if (!ui.owner || quickBusy()) return;
    ui.editing = true;
    ui.draft = ui.plan ? { ...ui.plan, amount: ui.plan.amount ?? '' } : { skillId: '', actionId: '', amount: '' };
    ui.filter = '';
    render();
    document.querySelector('[data-planned-field="skillId"]')?.focus();
  }

  function plannedDraft(control) {
    const ui = plannedObserve();
    if (!ui.owner || quickBusy()) return;
    const field = control.dataset.plannedField;
    if (!['skillId', 'actionId', 'amount', 'filter'].includes(field)) return;
    if (field === 'filter') ui.filter = control.value;
    else ui.draft[field] = control.value;
    if (field === 'skillId') { ui.draft.actionId = ''; ui.draft.amount = ''; }
    render();
  }

  function plannedClear() {
    if (!plannedObserve().owner || quickBusy()) return;
    if (plannedPersist(null)) AppState.ui.plannedAction.editing = false;
    render();
  }

  function plannedRequirementsKey(runtime, afterCollection = false) {
    const user = runtime.state.user;
    return JSON.stringify([user.equipment, user.skills, afterCollection ? null : user.inventory, afterCollection ? null : user.coins, user.traits, user.masteries,
      user.marks, user.adventure, user.guild, user.charcoal, user.compost, user.metalParts, user.sigilPieces, user.potionMix, user.arcanePowder]);
  }

  function plannedAssertStart(owner, plan, native, amount, transition, collecting = false) {
    quickAssertOwner(owner, native.runtime);
    const main = quickRuntime(), ui = AppState.ui;
    if (ui.quickSkills.request?.cancelled) throw new Error('Start cancelled. Plan kept.');
    if (ui.collectingLoot || ui.syncing || ui.nativeSync?.running || ui.runningChallenge || ui.collectingAttunementLoot
      || ui.collectingTaming || ui.collectingAutomation || ui.nativeCollectionPending || ui.pendingLootClaim || ui.recoveringActionView)
      throw new Error('Another action is in progress. The plan was kept.');
    const reason = plannedCurrentState(main, collecting).reason || plannedCurrentState(native.runtime, collecting).reason;
    if (reason) throw new Error(reason);
    if (transition) {
      if (plannedActionIdentity(main.state.user.action) !== (transition.collected() ? 'idle' : transition.source)
        || plannedActionIdentity(native.runtime.state.user.action) !== (transition.collected() ? 'idle' : transition.source))
        throw new Error('The current action changed. No further action was requested. Plan kept.');
    }
    if (plan.recipe) {
      if (plannedCurrentState(main, collecting).kind !== 'idle') throw new Error('Collect current work separately before starting next.');
      recipeValidateSnapshot(main, plan.recipe, plan.token);
    }
    if (AppState.ui.plannedAction.plan !== (plan.recipe || plan)) throw new Error('The plan changed. No start was requested.');
    const target = plannedTargets(main, true).find(target => quickSameAction(target, plan));
    if (!target || !plannedTargets(native.runtime, true).some(entry => quickSameAction(entry, plan))) throw new Error('The planned action is no longer in the native skill catalog.');
    if (location.pathname !== (transition?.visiblePath || STATS_PATH) || main.router?.url !== `/skill/${target.skillId}/action/${target.actionId}`)
      throw new Error('The native page changed. Plan kept.');
    if (!transition?.collected() && plannedRequirementsKey(main) !== transition.requirements) throw new Error('Native requirements changed while preparing. Refresh the plan before starting again.');
    if (transition?.collected() && plannedRequirementsKey(main, true) !== transition.stableRequirements)
      throw new Error('Native requirements changed during collection. Plan kept.');
    const requirementsReason = plannedKnownReason(main, target) || plannedKnownReason(native.runtime, target);
    if (requirementsReason) throw new Error(requirementsReason);
    if (target.finite && (typeof main.craftLimit !== 'function' || !Number.isFinite(main.craftLimit(main.state.user, main.actionCatalog[target.actionId])) || !quickAmount(amount) || amount > native.limit() || amount > main.craftLimit?.(main.state.user, main.actionCatalog[target.actionId])))
      throw new Error('Available supply changed. Start again to choose a new quantity.');
  }

  function plannedStart() {
    const ui = plannedObserve(), target = plannedTargets().find(target => quickSameAction(target, ui.plan));
    if (!target || quickBusy()) return;
    const reason = plannedCurrentBlockReason() || plannedKnownReason(quickRuntime(), target) || ui.observation?.reason;
    if (reason) { ui.message = reason; render(); return; }
    return quickResume(target.skillId, { planned: { plan: ui.plan, target } });
  }

  function plannedStarted(owner, plan) {
    const ui = AppState.ui.plannedAction;
    if (plan.recipe) return;
    if (ui.owner !== owner || ui.plan !== plan || quickOwner(quickRuntime()) !== owner) return;
    if (plannedPersist(null)) ui.editing = false;
    else {
      // A known successful start must never be offered as an automatic retry,
      // even when the browser refuses to persist the cleared record.
      ui.plan = null;
      ui.message = 'Action started. The saved plan could not be cleared from browser storage; clear it after reloading.';
    }
  }

  function plannedRequirements(runtime, target) {
    const metadata = runtime?.actionCatalog?.[target.actionId];
    const requirements = [];
    if (Number.isFinite(metadata?.level)) requirements.push(`Required level: ${metadata.level}`);
    if (Array.isArray(metadata?.materials)) requirements.push(metadata.materials.map(material => `${material.amount} ${runtime.catalog?.[material.id]?.name || 'material'}`).join(', '));
    if (metadata?.uniqueCraft) requirements.push('Unique craft: native ownership restrictions apply');
    if (metadata?.eliteKey) requirements.push('Requires an equipped elite key');
    requirements.push('Native equipment, supplies and access requirements are checked at Start.');
    return requirements.join(' · ');
  }

  async function plannedRefresh() {
    const ui = plannedObserve(), owner = ui.owner, plan = ui.plan;
    if (!owner || quickBusy()) return;
    // Use the existing shared lock; explicit refresh is read-only and never
    // triggers daily work. Age changes alone do not call this function.
    AppState.ui.quickSkills.busy = true;
    ui.message = 'Refreshing current state and requirements…';
    render();
    try {
      await plannedReadCurrent(owner, plannedActionIdentity(quickRuntime().state.user.action));
      quickAssertOwner(owner, quickRuntime());
      const target = plannedTargets().find(target => quickSameAction(target, plan));
      if (target) await withPlannedPage(`/skill/${target.skillId}/action/${target.actionId}`, 'skill-page', async (doc, frameWindow) => {
        const native = await quickNativeReady(doc, frameWindow, target, true);
        quickAssertOwner(owner, native.runtime);
        if (ui.plan === plan) ui.observation = { reason: native.eligibilityReason(), observedAt: Date.now() };
      });
      if (ui.owner === owner) ui.message = plannedCurrentBlockReason() || plannedReadyMessage();
    } catch (error) { if (ui.owner === owner) {
      ui.message = `Refresh unavailable: ${error.message}`;
      ui.observation = { reason: ui.message, observedAt: Date.now() };
    } }
    finally { AppState.ui.quickSkills.busy = false; render(); }
  }

  function plannedRenderKey() {
    const ui = plannedObserve(), runtime = quickRuntime();
    plannedTargets(runtime);
    return [ui.owner, ui.plan, ui.editing, ui.draft, ui.filter, ui.message, ui.observation,
      ui.plan?.kind === 'recipe' ? (recipeObservation(ui.plan), AppState.ui.recipePlan.active?.revision) : null,
      AppState.ui.plannedCatalog.revision, quickBusy(), plannedCurrentBlockReason(runtime),
      plannedKnownReason(runtime, plannedTargets(runtime).find(target => quickSameAction(target, ui.plan))),
      plannedKnownReason(runtime, plannedTargets(runtime).find(target => quickSameAction(target, ui.draft))), location.pathname,
      ui.observation ? Math.floor(Date.now() / 60000) : null];
  }

  function plannedKnownReason(runtime, target) {
    if (!runtime || !target) return '';
    const metadata = runtime.actionCatalog?.[target.actionId], user = runtime.state.user;
    try {
      // Combat's enemy level is not an entry requirement. The native effective
      // level includes bonuses, so base XP alone must not disable a target.
      const level = runtime.actionSkillLevel?.(user, target.skillId);
      if (!['6', '7', '8', '14'].includes(target.skillId) && Number.isFinite(level) && Number.isFinite(metadata?.level) && level < metadata.level)
        return `Requires ${target.skillName} level ${metadata.level}; current ${level}.`;
      if (Array.isArray(metadata?.materials) && runtime.craftLimit?.(user, metadata) === 0)
        return 'Insufficient materials for even one native quantity. Add supplies, then refresh.';
    } catch { /* Missing native calculations remain unknown, never zero. */ }
    return '';
  }
