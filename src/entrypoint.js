  function initialise() {
    if (location.pathname === LEGACY_STATS_PATH) history.replaceState({ iwStatus: true }, '', STATS_PATH);
    addStyles();
    createPage();
    installNavButton();
    installInterfaceControls();
    installEventDelegation();
    window.addEventListener('popstate', () => location.pathname === STATS_PATH ? showStats({ push: false }) : hideStats());
    new MutationObserver(() => { installNavButton(); installInterfaceControls(); createPage(); captureVisibleCaches(); })
      .observe(document.body, { childList: true, subtree: true });
    if (location.pathname === STATS_PATH) showStatusFromCurrentAction();
    setTimeout(() => syncStale(false), 1200);
    setTimeout(captureVisibleCaches, 1500);
    window.setInterval(() => StatusRenderer.render(AppState), 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
