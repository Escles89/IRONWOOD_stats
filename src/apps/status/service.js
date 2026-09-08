  function pageSummary(doc, selector, key) {
    const root = doc.querySelector(selector);
    const text = clean(root?.textContent).slice(0, 600);
    setCache(key, { summary: text || 'No active information found' });
  }
  function render() {
    renderGlobalDialog();
    if (document.hidden || !AppState.ui.page || AppState.ui.page.hidden) return;
    try {
    const { action, loot, consumables, materials, masteryProgress, finiteQueue } = SourceAdapter.capture(document);
    const combatDeath = Boolean(action?.isCombat && action.combatants?.some((fighter) => fighter.side === 'monster' && fighter.hpPercent === 0));
    const lootDeltas = loot.map((item) => { const key = item.image || item.name; const old = AppState.live.previousLootValues.get(key); return quantityIsApproximate(item) || old === undefined || old === item.amount ? 0 : item.amount - old; });
    const consumableDeltas = consumables.map((item) => { const key = item.image || item.name; const old = AppState.live.previousConsumableValues.get(key); return old === undefined || old === parseCompact(item.amount) ? 0 : parseCompact(item.amount) - old; });
    const noticeNow = Date.now();
    recordMaterialChanges(materials, noticeNow);
    if (!action?.isCombat) AppState.ui.eliteCombatDetected = false;
    if (action?.isCombat && consumables.some((item, index) => /elite\s+key/i.test(item.name) && consumableDeltas[index] < 0)) AppState.ui.eliteCombatDetected = true;
    const eliteKeyEquipped = consumables.some((item) => /elite\s+key/i.test(item.name));
    const eliteCombat = Boolean(action?.isCombat && (action.isElite || AppState.ui.eliteCombatDetected || eliteKeyEquipped));
      AppState.ui.lootDeltaNotices.forEach((notice, key) => { if (notice.until <= noticeNow) AppState.ui.lootDeltaNotices.delete(key); });
      AppState.ui.consumableDeltaNotices.forEach((notice, key) => { if (notice.until <= noticeNow) AppState.ui.consumableDeltaNotices.delete(key); });
      loot.forEach((item, index) => {
        const delta = lootDeltas[index];
        const key = item.image || item.name;
        const existing = AppState.ui.lootDeltaNotices.get(key);
        if (delta && (!existing || existing.delta !== delta || existing.until <= noticeNow) && EventLedger.record(`loot:${key}:${noticeNow}`, { delta }, 4000)) AppState.ui.lootDeltaNotices.set(key, { delta, started: noticeNow, until: noticeNow + 4000 });
      });
      consumables.forEach((item, index) => {
        const delta = consumableDeltas[index];
        const key = item.image || item.name;
        const existing = AppState.ui.consumableDeltaNotices.get(key);
        if (delta && (!existing || existing.delta !== delta || existing.until <= noticeNow) && EventLedger.record(`consumable:${key}:${noticeNow}`, { delta }, 4000)) AppState.ui.consumableDeltaNotices.set(key, { delta, started: noticeNow, until: noticeNow + 4000 });
      });
    AppState.live.previousLootValues = new Map(loot.filter(item => !quantityIsApproximate(item)).map((item) => [item.image || item.name, item.amount]));
    AppState.live.previousConsumableValues = new Map(consumables.map((item) => [item.image || item.name, parseCompact(item.amount)]));
    const isHealingConsumable = (item) => /pie|potion|elixir|food/i.test(item?.name || '');
    const dropCandidate = action?.isCombat ? loot.find((item, index) => lootDeltas[index] > 0 && item.image) : null;
    const useCandidate = action?.isCombat && !action.combatants?.some((fighter) => fighter.healAmount > 0)
      ? consumables.find((item, index) => consumableDeltas[index] < 0 && item.image && !isHealingConsumable(item)) : null;
    if (!action?.isCombat) { AppState.ui.combatUseNotice = null; AppState.ui.combatDropNotice = null; }
    if (dropCandidate) {
      const key = dropCandidate.image || dropCandidate.name;
      if (!AppState.ui.combatDropNotice || AppState.ui.combatDropNotice.key !== key || AppState.ui.combatDropNotice.until <= noticeNow) AppState.ui.combatDropNotice = { key, item: dropCandidate, started: noticeNow, until: noticeNow + 4000 };
    }
    if (useCandidate) {
      const key = useCandidate.image || useCandidate.name;
      if (!AppState.ui.combatUseNotice || AppState.ui.combatUseNotice.key !== key || AppState.ui.combatUseNotice.until <= noticeNow) AppState.ui.combatUseNotice = { key, item: useCandidate, started: noticeNow, until: noticeNow + 4000 };
    }
    if (AppState.ui.combatDropNotice?.until <= noticeNow) AppState.ui.combatDropNotice = null;
    if (AppState.ui.combatUseNotice?.until <= noticeNow) AppState.ui.combatUseNotice = null;
    const combatDrop = AppState.ui.combatDropNotice?.item || null;
    const combatUse = AppState.ui.combatUseNotice?.item || null;
    const pieHealing = Boolean(action?.isCombat && consumables.some(isHealingConsumable));
    const consumedHealing = action?.isCombat
      ? consumables.find((item, index) => consumableDeltas[index] < 0 && item.image && isHealingConsumable(item)) : null;
    const recoveryIcon = consumedHealing?.image || consumables.find(isHealingConsumable)?.image || '';
    AppState.ui.page.style.setProperty('--iw-recovery-icon', recoveryIcon ? `url(${JSON.stringify(recoveryIcon)})` : 'none');
    AppState.ui.page.style.setProperty('--iw-drop-icon', combatDrop ? `url(${JSON.stringify(combatDrop.image)})` : 'none');
    AppState.ui.page.style.setProperty('--iw-use-icon', combatUse ? `url(${JSON.stringify(combatUse.image)})` : 'none');
    const queueRemainingMs = finiteQueue ? durationMs(finiteQueue.time) : 0;
    const warningPrefs = getWarningPrefs();
    const queueWarning = queueWarningState(queueRemainingMs, CRAFTING_SKILLS.has(action?.skillName), warningPrefs);
    const materialAlert = lowMaterialWarning(materials, warningPrefs);
    const materialWarning = materialAlert.state;
    const materialWarningText = materialAlert.text;
    const liveEquippedDivine = divineConsumables(document);
    let equippedDivine = [];
    try { equippedDivine = JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'); } catch { equippedDivine = []; }
    if (!Array.isArray(equippedDivine)) equippedDivine = [];
    equippedDivine = equippedDivine.filter((item) => item && typeof item.image === 'string' && item.image);
    if (liveEquippedDivine.length) {
      equippedDivine = storeEquippedDivine(liveEquippedDivine);
    }
    const cache = projectStatusCache(getCache());
    const resourceWarnings = statusResourceWarnings(cache, warningPrefs);
    const adventureActive = cache.adventure?.schema === 11 && cache.adventure.state === 'Active'
      && (!cache.adventure.stateEndsAt || cache.adventure.stateEndsAt > Date.now());
    const adventureActionActive = adventureBonusActive(cache.adventure, action?.skillName);
    const eventState = guildEventState(cache.guildEvent);
    const guildParticipationActive = eventState === 'Participating';
    const guildEventActionActive = guildParticipationActive
      && guildEventIncludesSkill(cache.guildEvent?.eventName, action?.skillName);
    const trialState = guildTrialState(cache.guildTrial);
    const guildTrialActionActive = guildTrialBonusActive(cache.guildTrial, action?.skillName);
    const prefs = getPrefs();
    const automationOn = automationEnabled();
    const cacheLookupsOn = cacheLookupsEnabled();
    const masteryAchieved = (cache.mastery?.completeSkills || []).includes(action?.skillName);
    const gatheringSkill = GATHERING_SKILLS.has(action?.skillName);
    const craftingSkill = CRAFTING_SKILLS.has(action?.skillName);
    const challengePrefs = getChallengePrefs();
    const headerIcons = headerIconsEnabled();
    const potionTypes = getPotionTypes();
    const tamingEggs = tamingEggReadiness(cache.taming);
    const adventureIdleAvailable = cache.adventure?.state === 'Idle' && Number(cache.adventure?.mapsStored) > 0;
    Object.assign(AppState.derived, { eliteCombat,
      countdowns: { revive: action?.reviveRemainingMs || 0, queue: queueRemainingMs },
      panels: { adventureActive, adventureActionActive, guildTrialActionActive, guildEventActionActive, masteryAchieved } });
    const signature = JSON.stringify({
      action: action && { name: action.name, level: action.level, image: action.image, actionId: action.actionId, location: action.location, skillName: action.skillName, skillLevel: action.skillLevel, isElite: eliteCombat, revive: Boolean(action.reviveRemainingMs), combatants: action.combatants?.map((fighter) => ({ side: fighter.side, name: fighter.name, image: fighter.image, healAmount: Boolean(fighter.healAmount), spawn: fighter.spawn, dead: fighter.dead })), pieHealing },
      loot: loot.map((item) => ({ name: item.name, image: item.image })),
      consumables: consumables.map((item) => ({ name: item.name, image: item.image, amount: item.amount })),
      materials: materials.map((item) => ({ name: item.name, image: item.image })),
      combatDropStarted: AppState.ui.combatDropNotice?.started, combatUseStarted: AppState.ui.combatUseNotice?.started,
      masteryAchieved,
      warningPrefs, resourceWarnings, tamingEggs, finiteQueue, trialState, eventState, day: dayKey(), materialWarning, materialWarningText, adventureActive, adventureActionActive, adventureIdleAvailable, guildEventActionActive, guildTrialActionActive, cacheRevision: AppState.ui.cacheRevision, prefs, challengePrefs, automationOn, cacheLookupsOn, potionTypes, headerIcons, questModalOpen: AppState.ui.questModalOpen, automationTask: AppState.ui.automationTask, tamingClaimNoticeUntil: AppState.ui.tamingClaimNoticeUntil
    });
    if (signature === AppState.ui.lastSignature) { StatusRenderer.updateLive(AppState); syncHeaderActionBadges(); updateDebugPanel(); return; }
    AppState.ui.lastSignature = signature;
    const automationRows = (cache.automations?.structures || [])
      .map((item) => projectedAutomation(item, cache.automations?.checkedAt));
    const questSkills = [...new Map((cache.quests?.quests || [])
      .filter((quest) => quest.skill)
      .map((quest) => [quest.skill, { name: quest.skill, image: skillIcon(quest.skill), done: quest.done }])).values()];
    const dailyQuestComplete = (cache.quests?.completed || 0) >= 5 || cache.quests?.dailyComplete === true;
    const adventureStatus = adventureActive ? 'Active' : cache.adventure?.mapsComplete ? 'Complete' : cache.adventure?.state || 'Unknown';
    const taskIndicator = (task, complete, fallback, fallbackClass = '') => AppState.ui.automationTask === task
      ? `<span class="iw-task-icon running" title="Automation running" aria-label="Automation running">${renderActionSpinner()}</span>`
      : complete
        ? '<span class="iw-task-icon done" title="Complete" aria-label="Complete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4 4L19 6.5"></path></svg></span>'
        : `<em class="${fallbackClass}">${escapeHtml(fallback)}</em>`;
    const adventureIndicator = adventureActive
      ? '<span class="iw-task-icon participating" title="Adventure in progress" aria-label="Adventure in progress"><svg class="iw-hourglass" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
      : adventureIdleAvailable
        ? '<span class="iw-task-icon adventure-idle" title="Adventure ready to start" aria-label="Adventure ready to start"><span class="iw-idle-glyph">z<sup>Z</sup></span></span>'
      : taskIndicator('maps', adventureStatus === 'Complete', adventureStatus);
    const guildTrialIndicator = guildTrialStatusIcon(cache.guildTrial);
    const guildEventIndicator = guildEventStatusIcon(cache.guildEvent);
    const mapRunDetail = cache.adventure?.mapAutomation?.stoppedReason && !cache.adventure?.mapsComplete
      ? cache.adventure.mapAutomation.stoppedReason : '';
    const attunementSkills = (cache.attunement?.selected || []).map((slot) => slot.skill).filter(Boolean);
    const attunementDetails = attunementSkills.join(' · ') || 'No skills selected';
    const challengeScrolls = cache.challenges?.scrollsAvailable;
    const challengeAutoRemaining = cache.challenges?.autoCompletesRemaining;
    const challengeError = challengeRunError(cache.challenges);
    const challengeIndicator = AppState.ui.automationTask === 'challenges'
      ? taskIndicator('challenges', false, '')
      : cache.challenges?.phase === 'blocked' && !challengePrefs.cancelBlocked
        ? challengeBlockedIndicator()
      : !['blocked', 'active', 'reward'].includes(cache.challenges?.phase) && ((challengeScrolls === 0 && !challengePrefs.buyScrolls) || challengeAutoRemaining === 0)
        ? taskIndicator('challenges', true, '')
        : `<button class="iw-small-button iw-claim-button" data-run-challenge ${automationOn && (['blocked', 'active', 'reward'].includes(cache.challenges?.phase) || !Number.isFinite(challengeScrolls) || ((challengeScrolls > 0 || challengePrefs.buyScrolls) && challengeAutoRemaining > 0)) ? '' : 'disabled'} title="${automationOn ? 'Run and claim challenges' : 'Automation is disabled'}">Claim</button>`;
    const tamingSnacks = cache.taming?.petSnacks;
    const tamingExpedition = cache.taming?.expeditionName;
    const tamingDetails = tamingExpedition || 'No expedition selected';
    const tamingLootIndicator = AppState.ui.collectingTaming
      ? `<span class="iw-task-icon running" title="Collecting Taming loot" aria-label="Collecting Taming loot">${renderActionSpinner()}</span>`
      : AppState.ui.tamingClaimNoticeUntil > Date.now()
        ? '<button class="iw-small-button iw-claim-button" data-claim-state="done" title="Taming loot claimed" disabled>Claimed</button>'
      : `<button class="iw-small-button iw-claim-button" data-collect-taming ${automationOn && (cache.taming?.lootAvailable || !Number.isFinite(tamingSnacks)) ? '' : 'disabled'} title="${automationOn ? 'Claim Taming loot' : 'Automation is disabled'}">Claim</button>`;
    const tamingIndicator = `<div class="iw-taming-actions">${renderTamingEggIndicator(tamingEggs)}${tamingLootIndicator}</div>`;
    const adventureSupplement = [
      mapRunDetail
    ].filter(Boolean).join(' · ');
    const cachedInventory = (Array.isArray(cache.inventory?.items) ? cache.inventory.items : [])
      .filter((item) => item && typeof item.image === 'string' && item.image);
    const cachedAllItems = Array.isArray(cache.inventory?.allItems) ? cache.inventory.allItems : [];
    const inventoryByKey = new Map(cachedAllItems.map((item) => [item.key, item]));
    let consumableRows = consumables.map((item, liveIndex) => {
      const key = item.image.split('/').pop()?.split('?')[0] || '';
      const storedItem = inventoryByKey.get(key);
      const storedOnly = /stardust|mastery contract/i.test(item.name);
      const masteryContract = /mastery contract/i.test(item.name);
      return {
        ...item,
        liveIndex: masteryContract ? null : liveIndex,
        storedOnly,
        masteryContract,
        equipped: storedOnly ? null : parseCompact(item.amount),
        equippedApproximate: quantityIsApproximate(item),
        storedApproximate: storedOnly && item.amount ? quantityIsApproximate(item) : quantityIsApproximate(storedItem),
        stored: storedOnly ? (item.amount ? parseCompact(item.amount) : (storedItem?.amount ?? 0)) : (storedItem?.amount ?? 0)
      };
    }).filter((item) => !(!craftingSkill && /stardust/i.test(item.name)));
    if (masteryAchieved) consumableRows = consumableRows.filter((item) => !item.masteryContract);
    [
      ['stardust.png', 'Stardust'],
      ['contract-mastery.png', 'Mastery Contract']
    ].forEach(([key, name]) => {
      const storedItem = inventoryByKey.get(key);
      if (!storedItem || (key === 'stardust.png' && !craftingSkill) || (key === 'contract-mastery.png' && masteryAchieved) || consumableRows.some((item) => item.image.split('/').pop()?.split('?')[0] === key)) return;
      consumableRows.push({
        name, image: storedItem.image || `/assets/items/${key}`, amount: storedItem.amountText,
        liveIndex: null, storedOnly: true, masteryContract: key === 'contract-mastery.png', equipped: null, stored: storedItem.amount, storedApproximate: quantityIsApproximate(storedItem)
      });
    });
    consumableRows.sort((a, b) => Number(a.storedOnly) - Number(b.storedOnly));
    const canonicalDivinePotions = [
      ['potion-divine-gather-yield.png', 'Divine Gather Yield Potion'],
      ['potion-divine-preservation.png', 'Divine Multi Craft Potion'],
      ['potion-divine-combat-loot.png', 'Divine Combat Loot Potion'],
      ['potion-divine-craft-efficiency.png', 'Divine Craft Efficiency Potion'],
      ['potion-divine-combat-efficiency.png', 'Divine Combat Efficiency Potion']
    ];
    const potionMap = new Map();
    if (potionTypes.includes('Divine')) canonicalDivinePotions.forEach(([key, name]) => potionMap.set(key, {
      key, name, image: `/assets/items/${key}`, equipped: null, stored: null, tier: 'Divine'
    }));
    for (const item of [...cachedInventory, ...cachedAllItems]) {
      const tier = potionType(item);
      if (!potionTypes.includes(tier)) continue;
      const key = item.key || item.image.split('/').pop()?.split('?')[0];
      const existing = potionMap.get(key);
      potionMap.set(key, { ...existing, key, tier,
        name: item.name || existing?.name || `${titleFromSlug(key.replace(/\.[^.]+$/, '').replace(/^potion-/, ''))} Potion`,
        image: item.image || `/assets/items/${key}`, equipped: null, stored: item.amount, storedApproximate: quantityIsApproximate(item) });
    }
    for (const item of [...equippedDivine, ...consumables]) {
      const tier = potionType(item);
      if (!potionTypes.includes(tier)) continue;
      const key = item.image.split('/').pop()?.split('?')[0];
      const existing = potionMap.get(key);
      potionMap.set(key, { ...existing, key, tier, name: item.name, image: item.image,
        equippedApproximate: quantityIsApproximate(item),
        equipped: typeof item.amount === 'number' ? item.amount : parseCompact(item.amount), stored: existing?.stored ?? null });
    }
    const canonicalPotionOrder = new Map(canonicalDivinePotions.map(([key], index) => [key, index]));
    const displayedPotions = [...potionMap.values()].filter(item => item.tier === 'Divine' || item.stored > 0 || item.equipped > 0).sort((a, b) => {
      const tierOrder = POTION_TYPES.indexOf(b.tier) - POTION_TYPES.indexOf(a.tier);
      if (tierOrder) return tierOrder;
      const equippedOrder = Number(Boolean(b.equipped)) - Number(Boolean(a.equipped));
      if (equippedOrder) return equippedOrder;
      const canonicalOrder = (canonicalPotionOrder.get(a.key) ?? 99) - (canonicalPotionOrder.get(b.key) ?? 99);
      if (canonicalOrder) return canonicalOrder;
      return a.name.localeCompare(b.name);
    });
    const inventoryCounts = new Map((Array.isArray(cache.inventory?.allItems) ? cache.inventory.allItems : [])
      .filter((item) => item?.key).map((item) => [item.key, item]));
    const totalItems = lootItemCount(loot);
    const compactCraftingLoot = Boolean(craftingSkill && finiteQueue);
    const craftedLoot = loot[0];
    const craftedInventory = craftedLoot
      ? inventoryCounts.get(craftedLoot.image.split('/').pop()?.split('?')[0]) : null;
    Object.assign(AppState.derived, { automationRows, displayedPotions, consumableRows, eliteCombat,
      countdowns: { revive: action?.reviveRemainingMs || 0, queue: queueRemainingMs },
      panels: { adventureActive, adventureActionActive, guildTrialActionActive, guildEventActionActive, masteryAchieved } });
    const { locationBadges, displayActionName } = selectLocationBadges(action, consumables, eliteCombat);

    const actionBadges = renderActionBadges({ action, masteryAchieved, adventureActionActive, guildEventActionActive, guildTrialActionActive, cache, locationBadges, materialWarning, materialWarningText, queueWarning, finiteQueue });
    AppState.ui.headerBadgeMarkup = actionBadges;
    updateStatusMarkup(renderStatusMarkup({ actionBadges, headerIcons, combatDeath, noticeNow, queueWarning, materialWarning, materialWarningText, cache, adventureActive, adventureActionActive, guildEventActionActive, guildTrialActionActive, prefs, automationOn, cacheLookupsOn, masteryAchieved, automationRows, questSkills, challengePrefs, dailyQuestComplete, taskIndicator, adventureIndicator, guildTrialIndicator, guildEventIndicator, attunementSkills, attunementDetails, challengeError, challengeIndicator, tamingDetails, tamingIndicator, resourceWarnings, adventureSupplement, potionTypes, consumableRows, displayedPotions, inventoryCounts, totalItems, compactCraftingLoot, craftedInventory, action, loot, consumables, materials, masteryProgress, finiteQueue, locationBadges, displayActionName }));
    syncHeaderActionBadges();
    StatusRenderer.updateLive(AppState);
    updateDebugPanel();
    } catch (error) {
      console.error('[Ironwood Status] Render failed', error);
      AppState.ui.lastSignature = '';
      AppState.ui.page.innerHTML = `<section class="iw-card iw-render-error"><strong>Status could not render</strong><span>${escapeHtml(error?.message || String(error))}</span><button class="iw-small-button" data-sync>Repair cached data</button></section>`;
    }
  }
