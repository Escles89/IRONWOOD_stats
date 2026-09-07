  function initialise() {
    if (location.pathname === LEGACY_STATS_PATH) history.replaceState({ iwStatus: true }, '', STATS_PATH);
    addStyles();
    createPage();
    installNavButton();
    installInterfaceControls();
    installEventDelegation();
    checkScriptUpdate();
    window.addEventListener('popstate', () => location.pathname === STATS_PATH ? showStats({ push: false }) : hideStats());
    new MutationObserver((records) => {
      // Dashboard updates are output, not new native data to capture.
      if (records.every(record => AppState.ui.page?.contains(record.target))) return;
      installNavButton(); installInterfaceControls(); createPage(); captureVisibleCaches();
      installUpdateIndicator();
      syncHeaderActionBadges();
    })
      .observe(document.body, { childList: true, subtree: true });
    if (location.pathname === STATS_PATH) showStatusFromCurrentAction();
    setTimeout(captureVisibleCaches, 1500);
    AppState.ui.startupSyncAt = Date.now() + 2500;
    setTimeout(() => { AppState.ui.startupSyncAt = null; syncStale(false); }, 2500);
    document.addEventListener('visibilitychange', handleStatusVisibility);
    window.setInterval(scheduleStatusRender, 250);
    window.setInterval(checkScriptUpdate, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
