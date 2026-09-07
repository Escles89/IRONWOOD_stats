  async function refreshChallengesSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (AppState.ui.runningChallenge) return;
    if (!force && !needsLookup('challenges')) return;
    if (AppState.ui.refreshingChallenges) return;
    AppState.ui.refreshingChallenges = true;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        await waitForChallengeValue(() => collectChallenges(doc), 'Challenge counts did not finish loading');
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingChallenges = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  function readChallenges(doc) {
    const root = doc.querySelector('challenges-page');
    const rows = [...(root?.querySelectorAll('.card .row') || [])];
    const row = (name) => rows.find((item) => clean(item.querySelector(':scope > .name')?.textContent) === name);
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      return match ? { current: parseCompact(match[1]), max: parseCompact(match[2]) } : { current: null, max: null };
    };
    const scrolls = pair(row('Challenge Scroll')?.querySelector('.amount')?.textContent);
    const autoCompletes = pair(row('Auto Challenge Completes')?.querySelector('.amount')?.textContent);
    const dailyScrolls = pair(row('Daily Scroll Limit')?.querySelector('.amount')?.textContent);
    if (![scrolls.current, scrolls.max, autoCompletes.current, autoCompletes.max, dailyScrolls.current, dailyScrolls.max].every(Number.isFinite)) return false;
    const selectedRegion = clean(root?.querySelector('.categories button:disabled .name')?.textContent);
    const selectedChallenge = clean(root?.querySelector('.group .card button.row-active .name')?.textContent);
    const data = {
      schema: 4,
      scrollsAvailable: scrolls.current,
      scrollsRequired: scrolls.max,
      autoCompletesUsed: autoCompletes.current,
      autoCompletesLimit: autoCompletes.max,
      autoCompletesRemaining: Number.isFinite(autoCompletes.current) && Number.isFinite(autoCompletes.max)
        ? Math.max(0, autoCompletes.max - autoCompletes.current) : 0,
      dailyScrollsUsed: dailyScrolls.current,
      dailyScrollsLimit: dailyScrolls.max,
      selectedRegion,
      selectedChallenge,
      expiresAt: Math.min(nextDailyReset(), Date.now() + 300000)
    };
    return data;
  }

  function collectChallenges(doc) {
    const data = readChallenges(doc);
    if (!data) return false;
    setCache('challenges', { ...getCache().challenges, ...data, checkedAt: Date.now() });
    setCachedInventoryQuantity('challenge-scroll.png', data.scrollsAvailable, 'Challenge Scroll', '/assets/items/challenge-scroll.png');
    return data;
  }

  async function waitForChallengeValue(read, message, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = read();
      if (value) return value;
      await wait(100);
    }
    throw new Error(message);
  }

  async function automateChallenge() {
    if (!automationEnabled()) return;
    if (AppState.ui.runningChallenge) return;
    AppState.ui.runningChallenge = true;
    AppState.ui.automationTask = 'challenges';
    AppState.ui.lastSignature = '';
    render();
    const preferences = getChallengePrefs();
    let result = '';
    let successful = false;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        // Re-query the root: Angular can replace it between challenge phases.
        const buttons = (selector = 'button') => [...(doc.querySelector('challenges-page')?.querySelectorAll(selector) || [])];
        const button = (pattern, includeDisabled = false) => buttons()
          .find(item => pattern.test(clean(item.textContent)) && (includeDisabled || !item.disabled));
        await waitForChallengeValue(() => collectChallenges(doc), 'Challenge counts did not finish loading');
        const regionButton = await waitForChallengeValue(() => buttons('.categories button')
          .find(item => clean(item.textContent) === preferences.region), `Could not find ${preferences.region} challenges`);
        if (!regionButton.disabled) regionButton.click();
        await waitForChallengeValue(() => buttons('.categories button:disabled')
          .some(item => clean(item.textContent) === preferences.region), `Could not select ${preferences.region} challenges`);
        let state = await waitForChallengeValue(() => {
          const snapshot = readChallenges(doc);
          return snapshot && snapshot.selectedRegion === preferences.region && button(/^Start$/i, true) && snapshot;
        }, 'Selected challenge did not finish loading');
        collectChallenges(doc);
        if (!(state.scrollsRequired > 0) || state.scrollsAvailable < state.scrollsRequired) throw new Error('No Challenge Scrolls available');
        if (!(state.autoCompletesRemaining > 0)) throw new Error('No Auto Challenge Completes remaining');
        const runLimit = Math.min(Math.floor(state.scrollsAvailable / state.scrollsRequired), state.autoCompletesRemaining);
        let completed = 0;

        while (completed < runLimit) {
          const startingScrolls = state.scrollsAvailable;
          const startingAutoUsed = state.autoCompletesUsed;
          const required = state.scrollsRequired;
          const start = await waitForChallengeValue(() => button(/^Start$/i), `Challenge Start is unavailable after ${completed} completed`);
          start.click();
          const autoComplete = await waitForChallengeValue(() => button(/^Auto.*Complete/i),
            `Auto Complete did not become available after ${completed} completed`);
          autoComplete.click();
          const skillButton = await waitForChallengeValue(() => buttons()
            .find(item => clean(item.textContent) === preferences.skill), `Could not select ${preferences.skill} after ${completed} completed`);
          if (!skillButton.disabled) skillButton.click();
          const claimButton = await waitForChallengeValue(() => button(/^Claim(?: Reward)?$/i),
            `Reward claim did not become available after ${completed} completed`);
          claimButton.click();

          state = await waitForChallengeValue(() => {
            const snapshot = readChallenges(doc);
            return snapshot && button(/^Start$/i, true)
              && !button(/^Claim(?: Reward)?$/i, true)
              && snapshot.scrollsAvailable <= startingScrolls - required
              && snapshot.autoCompletesUsed > startingAutoUsed && snapshot;
          }, `Reward claim was not confirmed after ${completed} completed`);
          collectChallenges(doc);
          completed++;
        }
        result = `Completed ${completed} · ${preferences.region} · ${preferences.skill}`;
        successful = true;
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge automation failed', error);
      result = error.message;
    } finally {
      AppState.ui.runningChallenge = false;
      AppState.ui.automationTask = '';
      const cached = getCache().challenges || {};
      setCache('challenges', { ...cached, lastRun: { result, successful, finishedAt: Date.now() } });
      AppState.ui.lastSignature = '';
      render();
    }
  }
