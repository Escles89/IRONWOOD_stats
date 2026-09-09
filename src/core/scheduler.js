  const SyncCoordinator = {
    async refresh(key, { force = false, load } = {}) {
      if (!cacheLookupsEnabled() || (!force && CacheStore.isUsable(key))) return CacheStore.get(key);
      if (AppState.ui.pendingActions.has(key)) return AppState.ui.pendingActions.get(key);
      if (typeof load !== 'function') throw new Error(`No source loader for ${key}`);
      const pending = Promise.resolve().then(load);
      AppState.ui.pendingActions.set(key, pending);
      try { await pending; return CacheStore.get(key); }
      finally { AppState.ui.pendingActions.delete(key); }
    }
  };
  function dailyAutomationStatus(key, now = Date.now()) {
    if (!automationEnabled() || !cacheLookupsEnabled()) return { due: false, reason: 'Automation and background lookups must both be enabled' };
    const entry = getCache()[key];
    if (key === 'quests') {
      if (getPrefs().length !== 5) return { due: false, reason: 'Select exactly five quest skills' };
      if (entry?.day === dayKey(now) && entry.dailyComplete) return { due: false, reason: 'Complete; next daily reset', nextAt: nextDailyReset(now) };
    } else if (key === 'adventure') {
      const currentDay = Number.isFinite(entry?.checkedAt) && dayKey(entry.checkedAt) === dayKey(now);
      if (currentDay && entry.dailyMapsLimit > 0 && entry.dailyMapsCreated >= entry.dailyMapsLimit) return { due: false, reason: 'Complete; next daily reset', nextAt: nextDailyReset(now) };
      if (currentDay && ((entry.mapStorageLimit > 0 && Number.isFinite(entry.mapsStored) && entry.mapsStored >= entry.mapStorageLimit) || (entry.mapCost > 0 && Number.isFinite(entry.researchPoints) && entry.researchPoints < entry.mapCost))) return { due: false, reason: 'Waiting for storage or RP to change on a native page, or the next daily reset', nextAt: nextDailyReset(now) };
    } else return { due: false, reason: 'No daily automation' };
    const attempt = getCache().dailyAutomation?.[key];
    if (attempt?.day === dayKey(now) && attempt.retryAt > now) return { due: false, reason: 'Retry after an incomplete attempt', nextAt: attempt.retryAt };
    return { due: true, reason: 'Daily work pending; next visible-page check (at most one minute)' };
  }

  function checkDailyAutomations() {
    if (document.hidden || AppState.ui.syncing) return;
    if (['quests', 'adventure'].some(key => dailyAutomationStatus(key).due)) return syncStale(false);
  }

  async function syncDailyTask(key, force, load) {
    if (!cacheLookupsEnabled()) return;
    const automate = automationEnabled() && (force || dailyAutomationStatus(key).due);
    if (!force && !needsLookup(key) && !automate) return;
    if (automate) {
      setCache('dailyAutomation', { ...getCache().dailyAutomation,
        [key]: { day: dayKey(), retryAt: Date.now() + 15 * 60000 } });
      AppState.ui.automationTask = key === 'quests' ? 'quests' : 'maps';
      AppState.ui.lastSignature = '';
      render();
    }
    try { await load(automate); }
    catch (error) { setCache('syncError', { message: `${key}: ${error.message}` }); }
    finally { AppState.ui.automationTask = ''; AppState.ui.lastSignature = ''; render(); }
  }

  async function refreshAllCachedData() {
    if (AppState.ui.syncing) return;
    AppState.ui.syncing = true;
    AppState.ui.manualCacheRefresh = true;
    syncCacheRefreshButton();
    const failures = [];
    const sources = [
      ['Quests', () => withPage('/quests', 'quests-page', doc => waitForQuestRows(doc))],
      ['Adventure', () => withPage('/adventure', 'adventure-page', async doc => {
        await waitFor(doc, 'adventure-page .row .name');
        collectAdventure(doc);
        await captureAdventureMapDetails(doc);
      })],
      ['Guild event', () => refreshGuildEventSnapshot(true)],
      ['Inventory', () => refreshInventorySnapshot(true)],
      ['Equipment', () => withPage('/equipment', 'equipment-page', doc => storeEquippedDivine(divineConsumables(doc), true))],
      ['Challenges', () => refreshChallengesSnapshot(true)],
      ['Taming', () => withPage('/skill/15', 'taming-page', collectTaming)],
      ['House', () => refreshAutomationsSnapshot(true)],
      ['Attunement', () => withPage('/attunement', 'attunement-page', collectAttunement)],
      ['Mastery', () => withPage('/mastery', 'mastery-page', collectMastery)],
      ['Guild trials', () => refreshGuildTrialSnapshot(true)]
    ];
    try {
      captureVisibleCaches();
      for (const [name, load] of sources) {
        try { await load(); }
        catch (error) { failures.push(name); setCache('syncError', { message: `${name}: ${error.message}` }); }
      }
    } finally {
      AppState.ui.manualCacheRefresh = false;
      AppState.ui.syncing = false;
      AppState.ui.lastSignature = '';
      syncCacheRefreshButton();
      render();
    }
    showActionToast({ kind: failures.length ? 'warning' : 'success',
      title: failures.length ? 'Cache refresh incomplete' : 'Cached data refreshed',
      detail: failures.length ? `Could not refresh: ${failures.join(', ')}.` : 'All data sources refreshed.' });
  }

  async function syncStale(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (AppState.ui.syncing) return;
    AppState.ui.syncing = true;
    try {
      await syncDailyTask('quests', force, automate =>
        withPage('/quests', 'quests-page', automate ? completeSelectedQuests : collectQuests));
      await syncDailyTask('adventure', force, automate =>
        withPage('/adventure', 'adventure-page', async (doc) => {
          const started = Date.now();
          while (Date.now() - started < 8000) {
            const names = [...doc.querySelectorAll('adventure-page .row .name')].map((element) => clean(element.textContent));
            if (names.includes('Research Points') && names.includes('Daily Map Limit') && names.includes('Storage')) break;
            await wait(200);
          }
          if (automate) await automateMaps(doc);
          else collectAdventure(doc);
          await captureAdventureMapDetails(doc);
        }));
      await refreshGuildEventSnapshot(force);
      await refreshInventorySnapshot(force);
      if (force || needsLookup('equipped')) await withPage('/equipment', 'equipment-page', async (doc) =>
        storeEquippedDivine(divineConsumables(doc), true)
      );
      await refreshChallengesSnapshot(force);
      await SyncCoordinator.refresh('taming', { force, load: () => withPage('/skill/15', 'taming-page', collectTaming) });
      if (force || needsLookup('automations')) await refreshAutomationsSnapshot(force);
      await SyncCoordinator.refresh('attunement', { force, load: () => withPage('/attunement', 'attunement-page', collectAttunement) });
      await SyncCoordinator.refresh('mastery', { force, load: () => withPage('/mastery', 'mastery-page', collectMastery) });
      await refreshGuildTrialSnapshot(force);
    } catch (error) { setCache('syncError', { message: error.message }); }
    finally { AppState.ui.syncing = false; AppState.ui.lastSignature = ''; render(); }
  }

  function scheduleStatusRender() {
    if (!document.hidden && AppState.ui.page?.hidden) syncHeaderActionBadges();
    if (document.hidden || !AppState.ui.page || AppState.ui.page.hidden || AppState.ui.renderFrame !== null) return;
    AppState.ui.renderFrame = window.requestAnimationFrame(() => {
      AppState.ui.renderFrame = null;
      if (!document.hidden && !AppState.ui.page?.hidden) StatusRenderer.render(AppState);
    });
  }
  function handleStatusVisibility() {
    if (document.hidden) {
      if (AppState.ui.renderFrame !== null) window.cancelAnimationFrame(AppState.ui.renderFrame);
      AppState.ui.renderFrame = null;
    } else { scheduleStatusRender(); checkDailyAutomations(); }
  }
