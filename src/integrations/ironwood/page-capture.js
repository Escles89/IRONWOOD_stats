  function captureVisibleAdventure() {
    if (location.pathname !== '/adventure' || Date.now() - AppState.ui.lastAdventureCapture < 2000) return;
    if (collectAdventure(document)) AppState.ui.lastAdventureCapture = Date.now();
  }

  function captureVisibleQuests() {
    if (Date.now() - (AppState.ui.visibleCaptureTimes.quests || 0) < 2000) return;
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
    if (!slotsCard) return;
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
    const requirements = [...root.querySelectorAll('.card')]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
    const tributeRow = [...(requirements?.querySelectorAll(':scope > .row') || [])]
      .find((row) => /^(Forest|Mountain|Ocean) Tribute$/.test(clean(row.querySelector('.name')?.textContent)));
    const tributes = { ...(previous.tributes || {}) };
    const region = clean(tributeRow?.querySelector('.name')?.textContent).replace(' Tribute', '');
    if (region) tributes[region] = numberFrom(clean(tributeRow.querySelector('.amount')?.textContent).split('/')[0]);
    setCache('attunement', { schema: 3, selected, tributes });
  }

  function captureVisibleAutomation() {
    const item = readVisibleAutomation(document);
    if (!item) return;
    const captureKey = `automations:${item.structure}`;
    if (Date.now() - (AppState.ui.visibleCaptureTimes[captureKey] || 0) < 1500) return;
    AppState.ui.visibleCaptureTimes[captureKey] = Date.now();
    storeAutomationStructure(item);
  }

  function captureVisibleCaches() {
    if (!AppState.ui.page?.hidden || location.pathname === STATS_PATH) return;
    const path = location.pathname;
    const capture = (key, ready, fn) => {
      if (!ready || Date.now() - (AppState.ui.visibleCaptureTimes[key] || 0) < 2000) return;
      if (fn() !== false) AppState.ui.visibleCaptureTimes[key] = Date.now();
    };
    if (path === '/quests') captureVisibleQuests();
    else if (path === '/inventory') capture('inventory', document.querySelector('inventory-page'), () => collectInventory(document));
    else if (path === '/equipment') capture('equipped', [...document.querySelectorAll('.card')].some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'), () => storeEquippedDivine(divineConsumables(document), true));
    else if (path === '/adventure') captureVisibleAdventure();
    else if (path === '/challenges') capture('challenges', document.querySelector('challenges-page'), () => collectChallenges(document));
    else if (path === '/skill/15') capture('taming', document.querySelector('taming-page .row .name'), () => collectTaming(document));
    else if (path === '/attunement') capture('attunement', document.querySelector('attunement-page'), captureVisibleAttunement);
    else if (path === '/mastery') capture('mastery', document.querySelector('mastery-page'), () => collectMastery(document));
    else if (path === '/profile') capture('playerName', document.querySelector('profile-page profile-card-component .name'), () => collectPlayerName(document));
    else if (path.startsWith('/house')) captureVisibleAutomation();
    else if (path.startsWith('/guild')) {
      const headers = [...document.querySelectorAll('guild-page .card > .header > .name')].map((element) => clean(element.textContent));
      if (headers.includes('Event') && headers.includes('Participants')) capture('guildEvent', true, () => collectGuildEvent(document));
      if (headers.some((name) => /^(Incomplete|Complete) Trials$/.test(name))) capture('guildTrial', true, () => collectGuildTrial(document));
    }
  }
