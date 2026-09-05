  function adventureDetail(entry) {
    if (!entry) return 'Never checked';
    const remaining = Number(entry.stateEndsAt) - Date.now();
    if (entry.state === 'Active' && remaining > 0) return `In progress · ${formatDuration(remaining / 1000)} remaining`;
    if (entry.state === 'Active') return 'Adventure ending';
    return withoutSeconds(entry.stateDetail) || humanAge(entry.checkedAt);
  }
  function collectAdventure(doc) {
    const root = doc.querySelector('adventure-page');
    const cards = [...root.querySelectorAll('.card')];
    const createCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Create Map');
    const menu = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Menu');
    const adventureRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Adventure');
    const storageRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Storage');
    const rawStateText = clean(adventureRow?.querySelector('.event-icon, .amount')?.textContent) || 'Unknown';
    const stateText = withoutSeconds(rawStateText);
    const allRows = [...root.querySelectorAll('.row')];
    const researchRow = [...(createCard?.querySelectorAll('.row') || [])]
      .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
    const values = {};
    allRows.forEach((row) => {
      const name = clean(row.querySelector('.name')?.textContent);
      if (['Map Points', 'Map Effect', 'Daily Map Limit', 'Daily Upgrade Limit', 'Daily Limit Reset', 'Weekly Adventure Limit', 'Weekly Limit Reset'].includes(name)) {
        values[name] = clean([...row.children].filter((child) => !child.classList.contains('name')).map((child) => child.textContent).join(' '));
      }
    });
    const cooldown = /Cooldown/i.test(stateText);
    const activeDuration = durationMs(rawStateText);
    const active = !cooldown && activeDuration > 0;
    const resetText = cooldown ? withoutSeconds(values['Weekly Limit Reset'] || values['Daily Limit Reset']) : '';
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      if (!match) return { current: null, max: null };
      return { current: parseCompact(match[1]), max: parseCompact(match[2]) };
    };
    const research = pair(researchRow?.querySelector('.amount')?.textContent);
    const dailyMaps = pair(values['Daily Map Limit']);
    const storage = pair(storageRow?.querySelector('.amount')?.textContent);
    const data = {
      schema: 10,
      state: active ? 'Active' : cooldown ? 'Cooldown' : stateText,
      stateDetail: active ? 'In progress' : cooldown ? `Ready in ${resetText}` : 'No adventure running',
      stateEndsAt: activeDuration ? Date.now() + activeDuration : null,
      dailyLimit: values['Daily Map Limit'] || '', weeklyLimit: values['Weekly Adventure Limit'] || '',
      dailyReset: values['Daily Limit Reset'] || '', weeklyReset: values['Weekly Limit Reset'] || '',
      researchPoints: research.current, mapCost: research.max,
      dailyMapsCreated: dailyMaps.current, dailyMapsLimit: dailyMaps.max,
      mapsStored: storage.current, mapStorageLimit: storage.max,
      mapsComplete: dailyMaps.max > 0 && dailyMaps.current >= dailyMaps.max,
      mapAutomation: getCache().adventure?.mapAutomation || null,
      expiresAt: active ? Date.now() + Math.min(activeDuration || 4 * 3600000, 4 * 3600000) : nextDailyReset()
    };
    setCache('adventure', data);
    return data;
  }

  async function refreshAdventureSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !isStale('adventure')) return;
    if (AppState.ui.refreshingAdventure) return;
    AppState.ui.refreshingAdventure = true;
    try {
      await withPage('/adventure', 'adventure-page', async (doc) => {
        const started = Date.now();
        let researchRow = null;
        while (Date.now() - started < 8000) {
          researchRow = [...doc.querySelectorAll('adventure-page .row')]
            .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
          if (researchRow && /\//.test(clean(researchRow.querySelector('.amount')?.textContent))) break;
          await wait(100);
        }
        if (researchRow) collectAdventure(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Adventure snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingAdventure = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  function selectedMapRarity(doc) {
    const sell = [...doc.querySelectorAll('adventure-page button')]
      .find((button) => clean(button.textContent) === 'Sell' && !button.disabled);
    if (!sell) return '';
    let node = sell.parentElement;
    while (node && node.matches?.('adventure-page') === false) {
      const text = clean(node.textContent);
      const rarity = text.match(/\b(Legendary|Epic|Rare|Uncommon|Common)\b/i)?.[1];
      if (rarity) return rarity[0].toUpperCase() + rarity.slice(1).toLowerCase();
      node = node.parentElement;
    }
    return '';
  }
  async function automateMaps(doc) {
    if (!automationEnabled()) return collectAdventure(doc);
    let state = collectAdventure(doc);
    let created = 0;
    let sold = 0;
    let kept = 0;
    let stoppedReason = '';
    const runStarted = Date.now();
    const startingRP = state.researchPoints;
    while (state.dailyMapsLimit > 0 && state.dailyMapsCreated < state.dailyMapsLimit && created < 12) {
      if (state.mapsStored >= state.mapStorageLimit) { stoppedReason = 'Map storage is full'; break; }
      if (state.researchPoints < state.mapCost) { stoppedReason = 'Not enough RP'; break; }
      const storageButton = [...doc.querySelectorAll('adventure-page button.row')]
        .find((button) => clean(button.querySelector('.name')?.textContent) === 'Storage');
      storageButton?.click();
      await wait(250);
      const createButton = [...doc.querySelectorAll('adventure-page button')]
        .find((button) => clean(button.textContent) === 'Create' && button.classList.contains('action-button'));
      if (!createButton || createButton.disabled) { stoppedReason = 'Create Map is unavailable'; break; }
      const previousCreated = state.dailyMapsCreated;
      const previousStored = state.mapsStored;
      const previousRP = state.researchPoints;
      const expectedRP = Math.max(0, previousRP - state.mapCost);
      createButton.click();
      const createStarted = Date.now();
      do { await wait(200); state = collectAdventure(doc); }
      while (Date.now() - createStarted < 6000 &&
        (state.dailyMapsCreated <= previousCreated || state.researchPoints > expectedRP));
      if (state.dailyMapsCreated <= previousCreated) { stoppedReason = 'Map creation was not confirmed'; break; }
      const rpConfirmed = state.researchPoints <= expectedRP;
      created += state.dailyMapsCreated - previousCreated;
      let rarity = '';
      const rarityStarted = Date.now();
      while (Date.now() - rarityStarted < 3000 && !rarity) { rarity = selectedMapRarity(doc); if (!rarity) await wait(150); }
      if (!rarity) { stoppedReason = 'Created map rarity could not be read'; break; }
      if (rarity === 'Legendary') {
        kept++;
      } else {
        const sellButton = [...doc.querySelectorAll('adventure-page button')]
          .find((button) => clean(button.textContent) === 'Sell' && !button.disabled);
        if (!sellButton) { stoppedReason = `Could not sell ${rarity} map`; break; }
        sellButton.click();
        const sellStarted = Date.now();
        do { await wait(200); state = collectAdventure(doc); }
        while (Date.now() - sellStarted < 5000 && state.mapsStored >= previousStored + 1);
        if (state.mapsStored >= previousStored + 1) { stoppedReason = `${rarity} map sale was not confirmed`; break; }
        sold++;
      }
      state = collectAdventure(doc);
      if (!rpConfirmed) { stoppedReason = 'RP balance update was not confirmed'; break; }
    }
    const finalReadStarted = Date.now();
    do { await wait(150); state = collectAdventure(doc); }
    while (Date.now() - finalReadStarted < 1200 && !Number.isFinite(state.researchPoints));
    const complete = state.dailyMapsLimit > 0 && state.dailyMapsCreated >= state.dailyMapsLimit;
    const current = getCache().adventure || state;
    setCache('adventure', {
      ...current,
      mapsComplete: complete,
      mapAutomation: {
        attempted: true, created, sold, kept, complete,
        startingRP, researchPointsRemaining: state.researchPoints,
        rpSpent: Number.isFinite(startingRP) && Number.isFinite(state.researchPoints) ? startingRP - state.researchPoints : null,
        stoppedReason: complete ? '' : (stoppedReason || 'Stopped before the daily limit'),
        runStarted, finishedAt: Date.now()
      }
    });
    return getCache().adventure;
  }
