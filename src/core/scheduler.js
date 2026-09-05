  const SyncCoordinator = {
    async refresh(key, { force = false, load } = {}) {
      if (!cacheLookupsEnabled() || (!force && CacheStore.isFresh(key))) return CacheStore.get(key);
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
      // Resolve the signed-in character and guild participation first so the
      // visible Status row does not wait behind every other stale cache.
      if ((force || isStale('guildEvent')) && !playerName()) {
        await withPage('/profile', 'profile-page profile-card-component .column > .name', (doc) => collectPlayerName(doc));
      }
      if (force || isStale('guildEvent')) await withPage('/guild', 'guild-page', async (doc) => {
        const menuStarted = Date.now();
        let button = null;
        while (Date.now() - menuStarted < 8000 && !button) {
          button = [...doc.querySelectorAll('guild-page button')].find((el) => clean(el.textContent).startsWith('Events'));
          if (!button) await wait(200);
        }
        button?.click();
        const eventStarted = Date.now();
        const expectedName = playerName();
        while (Date.now() - eventStarted < 8000) {
          const participants = [...doc.querySelectorAll('guild-page .card')]
            .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Participants');
          const playerRendered = [...(participants?.querySelectorAll('button.row, .row') || [])]
            .some((row) => clean(row.querySelector(':scope > .name')?.textContent) === expectedName);
          if (participants && (!expectedName || playerRendered)) break;
          await wait(200);
        }
        collectGuildEvent(doc);
      });
      if (force || isStale('quests')) {
        if (automationEnabled()) { AppState.ui.automationTask = 'quests'; AppState.ui.lastSignature = ''; render(); }
        try { await withPage('/quests', 'quests-page', automationEnabled() ? completeSelectedQuests : collectQuests); }
        finally { AppState.ui.automationTask = ''; AppState.ui.lastSignature = ''; render(); }
      }
      await SyncCoordinator.refresh('inventory', { force, load: () => withPage('/inventory', 'inventory-page', async (doc) => collectInventory(doc)) });
      if (force || isStale('equipped')) await withPage('/equipment', 'equipment-page', async (doc) =>
        storeEquippedDivine(divineConsumables(doc), true)
      );
      if (force || isStale('adventure')) {
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
        }); } finally { AppState.ui.automationTask = ''; AppState.ui.lastSignature = ''; render(); }
      }
      if ((force || isStale('challenges')) && getCache().challenges?.scrollsAvailable !== 0) await withPage('/challenges', 'challenges-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('challenges-page .row .name')]
          .some((element) => clean(element.textContent) === 'Challenge Scroll')) await wait(100);
        collectChallenges(doc);
      });
      await SyncCoordinator.refresh('taming', { force, load: () => withPage('/skill/15', 'taming-page', collectTaming) });
      if (force || isStale('automations')) await refreshAutomationsSnapshot(force);
      await SyncCoordinator.refresh('attunement', { force, load: () => withPage('/attunement', 'attunement-page', collectAttunement) });
      await SyncCoordinator.refresh('mastery', { force, load: () => withPage('/mastery', 'mastery-page', collectMastery) });
      if (force || isStale('guildTrial')) await withPage('/guild', 'guild-page', async (doc) => {
        const button = [...doc.querySelectorAll('guild-page button')].find((el) => clean(el.textContent).startsWith('Trials'));
        button?.click();
        const started = Date.now();
        while (Date.now() - started < 8000 && ![...doc.querySelectorAll('guild-page .card > .header > .name')].some((el) => /^(Incomplete|Complete) Trials$/.test(clean(el.textContent)))) await wait(200);
        collectGuildTrial(doc);
      });
    } catch (error) { setCache('syncError', { message: error.message }); }
    finally { AppState.ui.syncing = false; AppState.ui.lastSignature = ''; render(); }
  }
