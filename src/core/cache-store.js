  function loadCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      AppState.cache.records = saved?.schemaVersion === 2 && saved.records && typeof saved.records === 'object' && !Array.isArray(saved.records)
        ? saved.records : {};
    } catch { AppState.cache.records = {}; }
    return AppState.cache.records;
  }
  function persistCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(AppState.cache));
    AppState.ui.lastSignature = '';
  }
  const CacheStore = {
    get(key) { const records = loadCache(); return key === undefined ? records : records[key]; },
    set(key, value, metadata = {}) {
      loadCache();
      AppState.cache.records[key] = { checkedAt: Date.now(), source: AppState.ui.captureSource || 'native', ...value, ...metadata };
      persistCache();
      return AppState.cache.records[key];
    },
    isFresh(key) { loadCache(); return !cacheRecordIsStale(key); },
    invalidate(key) { loadCache(); delete AppState.cache.records[key]; persistCache(); },
    reset() { AppState.cache.records = {}; persistCache(); }
  };
  function getCache() { return CacheStore.get(); }
  function setCache(key, data) { return CacheStore.set(key, data); }
  function isStale(key) { return !CacheStore.isFresh(key); }
  function cacheRecordIsStale(key) {
    const entry = AppState.cache.records[key];
    const incompleteAdventure = key === 'adventure' && entry && (entry.schema !== 10 || [
      entry.researchPoints, entry.mapCost, entry.dailyMapsCreated,
      entry.dailyMapsLimit, entry.mapsStored, entry.mapStorageLimit
    ].some((value) => typeof value !== 'number' || !Number.isFinite(value)));
    const incompleteGuildEvent = key === 'guildEvent' && entry?.schema !== 7;
    const incompleteGuildTrial = key === 'guildTrial' && entry?.schema !== 3;
    const guildTrialRefreshDue = key === 'guildTrial' && entry && Number.isFinite(entry.refreshAt) && Date.now() >= entry.refreshAt;
    const incompleteQuests = key === 'quests' && (entry?.schema !== 2 || (getPrefs().length === 5 && entry?.day === dayKey() && !entry.dailyComplete));
    const incompleteAttunement = key === 'attunement' && entry?.schema !== 3;
    const incompleteMastery = key === 'mastery' && entry?.schema !== 1;
    const incompleteChallenges = key === 'challenges' && entry?.schema !== 3;
    const incompleteTaming = key === 'taming' && entry?.schema !== 2;
    const incompleteAutomations = key === 'automations' && entry?.schema !== 4;
    return !entry || !Number.isFinite(entry.checkedAt) || incompleteAdventure || incompleteGuildEvent || incompleteGuildTrial || guildTrialRefreshDue || incompleteQuests || incompleteAttunement || incompleteMastery || incompleteChallenges || incompleteTaming || incompleteAutomations || (key === 'inventory' && !Array.isArray(entry.allItems)) || (entry.expiresAt ? Date.now() >= entry.expiresAt : Date.now() - entry.checkedAt > TTL[key]) || (key === 'quests' && entry.day !== dayKey());
  }
