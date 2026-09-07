  function adventureBonusActive(entry, skillName, now = Date.now()) {
    return Boolean(entry?.schema === 11 && entry.state === 'Active' && entry.stateEndsAt > now
      && clean(entry.mapSkill) && clean(skillName)
      && clean(entry.mapSkill).toLowerCase() === clean(skillName).toLowerCase());
  }
  function adventureDetail(entry) {
    if (!entry || entry.schema !== 11) return 'Adventure needs checking';
    const remaining = Number(entry.stateEndsAt) - Date.now();
    if (entry.state === 'Active' && remaining > 0) return `${entry.mapName || 'Adventure'} · ${formatDuration(remaining / 1000)} remaining`;
    if (entry.state === 'Active') return `${entry.mapName || 'Adventure'} ending`;
    return withoutSeconds(entry.stateDetail) || humanAge(entry.checkedAt);
  }
  function collectAdventure(doc) {
    const root = doc.querySelector('adventure-page');
    if (!root) return null;
    const previous = getCache().adventure || {};
    const cards = [...root.querySelectorAll('.card')];
    const createCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Create Map');
    const menu = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Menu');
    const adventureRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Adventure');
    const storageRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Storage');
    const rawStateText = clean(adventureRow?.querySelector('.time')?.textContent) || clean(adventureRow?.querySelector('.event-icon, .amount')?.textContent) || 'Unknown';
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
    if (!active && !cooldown && !/^(Idle|Available|Ready)$/i.test(stateText)) return null;
    const resetText = cooldown ? withoutSeconds(values['Weekly Limit Reset'] || values['Daily Limit Reset']) : '';
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      if (!match) return { current: null, max: null };
      return { current: parseCompact(match[1]), max: parseCompact(match[2]) };
    };
    const researchSource = researchRow || allRows.find(row => clean(row.querySelector('.name')?.textContent) === 'Research Points');
    const research = pair(researchSource?.querySelector('.amount')?.textContent);
    const dailyMaps = pair(values['Daily Map Limit']);
    const storage = pair(storageRow?.querySelector('.amount')?.textContent);
    const endsAt = activeDuration ? Date.now() + activeDuration : null;
    const sameRun = active && previous.state === 'Active' && previous.stateEndsAt > Date.now()
      && Math.abs(previous.stateEndsAt - endsAt) < 60000;
    const adventureCard = cards.find(card => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Adventure');
    const remainingRow = [...(adventureCard?.querySelectorAll('.row') || [])]
      .find(row => clean(row.querySelector('.name')?.textContent) === 'Remaining Time');
    // Storage can display a selected map as well. Only the running-adventure
    // view, with its Remaining Time row, identifies the active map.
    const mapCard = active && remainingRow && adventureRow?.classList.contains('row-active')
      ? cards.find(card => / Map$/.test(clean(card.querySelector(':scope > .header > .name')?.textContent))) : null;
    const mapName = mapCard ? clean(mapCard.querySelector(':scope > .header > .name')?.textContent)
      : sameRun ? previous.mapName || '' : '';
    const data = {
      schema: 11,
      mapName: active ? mapName : '', mapSkill: active ? mapName.replace(/ Map$/, '') : '',
      state: active ? 'Active' : cooldown ? 'Cooldown' : stateText,
      stateDetail: active ? 'In progress' : cooldown ? `Ready in ${resetText}` : 'No adventure running',
      stateEndsAt: endsAt,
      dailyLimit: values['Daily Map Limit'] || '', weeklyLimit: values['Weekly Adventure Limit'] || '',
      dailyReset: values['Daily Limit Reset'] || '', weeklyReset: values['Weekly Limit Reset'] || '',
      researchPoints: research.current ?? previous.researchPoints ?? null, mapCost: research.max ?? previous.mapCost ?? null,
      dailyMapsCreated: dailyMaps.current ?? previous.dailyMapsCreated ?? null, dailyMapsLimit: dailyMaps.max ?? previous.dailyMapsLimit ?? null,
      mapsStored: storage.current ?? previous.mapsStored ?? null, mapStorageLimit: storage.max ?? previous.mapStorageLimit ?? null,
      mapsComplete: dailyMaps.max > 0 ? dailyMaps.current >= dailyMaps.max : Boolean(previous.mapsComplete),
      mapAutomation: getCache().adventure?.mapAutomation || null,
      expiresAt: active ? Date.now() + Math.min(activeDuration || 4 * 3600000, 4 * 3600000) : Math.min(nextDailyReset(), Date.now() + 300000)
    };
    setCache('adventure', data);
    return data;
  }

  async function refreshAdventureSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !needsLookup('adventure')) return;
    if (AppState.ui.refreshingAdventure) return;
    AppState.ui.refreshingAdventure = true;
    try {
      await withPage('/adventure', 'adventure-page', async (doc) => {
        const started = Date.now();
        let opened = false;
        while (Date.now() - started < 8000) {
          const storage = [...doc.querySelectorAll('adventure-page button.row')]
            .find(button => clean(button.querySelector('.name')?.textContent) === 'Storage');
          if (storage && !opened) { storage.click(); opened = true; }
          const data = opened ? collectAdventure(doc) : null;
          const research = [...doc.querySelectorAll('adventure-page .row')]
            .find(row => clean(row.querySelector('.name')?.textContent) === 'Research Points');
          if (data && research && Number.isFinite(data.researchPoints)) break;
          await wait(100);
        }
        await captureAdventureMapDetails(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Adventure snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingAdventure = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  async function captureAdventureMapDetails(doc) {
    const data = collectAdventure(doc);
    if (data?.state !== 'Active') return data;
    const button = [...doc.querySelectorAll('adventure-page button.row')]
      .find(element => clean(element.querySelector('.name')?.textContent) === 'Adventure');
    if (!button) return data;
    button.click();
    const started = Date.now();
    while (Date.now() - started < 6000) {
      const current = collectAdventure(doc);
      if (current?.state === 'Active' && current.mapSkill) return current;
      await wait(100);
    }
    return getCache().adventure;
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
    if (!state) throw new Error('Adventure data has not loaded');
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
      do { await wait(200); state = collectAdventure(doc) || state; }
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
        do { await wait(200); state = collectAdventure(doc) || state; }
        while (Date.now() - sellStarted < 5000 && state.mapsStored >= previousStored + 1);
        if (state.mapsStored >= previousStored + 1) { stoppedReason = `${rarity} map sale was not confirmed`; break; }
        sold++;
      }
      state = collectAdventure(doc) || state;
      if (!rpConfirmed) { stoppedReason = 'RP balance update was not confirmed'; break; }
    }
    const finalReadStarted = Date.now();
    do { await wait(150); state = collectAdventure(doc) || state; }
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
