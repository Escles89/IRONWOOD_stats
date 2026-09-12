  const restoreStatusAtStartup = shouldRestoreStatusOnLoad();
  function initialise() {
    installNativeQuantityPrecision();
    if (location.pathname === LEGACY_STATS_PATH) history.replaceState({ iwStatus: true }, '', STATS_PATH);
    addStyles();
    createPage();
    installNavButton();
    installHeaderTools();
    installInterfaceControls();
    installEventDelegation();
    checkScriptUpdate();
    window.addEventListener('popstate', () => location.pathname === STATS_PATH ? showStats({ push: false }) : hideStats());
    new MutationObserver((records) => {
      // Dashboard updates are output, not new native data to capture.
      if (records.every(record => AppState.ui.page?.contains(record.target) || document.querySelector('#iw-global-dialogs')?.contains(record.target) || document.querySelector('#iw-action-toasts')?.contains(record.target))) return;
      installNativeQuantityPrecision();
      installNavButton(); installInterfaceControls(); createPage(); captureVisibleCaches();
      installUpdateIndicator();
      installHeaderTools();
      syncHeaderActionBadges();
    })
      .observe(document.body, { childList: true, subtree: true });
    if (restoreStatusAtStartup) restoreStatusOnLoad();
    setTimeout(captureVisibleCaches, 1500);
    AppState.ui.startupSyncAt = Date.now() + 2500;
    setTimeout(() => { AppState.ui.startupSyncAt = null; syncStale(false); }, 2500);
    document.addEventListener('visibilitychange', handleStatusVisibility);
    window.setInterval(scheduleStatusRender, 250);
    window.setInterval(checkScriptUpdate, 60000);
    window.setInterval(checkDailyAutomations, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
