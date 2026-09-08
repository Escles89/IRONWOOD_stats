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

  function challengeStepsCard(root) {
    return [...(root?.querySelectorAll('.card') || [])]
      .find(card => clean(card.querySelector('.header .name')?.textContent) === 'Steps');
  }

  function readChallengePhase(doc) {
    const root = doc.querySelector('challenges-page');
    const buttons = [...(root?.querySelectorAll('button') || [])];
    const auto = buttons.find(button => /^(Cannot Auto|Auto(?: Complete| Limit))/i.test(clean(button.textContent)));
    if (auto) return auto.disabled || /^Cannot Auto/i.test(clean(auto.textContent)) ? 'blocked' : 'active';
    if (buttons.some(button => /^Claim(?: Reward)?$/i.test(clean(button.textContent)))) return 'reward';
    if (buttons.some(button => /^(Start|Daily Cap\b.*)$/i.test(clean(button.textContent)))) return 'ready';
    return false;
  }

  function challengeBuyModal(doc) {
    return [...(doc.querySelector('challenges-page')?.querySelectorAll('modal-component') || [])]
      .find(modal => clean(modal.querySelector('.header .name')?.textContent) === 'Challenge Entry');
  }

  function readChallengeBuyQuote(doc) {
    const modal = challengeBuyModal(doc);
    if (!modal) return false;
    const row = [...modal.querySelectorAll('.row')]
      .find(row => clean(row.querySelector(':scope > span')?.textContent) === 'Cost');
    const text = clean(row?.querySelector(':scope > div')?.textContent);
    if (!/^[\d,.]+\s*[KMB]?$/i.test(text)) return false;
    const price = parseCompact(text);
    const buy = [...modal.querySelectorAll('button')].find(button => clean(button.textContent) === 'Buy');
    return Number.isFinite(price) && price > 0 && buy ? { price, buy } : false;
  }

  function challengeRunError(entry) {
    if (entry?.phase === 'blocked' || entry?.lastRun?.successful !== false) return '';
    const result = entry.lastRun.result || '';
    const countsRecovered = /Challenge counts did not finish loading/.test(result)
      && Number.isFinite(entry.scrollsAvailable) && Number.isFinite(entry.autoCompletesRemaining)
      && entry.checkedAt > (entry.lastRun.finishedAt || 0);
    return countsRecovered ? '' : result;
  }

  function challengeBlockedIndicator() {
    const label = 'Challenge cannot auto-complete. Automatic cancellation is off.';
    return `<span class="iw-task-icon waiting" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L2 21h20L12 3Z"></path><path d="M12 9v5M12 18h.01"></path></svg></span>`;
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
    const phase = readChallengePhase(doc);
    const complete = [scrolls.current, scrolls.max, autoCompletes.current, autoCompletes.max].every(Number.isFinite);
    if (!complete && !['blocked', 'active', 'reward'].includes(phase)) return false;
    const selectedRegion = clean(root?.querySelector('.categories button:disabled .name')?.textContent);
    const selectedChallenge = clean(root?.querySelector('.group .card button.row-active .name')?.textContent);
    const data = {
      schema: 4,
      phase: phase || 'ready',
      scrollsAvailable: scrolls.current,
      scrollsRequired: scrolls.max,
      autoCompletesUsed: autoCompletes.current,
      autoCompletesLimit: autoCompletes.max,
      autoCompletesRemaining: Number.isFinite(autoCompletes.current) && Number.isFinite(autoCompletes.max)
        ? Math.max(0, autoCompletes.max - autoCompletes.current) : null,
      dailyCapReached: [...(root?.querySelectorAll('button') || [])].some(button => /^Daily Cap\b/i.test(clean(button.textContent))),
      dailyScrollsUsed: dailyScrolls.current,
      dailyScrollsLimit: dailyScrolls.max,
      selectedRegion,
      selectedChallenge,
      expiresAt: Math.min(nextDailyReset(), Date.now() + 300000)
    };
    // Active challenges omit Start requirements; do not replace known counts with zeros.
    for (const key of Object.keys(data)) {
      // An omitted daily counter is normal after reset. Clear old daily totals
      // on a loaded Start page instead of inheriting yesterday's cap.
      if (phase === 'ready' && ['dailyScrollsUsed', 'dailyScrollsLimit'].includes(key)) continue;
      if (data[key] === null || data[key] === '') delete data[key];
    }
    return data;
  }

  function collectChallenges(doc) {
    const data = readChallenges(doc);
    if (!data) return false;
    setCache('challenges', { ...getCache().challenges, ...data, checkedAt: Date.now() });
    if (Number.isFinite(data.scrollsAvailable)) setCachedInventoryQuantity('challenge-scroll.png', data.scrollsAvailable, 'Challenge Scroll', '/assets/items/challenge-scroll.png');
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
    let mutationAttempted = false;
    let syncError = '';
    const recap = { completed: 0, cancelled: 0, purchased: 0, scrollsUsed: 0, goldSpent: 0, autoCompletesRemaining: null };
    let completed = 0, cancelled = 0, purchased = 0, goldSpent = 0, scrollsUsed = 0, lastPurchasePrice = null, stopReason = '';
    const summary = () => `Completed ${completed}${cancelled ? ` · Cancelled ${cancelled}` : ''}${purchased ? ` · Bought ${purchased} (${formatNumber(goldSpent)} gold)` : ''} · ${preferences.region} · ${preferences.skill}${stopReason ? ` · ${stopReason}` : ''}`;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        // Re-query the root: Angular can replace it between challenge phases.
        const buttons = (selector = 'button') => [...(doc.querySelector('challenges-page')?.querySelectorAll(selector) || [])];
        const button = (pattern, includeDisabled = false) => buttons()
          .find(item => pattern.test(clean(item.textContent)) && (includeDisabled || !item.disabled));
        const click = (control, mutates = false) => {
          if (!automationEnabled()) throw new Error('Automation is disabled');
          if (mutates) mutationAttempted = true;
          control.click();
        };
        const capture = () => {
          const snapshot = collectChallenges(doc);
          if (Number.isFinite(snapshot?.autoCompletesRemaining)) recap.autoCompletesRemaining = snapshot.autoCompletesRemaining;
          return snapshot;
        };
        const abandonModal = () => [...(doc.querySelector('challenges-page')?.querySelectorAll('modal-component') || [])]
          .find(modal => clean(modal.querySelector('.header .name')?.textContent) === 'Abandon Challenge');
        const cancelBlocked = async () => {
          capture();
          if (!getChallengePrefs().cancelBlocked) throw new Error('Challenge cannot auto-complete; cancellation is off');
          // Recheck after the UI settles, before either destructive native control.
          await wait(500);
          if (readChallengePhase(doc) !== 'blocked') throw new Error('Challenge changed before cancellation');
          if (!getChallengePrefs().cancelBlocked) throw new Error('Challenge cancellation is off');
          const trash = challengeStepsCard(doc.querySelector('challenges-page'))?.querySelector('.header button.text-button');
          if (!trash || trash.disabled) throw new Error('Challenge trashcan is unavailable');
          click(trash);
          const yes = await waitForChallengeValue(() => [...(abandonModal()?.querySelectorAll('button') || [])]
            .find(item => clean(item.textContent) === 'Yes' && !item.disabled), 'Challenge cancellation confirmation is unavailable');
          if (!getChallengePrefs().cancelBlocked) throw new Error('Challenge cancellation is off');
          click(yes, true);
          const state = await waitForChallengeValue(() => {
            const snapshot = readChallenges(doc);
            return !abandonModal() && snapshot?.phase === 'ready' && Number.isFinite(snapshot.scrollsAvailable) && snapshot;
          }, 'Challenge cancellation was not confirmed');
          capture();
          cancelled++;
          return state;
        };
        const claimReward = async () => {
          const skillButton = await waitForChallengeValue(() => buttons()
            .find(item => clean(item.textContent) === preferences.skill), `Could not select ${preferences.skill}`);
          capture();
          if (!skillButton.disabled) click(skillButton);
          click(await waitForChallengeValue(() => button(/^Claim(?: Reward)?$/i), 'Reward claim did not become available'), true);
        };
        const buyEntry = async () => {
          if (!getChallengePrefs().buyScrolls) return false;
          const open = button(/^Buy$/i);
          if (!open) { stopReason = 'Challenge purchase is unavailable'; return false; }
          click(open);
          const dismiss = () => {
            const cancel = [...(challengeBuyModal(doc)?.querySelectorAll('button') || [])]
              .find(item => clean(item.textContent) === 'Cancel' && !item.disabled);
            if (cancel) cancel.click();
          };
          let quote;
          try {
            quote = await waitForChallengeValue(() => readChallengeBuyQuote(doc), 'Challenge purchase price did not load');
            // Read the live quote and settings again immediately before spending.
            const current = getChallengePrefs();
            const limit = CHALLENGE_BUY_PRICES.includes(current.maxBuyPrice) ? current.maxBuyPrice : 320000;
            if (!current.buyScrolls || !automationEnabled()) { stopReason = 'Challenge purchasing is off'; dismiss(); return false; }
            if (quote.price > limit) { stopReason = `Next entry ${formatNumber(quote.price)} gold exceeds ${formatNumber(limit)} limit`; dismiss(); return false; }
            if (!CHALLENGE_BUY_PRICES.includes(quote.price)) throw new Error('Unrecognized challenge purchase tier');
            if (lastPurchasePrice !== null && quote.price !== lastPurchasePrice * 2) throw new Error('Challenge purchase price did not advance as expected');
            if (quote.buy.disabled) { stopReason = 'Not enough gold or purchase unavailable'; dismiss(); return false; }
            if (!(readChallenges(doc)?.autoCompletesRemaining > 0)) { stopReason = 'No Auto Challenge Completes remaining'; dismiss(); return false; }
            click(quote.buy, true);
          } catch (error) { dismiss(); throw error; }
          // Buy starts a challenge directly. A closed modal alone is not success:
          // Ironwood closes it before its request returns, even if the request fails.
          const phase = await waitForChallengeValue(() => {
            const value = readChallengePhase(doc);
            return !challengeBuyModal(doc) && ['active', 'blocked', 'reward'].includes(value) && value;
          }, 'Challenge purchase was not confirmed');
          purchased++;
          goldSpent += quote.price;
          lastPurchasePrice = quote.price;
          capture();
          return phase;
        };
        let state = await waitForChallengeValue(() => capture(), 'Challenge counts did not finish loading');
        // Resume an existing challenge before selecting the next region or reading
        // Start requirements, which Ironwood hides until this challenge is resolved.
        if (state.phase === 'blocked') state = await cancelBlocked();
        else if (state.phase === 'active' || state.phase === 'reward') {
          if (state.phase === 'active') click(await waitForChallengeValue(() => button(/^Auto Complete/i), 'Auto Complete is unavailable'), true);
          await claimReward();
          state = await waitForChallengeValue(() => {
            const snapshot = readChallenges(doc);
            return snapshot?.phase === 'ready' && Number.isFinite(snapshot.scrollsAvailable) && snapshot;
          }, 'Reward claim was not confirmed');
          capture();
          completed++;
        }
        const regionButton = await waitForChallengeValue(() => buttons('.categories button')
          .find(item => clean(item.textContent) === preferences.region), `Could not find ${preferences.region} challenges`);
        if (!regionButton.disabled) click(regionButton);
        state = await waitForChallengeValue(() => {
          const snapshot = readChallenges(doc);
          return snapshot?.phase === 'ready' && snapshot.selectedRegion === preferences.region && snapshot;
        }, 'Selected challenge did not finish loading');
        capture();
        // Each run is bounded to the native daily scroll cap plus the six allowed
        // paid tiers. Cancelled entries count too, and prices are reread every time.
        let scrollStarts = 0;
        for (let attempted = 0; attempted < 21; attempted++) {
          if (!(state.autoCompletesRemaining > 0)) { stopReason = 'No Auto Challenge Completes remaining'; break; }
          const startingScrolls = state.scrollsAvailable;
          const startingAutoUsed = state.autoCompletesUsed;
          const scrollCap = state.dailyCapReached === true;
          const useScroll = scrollStarts < 15 && !scrollCap && state.scrollsRequired > 0 && state.scrollsAvailable >= state.scrollsRequired;
          let paidPhase = false;
          const required = useScroll ? state.scrollsRequired : 0;
          if (useScroll) {
            click(await waitForChallengeValue(() => button(/^Start$/i), 'Challenge Start is unavailable'), true);
            scrollStarts++;
          } else {
            if (!getChallengePrefs().buyScrolls) { stopReason = scrollCap ? 'Daily scroll cap reached; purchasing is off' : 'No usable scrolls left; purchasing is off'; break; }
            if (purchased >= CHALLENGE_BUY_PRICES.length) { stopReason = 'Maximum paid purchase tier reached'; break; }
            paidPhase = await buyEntry();
            if (!paidPhase) break;
          }
          const phase = paidPhase || await waitForChallengeValue(() => {
            const value = readChallengePhase(doc);
            return ['blocked', 'active', 'reward'].includes(value) && value;
          }, 'Challenge Auto Complete is unavailable');
          if (useScroll) scrollsUsed += required;
          capture();
          if (phase === 'blocked') {
            state = await cancelBlocked();
            if (state.scrollsAvailable > startingScrolls - required) throw new Error('Cancelled challenge consumption was not confirmed');
            continue;
          }
          if (phase === 'active') click(await waitForChallengeValue(() => button(/^Auto Complete/i), 'Auto Complete is unavailable'), true);
          await claimReward();
          state = await waitForChallengeValue(() => {
            const snapshot = readChallenges(doc);
            return snapshot?.phase === 'ready'
              && snapshot.scrollsAvailable <= startingScrolls - required
              && snapshot.autoCompletesUsed > startingAutoUsed && snapshot;
          }, `Reward claim was not confirmed after ${completed} completed`);
          capture();
          completed++;
        }
        result = summary();
        successful = true;
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge automation failed', error);
      stopReason = error.message;
      result = summary();
    } finally {
      if (mutationAttempted) {
        try { await synchronizeNativeGame(); }
        catch (error) {
          syncError = 'Game state could not sync. Reload the game before another run.';
          console.error('[Ironwood Status] Post-challenge synchronization failed', error);
        }
      }
      AppState.ui.runningChallenge = false;
      AppState.ui.automationTask = '';
      const cached = getCache().challenges || {};
      Object.assign(recap, { completed, cancelled, purchased, scrollsUsed, goldSpent });
      const lastRun = { result, successful, finishedAt: Date.now(), ...recap, region: preferences.region, skill: preferences.skill, stopReason, syncError };
      setCache('challenges', { ...cached, lastRun });
      AppState.ui.lastSignature = '';
      render();
      showChallengeRecap(lastRun);
    }
  }
