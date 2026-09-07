  let loadedCacheSnapshot;
  function loadCache() {
    const serialized = localStorage.getItem(CACHE_KEY);
    if (serialized === loadedCacheSnapshot) return AppState.cache.records;
    loadedCacheSnapshot = serialized;
    AppState.ui.cacheRevision += 1;
    try {
      const saved = JSON.parse(serialized || 'null');
      AppState.cache.records = saved?.schemaVersion === 2 && saved.records && typeof saved.records === 'object' && !Array.isArray(saved.records)
        ? saved.records : {};
    } catch { AppState.cache.records = {}; }
    return AppState.cache.records;
  }
  function persistCache() {
    const serialized = JSON.stringify(AppState.cache);
    localStorage.setItem(CACHE_KEY, serialized);
    loadedCacheSnapshot = serialized;
    AppState.ui.cacheRevision += 1;
    AppState.ui.lastSignature = '';
  }
  const CacheStore = {
    get(key) { const records = loadCache(); return key === undefined ? records : records[key]; },
    set(key, value, metadata = {}) {
      loadCache();
      AppState.cache.records[key] = { checkedAt: Date.now(), source: AppState.ui.captureSource || 'native', ...value, ...metadata, updatedAt: Date.now() };
      persistCache();
      AppState.ui.cacheWrites[key] = Date.now();
      return AppState.cache.records[key];
    },
    isFresh(key) { loadCache(); return !cacheRecordIsStale(key); },
    isUsable(key) { loadCache(); return !cacheRecordIsStale(key, true); },
    invalidate(key) { loadCache(); delete AppState.cache.records[key]; persistCache(); },
    reset() { AppState.cache.records = {}; persistCache(); }
  };
  function getCache() { return CacheStore.get(); }
  function setCache(key, data) { return CacheStore.set(key, data); }
  function isStale(key) { return !CacheStore.isFresh(key); }
  function needsLookup(key) { return !CacheStore.isUsable(key); }
  function cacheRecordIsStale(key, ignoreAge = false) {
    const entry = AppState.cache.records[key];
    if (key === 'inventory' && (entry?.needsReconcile || (entry?.schema !== 1 && !entry?.allItems?.length))) return true;
    const incompleteAdventure = key === 'adventure' && entry && (entry.schema !== 11 || entry.state === 'Unknown' || (entry.state === 'Active' && !entry.mapSkill) || [
      entry.researchPoints, entry.mapCost, entry.dailyMapsCreated,
      entry.dailyMapsLimit, entry.mapsStored, entry.mapStorageLimit
    ].some((value) => typeof value !== 'number' || !Number.isFinite(value)));
    const incompleteGuildEvent = key === 'guildEvent' && entry?.schema !== 9;
    const incompleteGuildTrial = key === 'guildTrial' && (entry?.schema !== 4 || entry.state === 'Unknown');
    const guildTrialRefreshDue = !ignoreAge && key === 'guildTrial' && entry && Number.isFinite(entry.refreshAt) && Date.now() >= entry.refreshAt;
    const incompleteQuests = key === 'quests' && (entry?.schema !== 2 || (!ignoreAge && getPrefs().length === 5 && entry?.day === dayKey() && !entry.dailyComplete));
    const incompleteAttunement = key === 'attunement' && entry?.schema !== 3;
    const incompleteMastery = key === 'mastery' && entry?.schema !== 1;
    const incompleteChallenges = key === 'challenges' && (entry?.schema !== 4 || !Number.isFinite(entry.scrollsAvailable) || !Number.isFinite(entry.autoCompletesRemaining));
    const incompleteTaming = key === 'taming' && entry?.schema !== 2;
    const incompleteAutomations = key === 'automations' && entry?.schema !== 4;
    return !entry || !Number.isFinite(entry.checkedAt) || incompleteAdventure || incompleteGuildEvent || incompleteGuildTrial || guildTrialRefreshDue || incompleteQuests || incompleteAttunement || incompleteMastery || incompleteChallenges || incompleteTaming || incompleteAutomations || (key === 'inventory' && !Array.isArray(entry.allItems)) || (!ignoreAge && ((entry.expiresAt ? Date.now() >= entry.expiresAt : Date.now() - entry.checkedAt > TTL[key]) || (key === 'quests' && entry.day !== dayKey())));
  }
