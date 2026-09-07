  function debugEnabled() { return localStorage.getItem(DEBUG_KEY) === 'true'; }

  function debugTime(value) {
    return Number.isFinite(value) ? new Date(value).toLocaleString() : 'Never recorded';
  }

  function debugCacheRows(now = Date.now()) {
    const records = getCache();
    const routes = { quests: '/quests', inventory: '/inventory', equipped: '/equipment', adventure: '/adventure', challenges: '/challenges', taming: '/skill/15', automations: '/house', attunement: '/attunement', mastery: '/mastery', guildEvent: '/guild', guildTrial: '/guild' };
    return [...new Set([...Object.keys(TTL), ...Object.keys(records)])].map(key => {
      const entry = records[key];
      const usable = CacheStore.isUsable(key);
      const active = AppState.ui.pendingActions.has(key) || AppState.ui.lookupActivity.some(item => item.state === 'Running' && routes[key] && item.path.startsWith(routes[key]));
      let next = 'No timed refresh; native navigation or confirmed local changes';
      if (active) next = 'Background page running now';
      else if (!cacheLookupsEnabled()) next = 'Background lookups disabled; native navigation or local changes';
      else if (!usable && AppState.ui.startupSyncAt > now) next = `Startup fallback check at ${debugTime(AppState.ui.startupSyncAt)}`;
      else if (!usable && AppState.ui.syncing) next = 'Current sync pass may request missing data';
      else if (!usable) next = 'Missing/unusable data; fallback on next dashboard/source open or manual refresh';
      const ageLimit = Number.isFinite(TTL[key]) && Number.isFinite(entry?.checkedAt) ? entry.checkedAt + TTL[key] : null;
      return { key, usable, active, checkedAt: entry?.checkedAt, updatedAt: entry?.updatedAt || AppState.ui.cacheWrites[key] || entry?.lootUpdatedAt || entry?.checkedAt,
        ageBoundary: entry?.refreshAt || entry?.expiresAt || ageLimit, next, entry };
    });
  }

  function debugJson(value) {
    return JSON.stringify(value, (_key, item) => item instanceof Map ? Object.fromEntries(item) : item instanceof Set ? [...item] : item, 2);
  }

  function updateDebugPanel(now = Date.now()) {
    const ui = AppState.ui;
    if (!debugEnabled()) { ui.debugPanel?.remove(); ui.debugPanel = null; return; }
    if (!ui.page || ui.page.hidden || document.hidden) return;
    if (ui.debugPanel?.isConnected && now - ui.debugUpdatedAt < 1000) return;
    ui.debugUpdatedAt = now;
    // Keep diagnostics outside the main grid reconciliation and off the animation cadence.
    let panel = ui.debugPanel;
    if (!panel?.isConnected) {
      panel = document.createElement('section');
      panel.className = 'iw-card iw-debug-panel';
      panel.setAttribute('aria-label', 'Debug');
      ui.page.appendChild(panel);
      ui.debugPanel = panel;
    }
    const open = new Set([...panel.querySelectorAll('details[open]')].map(item => item.dataset.debugSection));
    const details = (key, title, value) => `<details data-debug-section="${escapeHtml(key)}" ${open.has(key) ? 'open' : ''}><summary>${title}</summary><pre>${open.has(key) ? escapeHtml(debugJson(value)) : ''}</pre></details>`;
    const rows = debugCacheRows(now);
    const tracked = { action: AppState.live.action, loot: AppState.live.loot, materials: AppState.live.materials,
      consumables: AppState.live.consumables, finiteQueue: AppState.live.finiteQueue, mastery: AppState.live.masteryProgress,
      countdowns: AppState.derived.countdowns, bonuses: AppState.derived.panels,
      potions: AppState.derived.displayedPotions,
      automations: (getCache().automations?.structures || []).map(item => projectedAutomation(item, getCache().automations.checkedAt)) };
    const runtime = { route: location.pathname, syncing: ui.syncing, pendingSources: [...ui.pendingActions.keys()], automationTask: ui.automationTask,
      backgroundLookupsEnabled: cacheLookupsEnabled(), startupFallbackCheckAt: ui.startupSyncAt ? debugTime(ui.startupSyncAt) : 'Already triggered; no repeating cache refresh scheduled',
      versionCheck: { installed: USERSCRIPT_VERSION, public: scriptUpdate.latestVersion, running: Boolean(scriptUpdate.pending),
        next: scriptUpdate.nextCheckAt ? debugTime(scriptUpdate.nextCheckAt) : 'Next visible-page check', polling: 'Every minute while visible; check only when due' },
      backgroundPages: ui.lookupActivity.map(item => ({ ...item, startedAt: debugTime(item.startedAt), finishedAt: item.finishedAt ? debugTime(item.finishedAt) : null })) };
    const html = `<div class="iw-card-header"><span>Debug</span><small>Updated ${escapeHtml(debugTime(now))}</small></div>
      <p class="iw-debug-help">Refreshes once a second while visible. Expand a section to inspect values. Cache age limits are informational; they do not schedule a lookup.</p>
      ${details('live', 'Tracked values · live and calculated', tracked)}
      ${details('runtime', 'Refresh triggers and recent background pages', runtime)}
      <div class="iw-debug-cache-title">Cached sources <small>Last write / snapshot captured / next refresh or trigger</small></div>
      ${rows.map(row => details(`cache:${row.key}`, `<span class="iw-debug-source">${escapeHtml(row.key)} <small>${row.usable ? 'Usable' : 'Missing / unusable'}</small></span><span class="iw-debug-times">Write: ${escapeHtml(debugTime(row.updatedAt))}<br>Snapshot: ${escapeHtml(debugTime(row.checkedAt))}</span><span class="iw-debug-next">${escapeHtml(row.next)}</span>`, {
        ageLimit: row.ageBoundary ? debugTime(row.ageBoundary) : 'None', ageLimitSchedulesLookup: false,
        cached: row.entry ?? null, calculated: projectStatusCache(getCache(), now)[row.key] ?? null
      })).join('')}`;
    const template = document.createElement('template');
    template.innerHTML = `<section class="iw-card iw-debug-panel" aria-label="Debug">${html}</section>`;
    patchStatusSection(panel, template.content.firstElementChild);
  }
