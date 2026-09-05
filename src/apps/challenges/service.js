  async function refreshChallengesSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (getCache().challenges?.scrollsAvailable === 0) return;
    if (!force && !isStale('challenges')) return;
    if (AppState.ui.refreshingChallenges) return;
    AppState.ui.refreshingChallenges = true;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        const started = Date.now();
        let scrollRow = null;
        while (Date.now() - started < 6000) {
          scrollRow = [...doc.querySelectorAll('challenges-page .row')]
            .find((item) => clean(item.querySelector(':scope > .name')?.textContent) === 'Challenge Scroll');
          if (scrollRow && /\//.test(clean(scrollRow.querySelector('.amount')?.textContent))) break;
          await wait(100);
        }
        if (scrollRow) collectChallenges(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingChallenges = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  function collectChallenges(doc) {
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
    const selectedRegion = clean(root?.querySelector('.categories button:disabled .name')?.textContent);
    const selectedChallenge = clean(root?.querySelector('.group .card button.row-active .name')?.textContent);
    const data = {
      schema: 3,
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
      expiresAt: nextDailyReset()
    };
    setCache('challenges', data);
    return data;
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
        const root = doc.querySelector('challenges-page');
        const button = (pattern) => [...root.querySelectorAll('button')]
          .find((item) => pattern.test(clean(item.textContent)) && !item.disabled);
        const regionButton = [...root.querySelectorAll('.categories button')]
          .find((item) => clean(item.textContent) === preferences.region);
        regionButton?.click();
        const regionStarted = Date.now();
        while (Date.now() - regionStarted < 3000 && ![...root.querySelectorAll('.categories button:disabled')]
          .some((item) => clean(item.textContent) === preferences.region)) await wait(100);

        let state = collectChallenges(doc);
        if (!(state.scrollsAvailable > 0)) throw new Error('No Challenge Scrolls available');
        if (!(state.autoCompletesRemaining > 0)) throw new Error('No Auto Challenge Completes remaining');
        const runLimit = Math.min(state.scrollsAvailable, state.autoCompletesRemaining);
        let completed = 0;

        while (completed < runLimit) {
          const startingScrolls = state.scrollsAvailable;
          const startingAutoUsed = state.autoCompletesUsed;
          const start = button(/^Start$/i);
          if (!start) throw new Error(`Challenge Start is unavailable after ${completed} completed`);
          start.click();

          const autoStarted = Date.now();
          let autoComplete = null;
          while (Date.now() - autoStarted < 6000 && !autoComplete) {
            autoComplete = button(/Auto.*Complete/i);
            if (!autoComplete) await wait(100);
          }
          if (!autoComplete) throw new Error(`Auto Complete did not become available after ${completed} completed`);
          autoComplete.click();

          const rewardStarted = Date.now();
          let claimButton = null;
          while (Date.now() - rewardStarted < 6000 && !claimButton) {
            const skillButton = [...root.querySelectorAll('button')]
              .find((item) => clean(item.textContent) === preferences.skill && !item.disabled);
            skillButton?.click();
            claimButton = button(/^Claim(?: Reward)?$/i);
            if (!claimButton) await wait(100);
          }
          if (!claimButton) throw new Error(`Could not select ${preferences.skill} after ${completed} completed`);
          claimButton.click();

          const claimStarted = Date.now();
          do { await wait(150); state = collectChallenges(doc); }
          while (Date.now() - claimStarted < 8000 &&
            state.scrollsAvailable >= startingScrolls && state.autoCompletesUsed <= startingAutoUsed);
          if (state.scrollsAvailable >= startingScrolls) throw new Error(`Reward claim was not confirmed after ${completed} completed`);
          completed++;
          await wait(150);
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
