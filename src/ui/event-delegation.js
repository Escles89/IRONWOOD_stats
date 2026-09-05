  function installEventDelegation() {
    document.addEventListener('change', (event) => {
      if (event.target.matches?.('[data-super-potions-toggle]')) {
        localStorage.setItem(SUPER_POTIONS_KEY, event.target.checked ? 'true' : 'false');
        AppState.ui.lastSignature = '';
        render();
        return;
      }
      if (event.target.matches?.('[data-automation-toggle]')) {
        setAutomationEnabled(event.target.checked);
        AppState.ui.automationTask = '';
        render();
        return;
      }
      if (event.target.matches?.('[data-cache-lookups-toggle]')) {
        setCacheLookupsEnabled(event.target.checked);
        render();
        if (event.target.checked) syncStale(false);
        return;
      }
      if (event.target.matches?.('[data-challenge-region]')) {
        setChallengePrefs({ region: event.target.value, skill: 'Defense' });
        render();
        return;
      }
      if (event.target.matches?.('[data-challenge-skill]')) {
        setChallengePrefs({ ...getChallengePrefs(), skill: event.target.value });
        render();
        return;
      }
      const quest = event.target.closest?.('[data-quest]');
      if (quest) {
        let prefs = getPrefs().filter((preference) => preference !== quest.dataset.quest && !preference.endsWith(quest.dataset.quest));
        if (quest.checked && prefs.length < 5) prefs.push(quest.dataset.quest);
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        AppState.ui.lastSignature = '';
        if (prefs.length === 5) {
          const normalized = [...document.querySelectorAll('[data-quest]:checked')].map((input) => input.dataset.quest).slice(0, 5);
          localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
          syncStale(false);
        }
        return;
      }
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-quest-modal]')) { AppState.ui.questModalOpen = true; AppState.ui.lastSignature = ''; render(); return; }
      if (event.target.closest?.('[data-modal-close]') || event.target.matches?.('[data-modal-backdrop]')) { AppState.ui.questModalOpen = false; AppState.ui.lastSignature = ''; render(); return; }
      if (event.target.closest?.('[data-sync]')) { syncStale(true); return; }
      if (event.target.closest?.('[data-open-multiplayer]')) {
        const multiplayer = document.getElementById(MULTIPLAYER_ID);
        (multiplayer?.querySelector('.action') || multiplayer)?.click();
        return;
      }
      const craftAll = event.target.closest?.('[data-craft-all]');
      if (craftAll) {
        NativeControlAdapter.run(document, { type: 'craft', button: craftAll });
        return;
      }
      if (event.target.closest?.('[data-collect-loot]')) { NativeControlAdapter.run(document, { type: 'loot' }); return; }
      const automationClaim = event.target.closest?.('[data-collect-automations]');
      if (automationClaim) {
        event.stopPropagation();
        NativeControlAdapter.run(document, { type: 'automations' });
        return;
      }
      if (event.target.closest?.('[data-collect-attunement]')) { event.stopPropagation(); NativeControlAdapter.run(document, { type: 'attunement' }); return; }
      if (event.target.closest?.('[data-collect-taming]')) { event.stopPropagation(); NativeControlAdapter.run(document, { type: 'taming' }); return; }
      if (event.target.closest?.('[data-run-challenge]')) { event.stopPropagation(); NativeControlAdapter.run(document, { type: 'challenge' }); return; }
      const launch = event.target.closest?.('[data-route]');
      if (!launch || !AppState.ui.page?.contains(launch)) return;
      location.href = launch.dataset.route;
    });
    document.addEventListener('keydown', (event) => {
      if (event.target.closest?.('button')) return;
      const launch = event.target.closest?.('.iw-status-link[data-route]');
      if (!launch || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      launch.click();
    });
    document.addEventListener('click', (event) => {
      if (!AppState.ui.page || AppState.ui.page.hidden || event.target.closest(`#${NAV_ID}`)) return;
      if (event.target.closest('nav-component button')) leaveStats();
    }, true);
  }
