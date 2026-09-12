  const WARNING_PREFS_KEY = 'iw-stats-warning-prefs';
  const WARNING_DEFAULTS = Object.freeze({
    queueMinutes: 60, queueUrgentMinutes: 10,
    automationHours: 24, automationUrgentHours: 1,
    materials: 1000, materialsUrgent: 500,
    tribute: 10000
  });

  function normalizeWarningPrefs(saved) {
    const result = {};
    for (const [key, fallback] of Object.entries(WARNING_DEFAULTS)) {
      const value = saved?.[key];
      result[key] = Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : fallback;
    }
    result.queueUrgentMinutes = Math.min(result.queueUrgentMinutes, result.queueMinutes);
    result.automationUrgentHours = Math.min(result.automationUrgentHours, result.automationHours);
    result.materialsUrgent = Math.min(result.materialsUrgent, result.materials);
    return result;
  }

  function getWarningPrefs() {
    try { return normalizeWarningPrefs(JSON.parse(localStorage.getItem(WARNING_PREFS_KEY) || '{}')); }
    catch { return { ...WARNING_DEFAULTS }; }
  }

  function setWarningPrefs(changes) {
    const next = normalizeWarningPrefs({ ...getWarningPrefs(), ...changes });
    localStorage.setItem(WARNING_PREFS_KEY, JSON.stringify(next));
    AppState.ui.lastSignature = '';
    return next;
  }

  function queueWarningState(milliseconds, crafting, prefs = getWarningPrefs()) {
    if (!(milliseconds > 0)) return '';
    if (prefs.queueUrgentMinutes > 0 && milliseconds < prefs.queueUrgentMinutes * 60000) return 'urgent';
    if (prefs.queueMinutes > 0 && milliseconds < prefs.queueMinutes * 60000) return 'warning';
    return crafting ? 'sufficient' : '';
  }

  function lowMaterialWarning(materials, prefs = getWarningPrefs()) {
    const low = materials.filter(item => Number.isFinite(item.available) && item.available >= 0 && item.available < prefs.materials)
      .sort((a, b) => a.available - b.available);
    return {
      state: low.length ? (low[0].available < prefs.materialsUrgent ? 'urgent' : 'warning') : '',
      text: low.length ? `Material${low.length > 1 ? 's' : ''} low: ${low.map(item => `${item.name} ${formatNumber(item.available)}`).join(', ')}` : ''
    };
  }

  function statusResourceWarnings(cache, prefs = getWarningPrefs()) {
    const low = (amount, threshold) => Number.isFinite(amount) && amount >= 0 && threshold > 0 && amount < threshold;
    const rp = cache.adventure?.researchPoints;
    const mapCost = cache.adventure?.mapCost;
    const cycleCost = Number.isFinite(mapCost) && mapCost >= 0 ? mapCost * 9 + 16000 : null;
    const rpState = low(rp, 16000) ? 'urgent' : cycleCost !== null && low(rp, cycleCost) ? 'warning' : '';
    const tributes = ['Forest', 'Mountain', 'Ocean'].filter(region => low(cache.attunement?.tributes?.[region], prefs.tribute));
    return {
      rp: rpState ? `Low RP: ${formatNumber(rp)} · ${rpState === 'urgent' ? '16,000 RP needed to start an adventure' : `${formatNumber(cycleCost)} RP needed for nine maps and an adventure`}` : '',
      rpState,
      tributes: tributes.length ? `Low Tribute: ${tributes.map(region => `${region} ${formatNumber(cache.attunement.tributes[region])}`).join(' · ')} (below ${formatNumber(prefs.tribute)})` : ''
    };
  }

  function renderResourceWarning(message, state = '') {
    return message ? `<span class="iw-task-icon waiting${state ? ` iw-rp-alert ${state}` : ''}" role="img" title="${escapeHtml(message)}" aria-label="${escapeHtml(message)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg></span>` : '';
  }

  function readTributeBalance(text) {
    const current = String(text || '').split('/')[0].replace(/\s+/g, '');
    return /^[\d,.]+[KMB]?$/i.test(current) ? parseCompact(current) : null;
  }

  function resourceAmount(value) { return Number.isFinite(value) ? formatNumber(value) : 'unknown'; }
  function renderStatusResourceLine(text, warning = false) {
    return `<small class="iw-resource-line${warning ? ' iw-resource-warning-text' : ''}">${escapeHtml(text)}</small>`;
  }

  // The native sidebar shortcut remains mounted across routes. Retain only
  // matching action observations, and project a known queue deadline locally.
  function readHeaderActionSummary() {
    const shortcut = document.querySelector('nav-component action-component button.button, nav-component combat-component button.button');
    if (!shortcut) { AppState.ui.headerActionSnapshot = null; return null; }
    const name = clean(shortcut.querySelector('.details > .name')?.textContent);
    const skillName = clean(shortcut.querySelector('.details > .skill')?.textContent);
    const key = `${skillName}:${name}`;
    let snapshot = AppState.ui.headerActionSnapshot;
    if (!snapshot || snapshot.key !== key) snapshot = { key, materials: [], queueEndsAt: 0 };
    if (document.querySelector('skill-page action-component > .card > .bars .fill, skill-page combat-component .interface.monster')) {
      const queue = readFiniteQueue();
      snapshot.queueEndsAt = queue ? Date.now() + durationMs(queue.time) : 0;
      snapshot.materials = readMaterials();
    }
    AppState.ui.headerActionSnapshot = snapshot;
    const revive = parseReviveRemaining(clean(shortcut.textContent));
    const remaining = Math.max(0, snapshot.queueEndsAt - Date.now());
    const material = lowMaterialWarning(snapshot.materials);
    const queueState = queueWarningState(remaining, false);
    return { action: { name, skillName, reviveRemainingMs: revive },
      materialWarning: material.state, materialWarningText: `${material.text}${material.text ? ' (last observed)' : ''}`,
      queueWarning: queueState, finiteQueue: { time: formatDuration(remaining / 1000) } };
  }

  function renderImportantActionBadges(summary) {
    if (!summary) return '<span class="iw-action-badges"><span class="iw-active-badge iw-stopped-badge" role="img" title="No action in progress" aria-label="No action in progress"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"></path></svg></span></span>';
    return renderActionBadges({ ...summary, importantOnly: true, cache: {}, locationBadges: '' });
  }
