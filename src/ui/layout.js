  const routeWrapper = () => document.querySelector('app-component > .scroll > .padding > .wrapper');

  function installHeaderTools() {
    const header = document.querySelector('header-component > .header');
    if (!header) return;
    if (document.querySelector('#iw-header-tools')) { syncHeaderToolbar(header); return; }
    const host = document.createElement('span');
    host.id = 'iw-header-tools';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Ironwood Status');
    host.innerHTML = `<button type="button" data-guide-modal aria-label="Ironwood Status guide" title="Ironwood Status guide"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"></path></svg></button><button type="button" data-quest-modal aria-label="Dashboard options" title="Dashboard options"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"></path><circle cx="11" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="8" cy="18" r="2"></circle></svg></button>`;
    const coins = header.querySelector('.coins');
    if (coins) coins.after(host);
    else header.appendChild(host);
    syncHeaderToolbar(header);
  }

  function syncHeaderToolbar(header) {
    const coins = header.querySelector('.coins');
    const tools = header.querySelector('#iw-header-tools');
    if (!coins || !tools) return;
    let bar = header.querySelector('#iw-header-bar');
    if (!bar) {
      bar = document.createElement('span');
      bar.id = 'iw-header-bar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Activity, gold and dashboard controls');
      coins.before(bar);
    }
    // Move the native gold button itself so its game click handler stays attached.
    if (coins.parentElement !== bar) bar.appendChild(coins);
    if (tools.parentElement !== bar) bar.appendChild(tools);
    const badges = header.querySelector('#iw-header-action-badges');
    if (badges && coins.previousElementSibling !== badges) coins.before(badges);
  }

  function syncHeaderActionBadges() {
    const existing = document.querySelector('#iw-header-action-badges');
    const summary = readHeaderActionSummary();
    if (!AppState.ui.page?.hidden && AppState.ui.page) {
      existing?.remove();
      return;
    }
    const coins = document.querySelector('header-component .header .coins');
    if (!coins) return;
    const host = existing || document.createElement('span');
    if (!existing) { host.id = 'iw-header-action-badges'; host.setAttribute('aria-label', 'Current action indicators'); }
    const markup = renderImportantActionBadges(summary);
    if (host._iwBadgeMarkup !== markup) {
      const template = document.createElement('template');
      template.innerHTML = markup;
      if (host.firstElementChild) patchStatusSection(host.firstElementChild, template.content.firstElementChild);
      else host.appendChild(template.content.firstElementChild);
      host._iwBadgeMarkup = markup;
    }
    if (coins.previousElementSibling !== host) coins.before(host);
  }

  function renderCacheRefreshButton() {
    const busy = Boolean(AppState.ui.syncing);
    const label = busy ? 'Refreshing cached data' : 'Refresh all cached data';
    return `<button type="button" id="iw-cache-refresh" data-refresh-all-caches class="${busy ? 'iw-refreshing' : ''}" aria-label="${label}" title="${label}" aria-busy="${busy}" ${busy ? 'disabled' : ''}>${renderActionSpinner()}</button>`;
  }

  function syncCacheRefreshButton() {
    const button = document.querySelector('#iw-cache-refresh');
    if (!button) return;
    const busy = Boolean(AppState.ui.syncing);
    button.disabled = busy;
    button.classList.toggle('iw-refreshing', busy);
    button.setAttribute('aria-busy', String(busy));
    button.setAttribute('aria-label', busy ? 'Refreshing cached data' : 'Refresh all cached data');
    button.title = busy ? 'Refreshing cached data…' : 'Refresh all cached data';
  }

  function setStatusHeader(active) {
    const header = document.querySelector('header-component > .header');
    const title = header?.querySelector('.title');
    const image = header?.querySelector('.image img');
    if (!header || !title) return;
    if (active) {
      if (!AppState.ui.headerSnapshot) AppState.ui.headerSnapshot = { title: clean(title.textContent), image: image?.getAttribute('src') || '' };
      title.textContent = 'Status';
      title.classList.add('iw-status-heading');
      // Pancake/native header updates replace textContent; keep the subtitle outside that text.
      title.dataset.iwVersion = statusVersionLabel();
      if (image) image.setAttribute('src', '/assets/icon.png');
    } else if (AppState.ui.headerSnapshot) {
      title.classList.remove('iw-status-heading');
      delete title.dataset.iwVersion;
      title.textContent = AppState.ui.headerSnapshot.title;
      if (image && AppState.ui.headerSnapshot.image) image.setAttribute('src', AppState.ui.headerSnapshot.image);
      AppState.ui.headerSnapshot = null;
    }
  }

  function showStats({ push = true } = {}) {
    captureVisibleCaches();
    const wrapper = routeWrapper();
    if (!wrapper || !AppState.ui.page) return;
    if (location.pathname !== STATS_PATH) AppState.ui.previousUrl = `${location.pathname}${location.search}${location.hash}`;
    AppState.ui.hiddenRouteElements = [...wrapper.children].filter((element) => element !== AppState.ui.page && element.tagName !== 'ROUTER-OUTLET');
    AppState.ui.hiddenRouteElements.forEach((element) => {
      element.dataset.iwStatsDisplay = element.style.display;
      element.style.display = 'none';
    });
    AppState.ui.page.hidden = false;
    AppState.ui.navButton?.classList.add('active-link');
    setStatusHeader(true);
    if (push && location.pathname !== STATS_PATH) history.pushState({ iwStats: true }, '', STATS_PATH);
    document.querySelector('app-component > .scroll')?.scrollTo?.(0, 0);
    AppState.ui.lastSignature = '';
    render();
    refreshAdventureSnapshot();
    refreshChallengesSnapshot();
    refreshTamingSnapshot();
    refreshAutomationsSnapshot();
    refreshGuildEventSnapshot();
    refreshGuildTrialSnapshot();
  }

  function shouldRestoreStatusOnLoad() {
    return location.pathname === STATS_PATH || location.pathname === LEGACY_STATS_PATH
      || globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload';
  }

  async function restoreStatusOnLoad() {
    const started = Date.now();
    // The userscript can start before Angular has mounted the game shell.
    while (!routeWrapper() || !document.querySelector('nav-component')) {
      if (Date.now() - started >= 15000) return;
      await wait(100);
    }
    createPage();
    await showStatusFromCurrentAction();
  }

  async function showStatusFromCurrentAction() {
    const shortcut = document.querySelector('nav-component action-component button.button, nav-component combat-component button.button');
    if (shortcut) {
      shortcut.click();
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (document.querySelector('skill-page action-component > .card .bars .fill, skill-page combat-component .interface.monster, skill-page combat-component > .card')) break;
        await wait(100);
      }
    }
    await primeNativeEstimates();
    showStats({ push: true });
  }

  async function recoverStatusActionView() {
    if (location.pathname !== STATS_PATH || AppState.ui.recoveringActionView || AppState.ui.collectingLoot || AppState.ui.collectingTaming
      || !AppState.live.actionRebuildStartedAt || Date.now() - AppState.live.actionRebuildStartedAt < 1500
      || Date.now() - (AppState.ui.lastActionViewRecovery || 0) < 10000) return;
    const shortcut = document.querySelector('nav-component action-component button.button, nav-component combat-component button.button');
    if (!shortcut) return;
    AppState.ui.recoveringActionView = true;
    AppState.ui.lastActionViewRecovery = Date.now();
    try {
      const route = AppState.ui.previousUrl.split(/[?#]/)[0];
      shortcut.click();
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (location.pathname !== route && location.pathname !== STATS_PATH) return; // Respect navigation during recovery.
        if (document.querySelector('skill-page action-component > .card .bars .fill, skill-page combat-component .interface.monster, skill-page combat-component > .card')) break;
        await wait(100);
      }
      if (location.pathname !== route && location.pathname !== STATS_PATH) return;
      showStats({ push: false });
      history.replaceState({ iwStats: true }, '', STATS_PATH);
    } catch (error) { console.error('[Ironwood Status] Action view recovery failed', error); }
    finally { AppState.ui.recoveringActionView = false; }
  }

  function hideStats() {
    if (!AppState.ui.page || AppState.ui.page.hidden) return;
    AppState.ui.page.hidden = true;
    syncHeaderActionBadges();
    setStatusHeader(false);
    AppState.ui.navButton?.classList.remove('active-link');
    AppState.ui.hiddenRouteElements.forEach((element) => {
      element.style.display = element.dataset.iwStatsDisplay || '';
      delete element.dataset.iwStatsDisplay;
    });
    AppState.ui.hiddenRouteElements = [];
  }

  function leaveStats() {
    hideStats();
    if (location.pathname === STATS_PATH) history.replaceState(null, '', AppState.ui.previousUrl || '/');
  }

  function installNavButton() {
    if (document.getElementById(NAV_ID)) {
      AppState.ui.navButton = document.getElementById(NAV_ID);
      return;
    }
    const inventory = [...document.querySelectorAll('nav-component .scroll > button')]
      .find((button) => clean(button.textContent) === 'Inventory');
    if (!inventory) return;
    AppState.ui.navButton = inventory.cloneNode(true);
    AppState.ui.navButton.id = NAV_ID;
    AppState.ui.navButton.removeAttribute('routerlink');
    AppState.ui.navButton.removeAttribute('routerlinkactive');
    AppState.ui.navButton.classList.remove('active-link');
    AppState.ui.navButton.querySelector('img')?.setAttribute('src', '/assets/icon.png');
    const name = AppState.ui.navButton.querySelector('.name');
    if (name) { name.textContent = 'Status'; name.removeAttribute('style'); }
    AppState.ui.navButton.addEventListener('click', () => showStatusFromCurrentAction());
    inventory.before(AppState.ui.navButton);
  }

  function createPage() {
    const wrapper = routeWrapper();
    if (!wrapper || document.getElementById(PAGE_ID)) return;
    AppState.ui.page = document.createElement('iw-stats-page');
    AppState.ui.page.id = PAGE_ID;
    AppState.ui.page.hidden = true;
    wrapper.appendChild(AppState.ui.page);
  }
