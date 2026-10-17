  const RECIPE_RUNNER_KEY = 'iw-status-recipe-run-v1:';

  function recipeRunnerRecord() {
    const ui = plannedObserve();
    if (!ui.owner || ui.plan?.kind !== 'recipe') return null;
    try {
      const record = JSON.parse(localStorage.getItem(RECIPE_RUNNER_KEY + ui.owner));
      if (record?.version !== 1 || typeof record.id !== 'string' || typeof record.enabled !== 'boolean'
        || record.planKey !== JSON.stringify(ui.plan) || typeof record.reason !== 'string'
        || !['waiting', 'running', 'starting', 'collecting', 'paused', 'attention', 'complete'].includes(record.status)) return null;
      if (record.batch && (!quickId(record.batch.itemId) || typeof record.batch.source !== 'string'
        || shoppingNumber(record.batch.beforeOwned) === null)) return null;
      return record;
    } catch { return null; }
  }

  function recipeRunnerWrite(record) {
    try {
      if (quickOwner(quickRuntime()) !== record.owner) throw new Error('Character changed.');
      localStorage.setItem(RECIPE_RUNNER_KEY + record.owner, JSON.stringify(record));
      return true;
    } catch {
      AppState.ui.recipeRunner.blockedId = record.id;
      AppState.ui.plannedAction.message = 'Automatic plan stopped: its state could not be saved. Resume after browser storage is available.';
      return false;
    }
  }

  function recipeRunnerBatch(runtime, step) {
    const action = runtime.state.user.action, beforeOwned = shoppingOwned(runtime, step.id);
    if (!quickSameAction(action, step.target) || beforeOwned === null
      || typeof action.startDate !== 'string' || !Number.isFinite(Date.parse(action.startDate))) return null;
    return { itemId: step.id, source: plannedActionIdentity(action), beforeOwned };
  }

  function recipeRunnerEnable() {
    const ui = plannedObserve(), runtime = quickRuntime();
    if (!ui.owner || ui.plan?.kind !== 'recipe' || quickBusy()) return;
    const snapshot = recipeCalculate(runtime, ui.plan);
    const batch = snapshot.running ? recipeRunnerBatch(runtime, snapshot.running) : null;
    const complete = snapshot.shortfall === 0;
    const record = { version: 1, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, owner: ui.owner,
      planKey: JSON.stringify(ui.plan), enabled: !complete, status: complete ? 'complete' : batch ? 'running' : 'waiting', batch,
      reason: complete ? 'Target satisfied.' : batch ? 'Following the current recipe action.' : 'Waiting for the next ready action.' };
    AppState.ui.recipeRunner.blockedId = null;
    recipeRunnerWrite(record);
  }

  function recipeRunnerPause(reason = 'Paused by you.') {
    const record = recipeRunnerRecord();
    if (!record?.enabled) return;
    recipeRunnerWrite({ ...record, enabled: false, status: 'paused', reason });
  }

  function recipeRunnerToggle() {
    if (recipeRunnerRecord()?.enabled) recipeRunnerPause();
    else recipeRunnerEnable();
    render();
  }

  function recipeRunnerInfo() {
    const record = recipeRunnerRecord();
    if (!record) return { status: 'paused', enabled: false, reason: 'Automatic progression is off. Resume to run this plan.' };
    if (AppState.ui.recipeRunner.blockedId === record.id) return { status: 'attention', enabled: false, reason: 'Browser storage is unavailable. Resume when it is available.' };
    if (record.enabled && !automationEnabled()) return { ...record, status: 'attention', reason: 'Enable script automation to run this plan.' };
    return record;
  }

  function recipeRunnerAssert(auth) {
    const ui = plannedObserve(), record = recipeRunnerRecord();
    if (!record?.enabled || record.id !== auth.id || record.owner !== auth.owner || ui.owner !== auth.owner
      || AppState.ui.recipeRunner.blockedId === auth.id || !automationEnabled() || document.hidden)
      throw new Error('Automatic plan was paused or is no longer available.');
    const saved = JSON.parse(localStorage.getItem(PLANNED_ACTION_KEY + auth.owner));
    if (record.planKey !== auth.planKey || JSON.stringify(saved?.plan) !== auth.planKey)
      throw new Error('The saved plan changed. Resume the updated plan.');
    if (recipeHasDraft('active') || AppState.ui.shopping.editing && AppState.ui.recipePlan.open && AppState.ui.recipePlan.view === 'calculator')
      throw new Error('Finish or cancel plan edits before continuing.');
  }

  function recipeRunnerCollectionDue(runtime, batch, collecting = false) {
    if (!batch || plannedActionIdentity(runtime.state.user.action) !== batch.source) return false;
    const state = plannedCurrentState(runtime, collecting);
    if (state.kind === 'completed') return true;
    if (state.kind !== 'continuous') return false;
    const plan = plannedObserve().plan;
    if (plan?.kind !== 'recipe') return false;
    const snapshot = recipeCalculate(runtime, plan);
    const requirement = snapshot.nodes.find(node => node.key === `item:${batch.itemId}`);
    const missing = requirement?.missing;
    const loot = runtime.action.actionLoot;
    const pending = shoppingRecord(loot) ? shoppingNumber(loot[batch.itemId]?.amount ?? 0) : null;
    return missing !== null && missing !== undefined && pending !== null && (missing === 0 || pending >= missing);
  }

  async function recipeRunnerRefresh(owner) {
    const runtime = quickRuntime();
    AppState.ui.quickSkills.busy = true;
    try {
      const response = await plannedReadCurrent(owner, plannedActionIdentity(runtime.state.user.action));
      runtime.state.syncUser(response.user);
      AppState.ui.recipePlan.active = null;
      AppState.ui.shopping.signature = '';
    } finally { AppState.ui.quickSkills.busy = false; }
  }

  async function recipeRunnerAdvance(record) {
    const runtime = quickRuntime(), auth = { owner: record.owner, id: record.id, planKey: record.planKey, batch: record.batch };
    const update = (status, reason, changes = {}) => {
      recipeRunnerAssert(auth);
      if (!recipeRunnerWrite({ ...record, status, reason, ...changes })) throw new Error('Automatic plan state could not be saved.');
    };
    try {
      recipeRunnerAssert(auth);
      // A saved in-flight request is an unknown outcome after reload or a crash.
      // Never replay it; Resume first reconciles the observed current action.
      if (['starting', 'collecting'].includes(record.status)) {
        update('attention', 'A previous request has an unconfirmed outcome. Check current work, then Resume.', { enabled: false });
        return;
      }
      const current = plannedCurrentState(runtime);
      if (current.kind === 'unknown') { update('waiting', current.reason); return; }
      if (record.batch) {
        if (current.kind === 'idle') {
          // Native finite work can collect itself between checks. Confirm an
          // inventory gain before accepting that external completion.
          await recipeRunnerRefresh(record.owner);
          recipeRunnerAssert(auth);
          const owned = shoppingOwned(runtime, record.batch.itemId);
          if (owned === null || owned <= record.batch.beforeOwned) throw new Error('Current work ended without confirmed inventory progress. Check it, then Resume.');
          update('waiting', 'Completed output observed. Recalculating the next step.', { batch: null });
          return;
        }
        if (plannedActionIdentity(runtime.state.user.action) !== record.batch.source)
          throw new Error('Current action changed outside this plan. Resume when ready.');
        if (!recipeRunnerCollectionDue(runtime, record.batch)) {
          update('running', current.kind === 'continuous' ? 'Gathering until the required output is ready to collect.' : 'Waiting for this batch to finish.');
          return;
        }
        update('collecting', 'Collecting completed plan work.');
        const result = await recipeCollect({ dataset: { recipeCollect: recipeCollectionToken() } }, auth);
        recipeRunnerAssert(auth);
        if (!result?.confirmed || result.failure) throw new Error(result?.failure || 'Collection was not confirmed. Check current work before resuming.');
        const owned = shoppingOwned(runtime, record.batch.itemId);
        const snapshot = recipeCalculate(runtime, plannedObserve().plan);
        if (owned === null || owned <= record.batch.beforeOwned && snapshot.shortfall !== 0)
          throw new Error('Collection produced no confirmed progress. Check the plan before resuming.');
        update('waiting', 'Collection confirmed. Preparing the next step.', { batch: null });
        return;
      }
      if (current.kind !== 'idle') {
        update('waiting', 'Waiting for existing work to end and its loot to be collected.');
        return;
      }
      // Every transition uses a fresh inventory observation. Waiting on manual
      // requirements rechecks only when an observation changes.
      const observed = recipeObservation(plannedObserve().plan);
      const observationKey = AppState.ui.recipePlan.active?.signature;
      if (record.status === 'attention' && record.observationKey === observationKey) return;
      if (!observed || observed.unavailable) return;
      await recipeRunnerRefresh(record.owner);
      recipeRunnerAssert(auth);
      const plan = plannedObserve().plan, snapshot = recipeObservation(plan);
      if (snapshot.shortfall === 0) { update('complete', 'Target satisfied.', { enabled: false }); return; }
      if (!snapshot.next?.ready) {
        update('attention', 'No ready action. Resolve manual requirements, supplies or source choices.', { observationKey: AppState.ui.recipePlan.active?.signature });
        return;
      }
      const step = snapshot.next;
      update('starting', `Starting ${step.target.name}.`);
      const result = await recipeStart({ dataset: { recipeStart: recipeStepToken(record.owner, plan, step) } }, auth);
      recipeRunnerAssert(auth);
      if (!result?.started || result.error || result.syncError) throw new Error(result?.error || result?.syncError || 'Start was not confirmed. Check current work before resuming.');
      const batch = recipeRunnerBatch(runtime, step);
      if (!batch) throw new Error('Started action identity is unavailable. Check current work before resuming.');
      update('running', `Running ${step.target.name}.`, { batch });
    } catch (error) {
      // A pause, replacement or owner change during an await must win over any
      // late continuation, including a confirmed request's final UI update.
      const latest = recipeRunnerRecord();
      if (latest?.id === record.id && latest.enabled && quickOwner(quickRuntime()) === record.owner)
        recipeRunnerWrite({ ...latest, enabled: false, status: 'attention', reason: error.message });
    }
  }

  async function recipeRunnerTick() {
    const state = AppState.ui.recipeRunner;
    if (state.checking || document.hidden || quickBusy() || shoppingPending(quickRuntime())) return;
    const record = recipeRunnerRecord();
    if (!record?.enabled || record.id === state.blockedId) return;
    if (!automationEnabled()) { recipeRunnerPause('Script automation is disabled. Enable it, then Resume.'); render(); return; }
    if (recipeHasDraft('active') || AppState.ui.shopping.editing && AppState.ui.recipePlan.open && AppState.ui.recipePlan.view === 'calculator') return;
    const locks = globalThis.navigator?.locks;
    if (!locks?.request) {
      recipeRunnerWrite({ ...record, enabled: false, status: 'attention', reason: 'This browser cannot coordinate automatic plans across tabs.' });
      render(); return;
    }
    state.checking = true;
    try {
      await locks.request(RECIPE_RUNNER_KEY + record.owner, { ifAvailable: true }, async lock => {
        if (!lock || quickBusy() || shoppingPending(quickRuntime())) return;
        const latest = recipeRunnerRecord();
        if (latest?.enabled && latest.id === record.id) await recipeRunnerAdvance(latest);
      });
    } catch (error) {
      recipeRunnerPause(`Automatic plan stopped: ${error.message}`);
    } finally {
      state.checking = false;
      render();
      syncHeaderActionBadges();
    }
  }
