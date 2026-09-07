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
  async function syncStale(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (AppState.ui.syncing) return;
    AppState.ui.syncing = true;
    try {
      await refreshGuildEventSnapshot(force);
      if (force || needsLookup('quests')) {
        if (automationEnabled()) { AppState.ui.automationTask = 'quests'; AppState.ui.lastSignature = ''; render(); }
        try { await withPage('/quests', 'quests-page', automationEnabled() ? completeSelectedQuests : collectQuests); }
        finally { AppState.ui.automationTask = ''; AppState.ui.lastSignature = ''; render(); }
      }
      await refreshInventorySnapshot(force);
      if (force || needsLookup('equipped')) await withPage('/equipment', 'equipment-page', async (doc) =>
        storeEquippedDivine(divineConsumables(doc), true)
      );
      if (force || needsLookup('adventure')) {
        if (automationEnabled()) { AppState.ui.automationTask = 'maps'; AppState.ui.lastSignature = ''; render(); }
        try { await withPage('/adventure', 'adventure-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 8000) {
          const names = [...doc.querySelectorAll('adventure-page .row .name')].map((element) => clean(element.textContent));
          const researchRow = [...doc.querySelectorAll('adventure-page .row')]
            .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
          const researchText = clean(researchRow?.querySelector('.amount')?.textContent);
          const researchMatch = researchText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
          const loadedResearch = researchMatch && numberFrom(researchMatch[1]) > 0;
          if (loadedResearch && names.includes('Daily Map Limit') && names.includes('Storage')) break;
          await wait(200);
        }
          if (automationEnabled()) await automateMaps(doc);
          else collectAdventure(doc);
          await captureAdventureMapDetails(doc);
        }); } finally { AppState.ui.automationTask = ''; AppState.ui.lastSignature = ''; render(); }
      }
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
    } else scheduleStatusRender();
  }
