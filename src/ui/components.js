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
    return localStorage.getItem(CACHE_LOOKUPS_KEY) === 'true';
  }
  function setCacheLookupsEnabled(enabled) {
    localStorage.setItem(CACHE_LOOKUPS_KEY, enabled ? 'true' : 'false');
    AppState.ui.lastSignature = '';
  }
  function getChallengePrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHALLENGE_PREFS_KEY) || '{}');
      const region = Object.hasOwn(CHALLENGE_SKILLS, saved.region) ? saved.region : 'Mountain';
      const skill = CHALLENGE_SKILLS[region].includes(saved.skill) ? saved.skill : 'Defense';
      return { region, skill };
    } catch { return { region: 'Mountain', skill: 'Defense' }; }
  }
  function setChallengePrefs(preferences) {
    const region = Object.hasOwn(CHALLENGE_SKILLS, preferences.region) ? preferences.region : 'Mountain';
    const skill = CHALLENGE_SKILLS[region].includes(preferences.skill) ? preferences.skill : 'Defense';
    localStorage.setItem(CHALLENGE_PREFS_KEY, JSON.stringify({ region, skill }));
    AppState.ui.lastSignature = '';
  }
