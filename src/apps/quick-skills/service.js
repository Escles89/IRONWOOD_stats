  const QUICK_SKILLS_KEY = 'iw-status-quick-skills-v1:';
  const QUICK_SKILL_ORDER = ['15', '1', '2', '3', '4', '11', '13', '12', '9', '10', '5', '16', '17', '6', '7', '14', '8'];
  const QUICK_SKILL_NAMES = ['Taming', 'Woodcutting', 'Mining', 'Smelting', 'Smithing', 'Enchanting', 'Farming', 'Alchemy', 'Fishing', 'Cooking', 'Delving', 'Imbuing', 'Exploring', 'One-handed', 'Two-handed', 'Ranged', 'Defense'];
  const quickId = value => typeof value === 'string' && /^[0-9]{1,10}$/.test(value);
  const quickAmount = value => Number.isSafeInteger(value) && value > 0 && value <= 1000000;
  const quickActionKey = target => `${target.skillId}:${target.actionId}`;
  const quickSameAction = (left, right) => !!left && !!right && left.skillId === right.skillId && left.actionId === right.actionId;

  function quickCraftingSkill(skillId, runtime) {
    return CRAFTING_SKILLS.has(runtime?.skillCatalog?.[skillId]?.name || QUICK_SKILL_NAMES[QUICK_SKILL_ORDER.indexOf(skillId)]);
  }

  function quickFiniteAction(skillId, metadata, runtime) {
    // Gathering can consume materials (for example, Farming's Seeds and
    // Compost) while still using Gather without any quantity or finite queue.
    return quickCraftingSkill(skillId, runtime) && Array.isArray(metadata?.materials);
  }

  function quickRuntime(targetWindow = globalThis) {
    try { return findNativeSyncRuntime(targetWindow); } catch { return null; }
  }

  function quickOwner(runtime) {
    const state = runtime?.state, user = state?.user;
    if (!user || state.swappingCharacter || state.newVersion || typeof user.displayName !== 'string' || !user.displayName.trim()
      || typeof state.isSolo !== 'boolean' || (typeof user.isSolo === 'boolean' && state.isSolo !== user.isSolo)) return null;
    return JSON.stringify([user.displayName, state.isSolo]);
  }

  function quickReadData(owner, runtime) {
    const data = { version: 1, last: {}, amounts: {} };
    if (!owner) return data;
    try {
      const saved = JSON.parse(localStorage.getItem(QUICK_SKILLS_KEY + owner));
      if (saved?.version !== 1) return data;
      for (const [skillId, target] of Object.entries(saved.last || {})) {
        if (!quickId(skillId) || target?.skillId !== skillId || !quickId(target.actionId) || typeof target.name !== 'string' || !target.name.trim() || target.name.length > 200) continue;
        data.last[skillId] = { skillId, actionId: target.actionId, name: target.name, finite: target.finite === true && quickCraftingSkill(skillId, runtime) };
      }
      for (const [key, value] of Object.entries(saved.amounts || {})) {
        if (!/^[a-zA-Z0-9_-]{1,80}:[a-zA-Z0-9_-]{1,80}$/.test(key) || !quickAmount(value?.amount) || typeof value.reuse !== 'boolean') continue;
        if (!quickCraftingSkill(key.split(':')[0], runtime)) continue;
        data.amounts[key] = { amount: value.amount, reuse: value.reuse };
      }
    } catch {}
    return data;
  }

  function quickPersist(owner, data) {
    if (!owner || quickOwner(quickRuntime()) !== owner) throw new Error('Character changed. Open Skills again.');
    localStorage.setItem(QUICK_SKILLS_KEY + owner, JSON.stringify(data));
  }

  function quickObserve() {
    const ui = AppState.ui.quickSkills, runtime = quickRuntime(), owner = quickOwner(runtime);
    if (ui.owner !== owner) {
      ui.prompt?.resolve(null);
      ui.prompt = null;
      ui.owner = owner;
      ui.data = quickReadData(owner, runtime);
      ui.message = owner ? '' : 'Character identity unavailable. Open a native skill page to continue.';
      ui.signature = '';
    }
    if (!ui.data) ui.data = quickReadData(owner, runtime);
    const action = runtime?.state.user?.action, metadata = runtime?.actionCatalog?.[action?.actionId];
    if (!owner || runtime.action?.actionLoading || !quickId(action?.skillId) || action.skillId === '15' || !quickId(action.actionId) || !metadata?.name) return runtime;
    const target = { skillId: action.skillId, actionId: action.actionId, name: metadata.name, finite: quickFiniteAction(action.skillId, metadata, runtime) };
    const previous = ui.data.last[target.skillId];
    if (quickSameAction(previous, target) && previous.name === target.name && previous.finite === target.finite) return runtime;
    ui.data.last[target.skillId] = target;
    try { quickPersist(owner, ui.data); }
    catch { ui.message = 'Last action could not be saved in this browser.'; }
    return runtime;
  }

  function quickSkills(runtime = quickRuntime()) {
    const nativeButtons = [...document.querySelectorAll('nav-component .scroll > button')];
    const catalog = runtime?.skillCatalog;
    const order = [...new Set(runtime?.skillOrder || QUICK_SKILL_ORDER)];
    return order.map(id => {
      const name = catalog?.[id]?.name || QUICK_SKILL_NAMES[QUICK_SKILL_ORDER.indexOf(id)];
      const button = nativeButtons.find(button => clean(button.querySelector('.name')?.textContent) === name);
      const level = clean(button?.querySelector('.level')?.textContent).match(/^Lv\.\s*(\d+)$/)?.[1];
      return { id, name, button, level };
    }).filter(skill => skill.name);
  }

  function quickBusy() {
    const ui = AppState.ui;
    return !!(ui.quickSkills.busy || ui.collectingLoot || ui.syncing || ui.nativeSync?.running || ui.runningChallenge
      || ui.collectingAttunementLoot || ui.collectingTaming || ui.collectingAutomation || ui.nativeCollectionPending || ui.recoveringActionView);
  }

  function quickSkillProgress(runtime, skill, target) {
    const user = runtime?.state.user, xp = user?.skills?.[skill.id]?.exp;
    if (skill.id === '15' || !Number.isFinite(xp) || xp < 0) return null;
    try {
      const level = runtime.skillLevel?.(xp);
      const start = runtime.skillLevelXp?.(level), end = runtime.skillLevelXp?.(level + 1);
      if (!Number.isSafeInteger(level) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || xp < start || xp >= end) return null;
      const earned = xp - start, needed = end - start, remaining = end - xp;
      let rate = null;
      const metadata = runtime.actionCatalog?.[target?.actionId];
      if (metadata && target.skillId === skill.id) {
        try {
          const estimate = runtime.skillEstimates?.(user, runtime.skillCatalog[skill.id], metadata)?.exp;
          if (Number.isFinite(estimate) && estimate > 0) rate = estimate;
        } catch {}
      }
      return { level, earned, needed, remaining, percent: earned / needed * 100, rate, seconds: rate ? remaining / rate * 3600 : null };
    } catch { return null; }
  }

  function quickAssertOwner(owner, runtime) {
    if (!owner || quickOwner(quickRuntime()) !== owner || quickOwner(runtime) !== owner) throw new Error('Character changed. No further action was requested.');
  }

  function quickOpenPage(skillId) {
    if (quickBusy()) return;
    const skill = quickSkills().find(skill => skill.id === skillId);
    if (!skill?.button) return;
    quickClose();
    leaveStats();
    // Use the native target, including its action and combat/equipment routing.
    skill.button.click();
  }

  async function quickResume(skillId, { edit = false, loot = false } = {}) {
    if (quickBusy() || (loot && !automationEnabled())) return;
    const runtime = quickObserve(), ui = AppState.ui.quickSkills, owner = ui.owner;
    const target = loot ? quickRunningTarget(runtime) : ui.data?.last[skillId];
    if (!target || !owner || target.skillId === '15') return;
    if (edit && !target.finite) return;
    if (!loot && quickSameAction(runtime.state.user.action, target) && !edit) return;
    ui.busy = true;
    const request = { cancelled: false, attempted: false };
    ui.request = request;
    ui.message = loot ? 'Collecting and continuing…' : edit ? 'Checking amount…' : `Preparing ${target.name}…`;
    if (loot) AppState.ui.collectingLoot = true;
    syncQuickSkills();
    let attempted = false, started = false, collected = false, detailsKnown = false, rewards = [], error = '', syncError = '';
    try {
      await withPage(`/skill/${target.skillId}/action/${target.actionId}`, 'skill-page', async (doc, frameWindow) => {
        if (request.cancelled) return;
        const native = await quickNativeReady(doc, frameWindow, target);
        if (request.cancelled) return;
        quickAssertOwner(owner, native.runtime);
        const same = quickSameAction(native.runtime.state.user.action, target);
        if (loot && !same) throw new Error('The current action changed before collection. Open Quick Loot again.');
        if (same && !loot && !edit) { ui.message = `${target.name} is already Current.`; return; }
        const preference = ui.data.amounts[quickActionKey(target)];
        let amount = loot && target.finite ? quickRemainingAmount(native.runtime, target) : preference?.amount;
        let choice = null;
        if (target.finite) {
          const limit = native.limit();
          if (edit || (!loot && !preference?.reuse) || !quickAmount(amount) || amount > limit) {
            choice = await quickPromptAmount(target, preference, limit, { edit, shortage: quickAmount(amount) && amount > limit, quantityInfo: native.quantityInfo });
            if (!choice) { ui.message = ''; return; }
            quickAssertOwner(owner, native.runtime);
            amount = choice.amount;
            if (choice.save) {
              ui.data.amounts[quickActionKey(target)] = { amount, reuse: choice.reuse };
              quickPersist(owner, ui.data);
            }
            if (edit) { ui.message = `Amount saved for ${target.name}.`; return; }
          }
        }
        if (edit) return;
        // A prompt can remain open while materials change. Reopen, never clamp.
        while (target.finite && amount > native.limit()) {
          choice = await quickPromptAmount(target, ui.data.amounts[quickActionKey(target)], native.limit(), { shortage: true, quantityInfo: native.quantityInfo });
          if (!choice) { ui.message = ''; return; }
          quickAssertOwner(owner, native.runtime);
          amount = choice.amount;
          if (choice.save) {
            ui.data.amounts[quickActionKey(target)] = { amount, reuse: choice.reuse };
            quickPersist(owner, ui.data);
          }
        }
        quickAssertOwner(owner, native.runtime);
        const observation = quickObserveRequests(native.runtime, target, () => quickAssertOwner(owner, native.runtime));
        const receipt = observeCollectionRewards(frameWindow, ['stopAction']);
        const hadAction = !!native.runtime.state.user.action;
        try {
          if (loot) {
            const stop = native.stopButton();
            if (!stop || stop.disabled) throw new Error('The current action cannot be collected here.');
            attempted = true;
            request.attempted = true;
            stop.click();
            await quickWaitUntil(() => receipt.confirmed() && !native.runtime.state.user.action, observation, 10000);
          }
          let control = await native.startControl(amount);
          if (request.cancelled) return;
          while (target.finite && amount > native.limit()) {
            choice = await quickPromptAmount(target, ui.data.amounts[quickActionKey(target)], native.limit(), { shortage: true, quantityInfo: native.quantityInfo });
            if (!choice) { ui.message = ''; return; }
            quickAssertOwner(owner, native.runtime);
            amount = choice.amount;
            if (choice.save) {
              ui.data.amounts[quickActionKey(target)] = { amount, reuse: choice.reuse };
              quickPersist(owner, ui.data);
            }
            control = await native.startControl(amount);
            if (request.cancelled) return;
          }
          quickAssertOwner(owner, native.runtime);
          if (!control || control.disabled) throw new Error('This action is unavailable. Open its native page to check the requirements.');
          attempted = true;
          request.attempted = true;
          control.click();
          await quickWaitUntil(() => observation.started() && quickSameAction(native.runtime.state.user.action, target), observation, 12000);
          quickAssertOwner(owner, native.runtime);
          started = true;
          await wait(100);
          if (quickOwner(quickRuntime()) === owner) {
            ui.data.last[target.skillId] = target;
            quickPersist(owner, ui.data);
          }
        } finally {
          collected = receipt.confirmed();
          detailsKnown = receipt.detailsKnown();
          rewards = receipt.rewards();
          if (started && hadAction && !collected) error = 'Action started; collection could not be confirmed.';
          receipt.restore();
          observation.restore();
        }
      });
    } catch (failure) { if (!request.cancelled) error = failure.message; }
    finally {
      if (attempted && quickOwner(quickRuntime()) === owner) {
        try {
          await synchronizeNativeGame({ quickAction: true });
          try { await refreshStatusActionSource(); }
          catch (failure) { syncError = `Live action view refresh failed: ${failure.message}`; }
        }
        catch (failure) { syncError = `Game synchronization failed: ${failure.message}`; }
      }
      ui.busy = false;
      ui.request = null;
      if (loot) AppState.ui.collectingLoot = false;
      ui.prompt?.resolve(null);
      ui.prompt = null;
      if (started) quickClose();
      if (attempted || error) {
        ui.message = error;
        showActionToast({ title: started ? loot ? 'Loot collected — action continued' : `Started ${target.name}` : collected ? 'Loot collected — action did not start' : 'Action not confirmed',
          summary: quickSkills(runtime).find(skill => skill.id === target.skillId)?.name || target.skillId,
          kind: error || syncError || !started ? 'warning' : 'success',
          metrics: rewards.map(reward => ({ label: reward.name, image: reward.image, icon: reward.icon, value: formatNumber(reward.amount) })),
          detail: [error, collected && !detailsKnown ? 'Collection confirmed. Reward details unavailable.' : collected && !rewards.length ? 'Collection confirmed. No rewards.' : ''].filter(Boolean).join(' '), warning: syncError });
      }
      AppState.ui.lastSignature = '';
      syncQuickSkills();
      render();
    }
  }
