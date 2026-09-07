  const routeWrapper = () => document.querySelector('app-component > .scroll > .padding > .wrapper');

  function syncHeaderActionBadges() {
    const existing = document.querySelector('#iw-header-action-badges');
    if (!headerIconsEnabled() || !AppState.ui.page || AppState.ui.page.hidden || !AppState.ui.headerBadgeMarkup) {
      existing?.remove();
      return;
    }
    const coins = document.querySelector('header-component .header .coins');
    if (!coins) return;
    const host = existing || document.createElement('span');
    if (!existing) { host.id = 'iw-header-action-badges'; host.setAttribute('aria-label', 'Current action indicators'); }
    const markup = AppState.ui.headerBadgeMarkup;
    if (host._iwBadgeMarkup !== markup) {
      const template = document.createElement('template');
      template.innerHTML = markup;
      if (host.firstElementChild) patchStatusSection(host.firstElementChild, template.content.firstElementChild);
      else host.appendChild(template.content.firstElementChild);
      host._iwBadgeMarkup = markup;
    }
    if (coins.previousElementSibling !== host) coins.before(host);
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
