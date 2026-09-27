  function recipePreviewPlan() {
    const shopping = shoppingObserve();
    return shopping.plan ? { kind: 'recipe', target: { itemId: shopping.plan.itemId, quantity: shopping.plan.quantity, recipeKey: shopping.plan.recipeKey, recipes: { ...shopping.plan.recipes } }, conversions: { ...shopping.conversions }, sources: { ...shopping.plan.sources }, quantities: { ...shopping.plan.quantities }, selected: null } : null;
  }

  function recipeObservation(plan, slot = 'active') {
    if (!plan || !quickOwner(quickRuntime())) return null;
    const runtime = quickRuntime(), ui = AppState.ui.recipePlan;
    const signature = JSON.stringify([quickOwner(runtime), plan, recipeCatalog(runtime).revision, runtime.state.user.inventory,
      Object.keys(SHOPPING_RESOURCES).map(id => runtime.state.user[id]), runtime.state.user.skills, runtime.state.user.equipment,
      plannedActionIdentity(runtime.state.user.action), runtime.action?.actionLoot]);
    const unavailable = shoppingPending(runtime) || runtime.state.loadingApp !== false || runtime.state.syncingData !== false || runtime.action?.actionLoading !== false || !shoppingRecord(runtime.state.user.inventory);
    const cached = ui[slot];
    if (!unavailable && cached?.signature === signature) return cached.snapshot;
    if (unavailable && cached?.owner === quickOwner(runtime) && cached.plan === JSON.stringify(plan)) return { ...cached.snapshot, unavailable: true };
    const snapshot = { ...recipeCalculate(runtime, plan), unavailable, observedAt: Date.now() };
    ui[slot] = { signature, snapshot, owner: quickOwner(runtime), plan: JSON.stringify(plan) };
    return snapshot;
  }

  function recipeOpenPlanner(trigger) {
    quickObserve();
    AppState.ui.quickSkills.trigger = trigger;
    AppState.ui.quickSkills.open = true;
    AppState.ui.recipePlan.open = true;
    render();
    document.querySelector('#iw-quick-skills-panel [data-quick-close]')?.focus();
  }

  function recipeActivate(control) {
    const ui = plannedObserve(), plan = recipePreviewPlan();
    if (!ui.owner || !plan || quickBusy()) return;
    if (control.dataset.recipeUse !== JSON.stringify([ui.owner, plan])) { ui.message = 'Calculator target changed. Review the preview before using it as a plan.'; render(); return; }
    const snapshot = recipeObservation(plan, 'preview');
    for (const node of snapshot.nodes) if (node.chosen && node.id !== plan.target.itemId && !plan.sources[node.id]) plan.sources[node.id] = node.chosen.key;
    if (plannedPersist(plan)) ui.editing = false;
    render();
  }

  function recipeChange(control, field) {
    const ui = plannedObserve(), active = control.dataset.recipeScope === 'active';
    const plan = active ? ui.plan : recipePreviewPlan();
    if (!ui.owner || control.dataset.recipeOwner !== ui.owner || plan?.kind !== 'recipe' || quickBusy()) return;
    const snapshot = recipeObservation(plan, active ? 'active' : 'preview');
    const step = snapshot?.steps.find(step => step.id === control.dataset.recipeItem);
    if (!step) return;
    const updated = JSON.parse(JSON.stringify(plan));
    if (field === 'source') {
      if (!step.choices.some(choice => choice.key === control.value)) return;
      if (step.id === updated.target.itemId) updated.target.recipeKey = control.value;
      else updated.sources[step.id] = control.value;
      delete updated.quantities[step.key];
    } else if (field === 'quantity') {
      if (!step.target?.finite || !quickAmount(Number(control.value))) return;
      updated.quantities[step.key] = Number(control.value);
    } else if (field === 'selected') {
      if (!step.ready) return;
      updated.selected = step.key;
    }
    if (active) plannedPersist(updated);
    else {
      AppState.ui.shopping.plan.recipeKey = updated.target.recipeKey;
      AppState.ui.shopping.plan.sources = updated.sources;
      AppState.ui.shopping.plan.quantities = updated.quantities;
      shoppingPersist();
    }
    render();
  }

  function recipeStepToken(owner, plan, step) {
    return JSON.stringify([owner, plan, step ? [step.key, step.target?.skillId, step.target?.actionId, step.amount, step.missing, step.ready] : null]);
  }

  function recipeStartReason(snapshot, runtime = quickRuntime()) {
    if (quickBusy()) return 'Another action is in progress.';
    if (!snapshot || snapshot.unavailable) return 'Current balances unavailable. Refresh to check.';
    const current = plannedCurrentState(runtime);
    if (current.kind === 'completed') return 'Collect completed work before starting next.';
    if (current.kind !== 'idle') return current.reason;
    return snapshot.next ? snapshot.next.reason : snapshot.shortfall === 0 ? 'Target satisfied' : 'No ready action. Resolve a requirement or source choice.';
  }

  function recipeValidateSnapshot(runtime, plan, token) {
    const ui = plannedObserve();
    if (ui.plan !== plan) throw new Error('The active plan changed. Review it before starting.');
    const snapshot = recipeCalculate(runtime, plan);
    if (recipeStepToken(ui.owner, plan, snapshot.next) !== token)
      throw new Error('The next action or quantity changed. Review the updated choice and click Start next again.');
    if (!snapshot.next?.ready) throw new Error('The displayed step is no longer ready.');
    return snapshot.next;
  }

  function recipeStart(control) {
    const ui = plannedObserve(), plan = ui.plan, snapshot = plan?.kind === 'recipe' ? recipeObservation(plan) : null;
    if (quickBusy() || !snapshot) return;
    try {
      const step = recipeValidateSnapshot(quickRuntime(), plan, control.dataset.recipeStart);
      const reason = recipeStartReason(snapshot);
      if (reason) throw new Error(reason);
      ui.message = '';
      const target = { ...step.target, recipePlan: plan, recipeToken: control.dataset.recipeStart };
      return quickResume(target.skillId, { planned: { plan: { ...target, amount: step.amount, recipe: plan, token: control.dataset.recipeStart }, target } });
    } catch (error) { ui.message = error.message; render(); }
  }

  function recipeCollectionToken() {
    return JSON.stringify([quickOwner(quickRuntime()), plannedActionIdentity(quickRuntime()?.state.user.action)]);
  }

  async function recipeCollect(control) {
    const runtime = quickRuntime(), ui = plannedObserve(), owner = ui.owner;
    const target = quickRunningTarget(runtime), current = plannedCurrentState(runtime);
    if (!owner || quickBusy() || !target || !['continuous', 'completed'].includes(current.kind)) return;
    if (control.dataset.recipeCollect !== recipeCollectionToken()) { ui.message = 'Current work changed. Review it before collecting.'; render(); return; }
    const source = plannedActionIdentity(runtime.state.user.action);
    AppState.ui.quickSkills.busy = true;
    const request = { cancelled: false, attempted: false };
    AppState.ui.quickSkills.request = request;
    ui.message = 'Collecting current work…';
    render();
    let confirmed = false, rewards = [], detailsKnown = false, failure = '';
    const assertCurrent = collecting => {
      quickAssertOwner(owner, runtime);
      if (request.cancelled || plannedActionIdentity(runtime.state.user.action) !== source)
        throw new Error('Current work changed or collection was cancelled. No further action requested.');
      const state = plannedCurrentState(runtime, collecting);
      if (!['continuous', 'completed'].includes(state.kind)) throw new Error(state.reason || 'Collection is unavailable.');
      if (AppState.ui.collectingLoot || AppState.ui.nativeSync?.running || AppState.ui.nativeCollectionPending || AppState.ui.pendingLootClaim
        || AppState.ui.collectingTaming || AppState.ui.collectingAttunementLoot || AppState.ui.collectingAutomation || AppState.ui.runningChallenge)
        throw new Error('Another collection is in progress.');
    };
    try {
      await withPlannedPage(`/skill/${target.skillId}/action/${target.actionId}`, 'skill-page', async (doc, frameWindow) => {
        const native = await quickNativeReady(doc, frameWindow, target, true);
        assertCurrent(false);
        const stop = native.stopButton();
        if (!stop || stop.disabled) throw new Error('Native Stop & Loot control unavailable.');
        const observation = quickObserveRequests(native.runtime, target, () => quickAssertOwner(owner, runtime),
          async () => { throw new Error('Collection never starts another action.'); }, async () => {
            await plannedReadCurrent(owner, source);
            assertCurrent(true);
          });
        const receipt = observeCollectionRewards(frameWindow, ['stopAction'], native.runtime);
        native.guardCollection(() => {
          try { assertCurrent(false); return true; }
          catch (error) { observation.refuse(error); return false; }
        });
        try {
          await plannedReadCurrent(owner, source);
          assertCurrent(false);
          request.attempted = true;
          native.collect().then(success => { if (!success) observation.refuse(new Error('Collection was not confirmed. Plan kept.')); }, error => observation.refuse(error));
          await quickWaitUntil(() => receipt.confirmed() && runtime.state.user.action === null, observation, 12000);
          quickAssertOwner(owner, runtime);
        } finally {
          confirmed = receipt.confirmed(); rewards = receipt.rewards(); detailsKnown = receipt.detailsKnown();
          receipt.restore(); observation.restore();
        }
      });
    } catch (error) { failure = error.message; }
    finally {
      AppState.ui.quickSkills.busy = false;
      AppState.ui.quickSkills.request = null;
      if (ui.owner === owner) { ui.observation = null; ui.message = confirmed ? 'Collection confirmed. Plan recalculated from owned inventory; start the next action when ready.' : failure || 'Collection unconfirmed. Plan kept.'; }
      showActionToast({ title: confirmed ? 'Collected current work' : 'Collection not confirmed', kind: confirmed && !failure ? 'success' : 'warning',
        metrics: rewards.map(reward => ({ label: reward.name, image: reward.image, icon: reward.icon, value: formatNumber(reward.amount) })),
        detail: confirmed && !detailsKnown ? 'Reward details unavailable.' : '', warning: failure });
      AppState.ui.lastSignature = '';
      render();
    }
  }

  async function recipeRefresh() {
    const ui = plannedObserve(), runtime = quickRuntime(), owner = ui.owner;
    if (!owner || quickBusy()) return;
    AppState.ui.quickSkills.busy = true;
    ui.message = 'Refreshing observed inventory…';
    render();
    try {
      const response = await plannedReadCurrent(owner, plannedActionIdentity(runtime.state.user.action));
      quickAssertOwner(owner, runtime);
      // The verified current action is unchanged. Update user observations,
      // without replaying the native action loop (which can collect work).
      runtime.state.syncUser(response.user);
      ui.observation = null;
      ui.message = 'Inventory observed. Review the next action before starting.';
    } catch (error) { if (ui.owner === owner) ui.message = `Refresh unavailable: ${error.message}`; }
    finally { AppState.ui.quickSkills.busy = false; render(); }
  }
