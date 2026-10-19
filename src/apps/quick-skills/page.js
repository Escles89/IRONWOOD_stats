  const SKILLS_PATH = '/skills';
  const SKILLS_PAGE_ID = 'iw-skills-page';
  const SKILLS_NAV_ID = 'iw-skills-nav';
  const portalHistoryRouters = new WeakSet();

  function installPortalHistoryGuard(runtime = quickRuntime()) {
    const router = runtime?.router;
    if (!router || portalHistoryRouters.has(router) || typeof router.navigateToSyncWithBrowser !== 'function') return;
    const navigate = router.navigateToSyncWithBrowser;
    // Angular queues popstate handling before our listener runs. Filter only
    // our virtual pages at that queued entry point; preserve native routing.
    router.navigateToSyncWithBrowser = function(url, source, ...args) {
      if (source === 'popstate' && /^\/(?:skills|status)(?:[?#]|$)/.test(url)) return;
      return navigate.call(this, url, source, ...args);
    };
    portalHistoryRouters.add(router);
  }

  function skillsPageVisible() { return !!AppState.ui.skillsPage && !AppState.ui.skillsPage.hidden; }

  function createSkillsPage() {
    const wrapper = routeWrapper();
    if (!wrapper || document.getElementById(SKILLS_PAGE_ID)) return;
    const page = document.createElement('section');
    page.id = SKILLS_PAGE_ID;
    page.className = 'iw-quick-panel';
    page.hidden = true;
    page.setAttribute('aria-label', 'Skills');
    wrapper.appendChild(page);
    AppState.ui.skillsPage = page;
  }

  function installSkillsNav() {
    const status = AppState.ui.navButton;
    if (!status || document.getElementById(SKILLS_NAV_ID)) return;
    const button = status.cloneNode(true);
    button.id = SKILLS_NAV_ID;
    button.classList.remove('active-link');
    button.setAttribute('aria-label', 'Skills page');
    button.querySelector('.name').textContent = 'Skills';
    const icon = button.querySelector('.iw-nav-skill-icon') || button.querySelector('img');
    if (icon) {
      const tome = document.createElement('img');
      tome.className = 'iw-skills-nav-icon';
      tome.setAttribute('src', '/assets/misc/tome-runic-wisdom.png');
      tome.setAttribute('alt', '');
      icon.replaceWith(tome);
    }
    button.addEventListener('click', () => showSkillsPage());
    status.after(button);
    AppState.ui.skillsNavButton = button;
  }

  function showSkillsPage({ push = true } = {}) {
    installPortalHistoryGuard();
    createSkillsPage();
    if (!AppState.ui.skillsPage) return;
    if (location.pathname !== STATS_PATH && location.pathname !== SKILLS_PATH)
      AppState.ui.previousUrl = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    quickClose();
    hideStats();
    hideStatusRouteElements();
    AppState.ui.skillsPage.hidden = false;
    AppState.ui.skillsNavButton?.classList.add('active-link');
    if (push && location.pathname !== SKILLS_PATH) history.pushState({ iwSkills: true }, '', SKILLS_PATH);
    document.querySelector('app-component > .scroll')?.scrollTo?.(0, 0);
    syncQuickSkills();
  }

  function hideSkillsPage() {
    if (!skillsPageVisible()) return;
    AppState.ui.skillsPage.hidden = true;
    AppState.ui.skillsNavButton?.classList.remove('active-link');
    AppState.ui.hiddenRouteElements.forEach(element => {
      element.style.display = element.dataset.iwStatsDisplay || '';
      delete element.dataset.iwStatsDisplay;
    });
    AppState.ui.hiddenRouteElements = [];
    quickClose();
  }

  function syncSkillsPage(runtime) {
    if (!skillsPageVisible()) return;
    hideStatusRouteElements();
    const ui = AppState.ui.quickSkills, page = AppState.ui.skillsPage;
    const markup = `<section class="iw-card iw-skills-list-panel"><div class="iw-card-header"><span>Skills</span><small>Your last actions, ready when you are.</small></div>${renderQuickSkillList(runtime, { plannerPanel: false })}</section>${renderSkillsPlannerPanel()}`;
    if (page._iwMarkup === markup || ui.interaction?.owner === ui.owner && ui.interaction.until > Date.now()) return;
    const focus = page.contains(document.activeElement) ? document.activeElement?.getAttribute('aria-label') : null;
    page.innerHTML = markup;
    page._iwMarkup = markup;
    if (focus) [...page.querySelectorAll('[aria-label]')].find(control => control.getAttribute('aria-label') === focus && !control.disabled)?.focus({ preventScroll: true });
  }

  async function restoreSkillsOnLoad() {
    const started = Date.now();
    while (!routeWrapper() || !document.querySelector('nav-component')) {
      if (Date.now() - started >= 15000) return;
      await wait(100);
    }
    createPage();
    showSkillsPage({ push: false });
    history.replaceState({ iwSkills: true }, '', SKILLS_PATH);
  }

  function restorePortalRoute() {
    if (location.pathname === SKILLS_PATH) showSkillsPage({ push: false });
    else if (location.pathname === STATS_PATH) showStats({ push: false });
    else { hideSkillsPage(); hideStats(); }
  }
