  function headerIconsEnabled() { return localStorage.getItem(HEADER_ICONS_KEY) === 'true'; }
  function multiplayerControlEnabled() { return localStorage.getItem(MULTIPLAYER_VISIBLE_KEY) === 'true'; }
  function getPotionTypes() {
    try {
      const saved = JSON.parse(localStorage.getItem(POTION_TYPES_KEY));
      if (Array.isArray(saved)) return [...new Set(saved.filter(type => POTION_TYPES.includes(type)))];
    } catch {}
    return localStorage.getItem(SUPER_POTIONS_KEY) === 'true' ? ['Divine', 'Super'] : ['Divine'];
  }
  function potionType(item) {
    const key = item.key || item.image?.split('/').pop()?.split('?')[0] || '';
    if (!/^potion-[\w-]+\.[\w]+$/.test(key)) return null;
    return /^potion-divine-/.test(key) ? 'Divine' : /^potion-super-/.test(key) ? 'Super' : 'Regular';
  }
  function getPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '[]'); } catch { return []; }
  }
  function automationEnabled() {
    return localStorage.getItem(AUTOMATION_KEY) === 'true';
  }
  function setAutomationEnabled(enabled) {
    localStorage.setItem(AUTOMATION_KEY, enabled ? 'true' : 'false');
    AppState.ui.lastSignature = '';
  }
  function cacheLookupsEnabled() {
    return Boolean(AppState.ui.manualCacheRefresh) || localStorage.getItem(CACHE_LOOKUPS_KEY) === 'true';
  }
  function setCacheLookupsEnabled(enabled) {
    localStorage.setItem(CACHE_LOOKUPS_KEY, enabled ? 'true' : 'false');
    AppState.ui.lastSignature = '';
  }
  const CHALLENGE_BUY_PRICES = [10000, 20000, 40000, 80000, 160000, 320000];
  function getChallengePrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHALLENGE_PREFS_KEY) || '{}');
      const region = Object.hasOwn(CHALLENGE_SKILLS, saved.region) ? saved.region : 'Mountain';
      const skill = CHALLENGE_SKILLS[region].includes(saved.skill) ? saved.skill : 'Defense';
      return { region, skill, cancelBlocked: saved.cancelBlocked === true, buyScrolls: saved.buyScrolls === true,
        maxBuyPrice: CHALLENGE_BUY_PRICES.includes(saved.maxBuyPrice) ? saved.maxBuyPrice : 320000 };
    } catch { return { region: 'Mountain', skill: 'Defense', cancelBlocked: false, buyScrolls: false, maxBuyPrice: 320000 }; }
  }
  function setChallengePrefs(preferences) {
    const region = Object.hasOwn(CHALLENGE_SKILLS, preferences.region) ? preferences.region : 'Mountain';
    const skill = CHALLENGE_SKILLS[region].includes(preferences.skill) ? preferences.skill : 'Defense';
    const previous = getChallengePrefs();
    const cancelBlocked = preferences.cancelBlocked ?? previous.cancelBlocked;
    const buyScrolls = preferences.buyScrolls ?? previous.buyScrolls;
    const price = preferences.maxBuyPrice ?? previous.maxBuyPrice;
    const maxBuyPrice = CHALLENGE_BUY_PRICES.includes(price) ? price : 320000;
    localStorage.setItem(CHALLENGE_PREFS_KEY, JSON.stringify({ region, skill, cancelBlocked: cancelBlocked === true, buyScrolls: buyScrolls === true, maxBuyPrice }));
    AppState.ui.lastSignature = '';
  }

  function renderActionSpinner() {
    // Reuse the original Challenges two-arrow activity indicator.
    return '<svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg>';
  }

  function setClaimButtonState(button, label, state = 'ready') {
    button.textContent = label;
    button.title = label;
    button.setAttribute?.('data-claim-state', state);
    button.setAttribute?.('aria-label', label);
    button.setAttribute?.('aria-busy', state === 'busy' ? 'true' : 'false');
  }
