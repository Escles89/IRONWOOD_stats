  function cancelVisibleCacheCapture() {
    if (AppState.ui.visibleCaptureTimer !== null) clearTimeout(AppState.ui.visibleCaptureTimer);
    AppState.ui.visibleCaptureTimer = null;
  }

  function visibleCaptureThrottled(key, interval, force) {
    const remaining = interval - (Date.now() - (AppState.ui.visibleCaptureTimes[key] || 0));
    if (force || remaining <= 0) return false;
    // Keep one trailing read: the last native update may be the only mutation
    // we see before the page settles. Read the current DOM when it runs.
    if (AppState.ui.visibleCaptureTimer === null) {
      const path = location.pathname;
      AppState.ui.visibleCaptureTimer = setTimeout(() => {
        AppState.ui.visibleCaptureTimer = null;
        if (location.pathname === path) captureVisibleCaches({ force: true });
      }, remaining);
    }
    return true;
  }

  function captureVisibleAdventure(force = false) {
    if (location.pathname !== '/adventure' || visibleCaptureThrottled('adventure', 2000, force)) return;
    if (collectAdventure(document)) AppState.ui.visibleCaptureTimes.adventure = Date.now();
  }

  function captureVisibleQuests(force = false) {
    if (visibleCaptureThrottled('quests', 2000, force)) return;
    const root = document.querySelector('quests-page');
    const names = [...(root?.querySelectorAll('.row .name') || [])].map((element) => clean(element.textContent));
    const dailyCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Daily Quests');
    if (!dailyCard || !names.includes('Auto Quest Completes') || !names.includes('Daily Quest Reset')) return;
    AppState.ui.visibleCaptureTimes.quests = Date.now();
    collectQuests(document);
  }

  function captureVisibleAttunement() {
    const root = document.querySelector('attunement-page');
    const slotsCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
    if (!slotsCard) return false;
    const previous = getCache().attunement || {};
    const previousByName = new Map((previous.selected || []).map((item) => [item.name, item]));
    const selected = [...slotsCard.querySelectorAll(':scope > button.row')].map((slot) => {
      const name = clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent);
      return {
        ...previousByName.get(name), name,
        skill: clean(slot.querySelector('.name .secondary')?.textContent),
        image: slot.querySelector('img')?.getAttribute('src') || ''
      };
    });
    if (!selected.length || selected.some(slot => !slot.name)) return false;
    const requirements = [...root.querySelectorAll('.card')]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
    const tributeRow = [...(requirements?.querySelectorAll(':scope > .row') || [])]
      .find((row) => /^(Forest|Mountain|Ocean) Tribute$/.test(clean(row.querySelector('.name')?.textContent)));
    const tributes = { ...(previous.tributes || {}) };
    const region = clean(tributeRow?.querySelector('.name')?.textContent).replace(' Tribute', '');
    const tributeAmount = readTributeBalance(tributeRow?.querySelector('.amount')?.textContent);
    if (region && Number.isFinite(tributeAmount)) tributes[region] = tributeAmount;
    setCache('attunement', { schema: 3, selected, tributes, lastClaim: previous.lastClaim });
    return true;
  }

  function captureVisibleAutomation(force = false) {
    const item = readVisibleAutomation(document);
    if (!item) return;
    const captureKey = `automations:${item.structure}`;
    if (visibleCaptureThrottled(captureKey, 1500, force)) return;
    AppState.ui.visibleCaptureTimes[captureKey] = Date.now();
    storeAutomationStructure(item);
  }

  function captureVisibleCaches({ force = false } = {}) {
    const path = location.pathname;
    if (path !== AppState.ui.visibleCaptureRoute) {
      cancelVisibleCacheCapture();
      AppState.ui.visibleCaptureRoute = path;
      AppState.ui.visibleCaptureTimes = {};
    }
    if (force || !AppState.ui.page?.hidden || path === STATS_PATH || path === SKILLS_PATH) cancelVisibleCacheCapture();
    if (!AppState.ui.page?.hidden || path === STATS_PATH || path === SKILLS_PATH) return;
    const capture = (key, ready, fn) => {
      if (!ready || visibleCaptureThrottled(key, 2000, force)) return;
      if (fn()) AppState.ui.visibleCaptureTimes[key] = Date.now();
    };
    if (path === '/quests') captureVisibleQuests(force);
    else if (path === '/inventory') capture('inventory', document.querySelector('inventory-page'), () => collectInventory(document));
    else if (path === '/equipment') capture('equipped', [...document.querySelectorAll('.card')].some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'), () => storeEquippedDivine(divineConsumables(document), true));
    else if (path === '/adventure') captureVisibleAdventure(force);
    else if (path === '/challenges') capture('challenges', document.querySelector('challenges-page'), () => collectChallenges(document));
    else if (path === '/skill/15') {
      const root = document.querySelector('taming-page');
      const previous = getCache().taming || {};
      const eggs = readTamingEggs(root, previous);
      // Native Ranch readiness arrives after its first timer tick. Do not lose
      // that one-off marker change inside the normal two-second capture throttle.
      if (['hatcheryEggsReady', 'ranchEggsReady'].some(key => typeof eggs[key] === 'boolean' && eggs[key] !== previous[key])) {
        AppState.ui.visibleCaptureTimes.taming = 0;
      }
      capture('taming', root, () => collectTaming(document));
    }
    else if (path === '/attunement') capture('attunement', document.querySelector('attunement-page'), captureVisibleAttunement);
    else if (path === '/mastery') capture('mastery', document.querySelector('mastery-page'), () => collectMastery(document));
    else if (path === '/profile') capture('playerName', document.querySelector('profile-page profile-card-component .name'), () => collectPlayerName(document));
    else if (path.startsWith('/house')) captureVisibleAutomation(force);
    else if (path.startsWith('/guild')) {
      const headers = [...document.querySelectorAll('guild-page .card > .header > .name')].map((element) => clean(element.textContent));
      // Cooldown has Events / Requirements cards, with no Participants card.
      // The collector validates either layout and rejects partial mounts.
      capture('guildEvent', true, () => collectGuildEvent(document));
      if (headers.some((name) => /^(Incomplete|Complete) Trials$/.test(name))) capture('guildTrial', true, () => collectGuildTrial(document));
    }
  }
