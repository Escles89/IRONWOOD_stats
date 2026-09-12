  function projectedAutomation(item, checkedAt) {
    checkedAt = item?.checkedAt || checkedAt;
    if (!item?.intervalMs || !checkedAt || item.queuedDone >= item.queuedTotal) return item;
    const elapsedActions = Math.floor(Math.max(0, Date.now() - checkedAt) / item.intervalMs);
    const remainingQueue = Math.max(0, item.queuedTotal - item.queuedDone);
    const additional = Math.min(remainingQueue, elapsedActions);
    return {
      ...item,
      queuedDone: item.queuedDone + additional,
      lootAmount: Math.round(item.lootAmount + additional * (item.outputPerAction || 0))
    };
  }
  function automationSnapshot(structures) {
    const now = Date.now();
    const oldestExpiry = Math.min(now + TTL.automations, ...structures.map((item) => item.checkedAt + TTL.automations));
    const checkedAt = Math.min(now, ...structures.map((item) => item.checkedAt));
    // Queue completion is projected locally from the fixed interval. Do not
    // expire the cache at the predicted queue end and trigger a hidden lookup.
    return { schema: 4, checkedAt, structures, expiresAt: oldestExpiry };
  }

  function automationRemainingMs(item, checkedAt) {
    if (!(item.queuedTotal > 0)) return null;
    const remaining = Math.max(0, item.queuedTotal - (item.queuedDone || 0));
    if (!remaining) return 0;
    if (!(item.intervalMs > 0)) return null;
    const observedAt = item.checkedAt || checkedAt;
    const partialCycle = observedAt ? Math.max(0, Date.now() - observedAt) % item.intervalMs : 0;
    return Math.max(0, remaining * item.intervalMs - partialCycle);
  }

  function automationRemainingTime(item, checkedAt) {
    const remaining = automationRemainingMs(item, checkedAt);
    if (remaining === null) return '—';
    if (remaining === 0) return 'Complete';
    const hours = Math.ceil(remaining / 3600000);
    return `~${Math.floor(hours / 24)}d ${hours % 24}h`;
  }

  function automationQueueWarning(item, checkedAt, prefs = getWarningPrefs()) {
    const remaining = automationRemainingMs(item, checkedAt);
    if (remaining === null) return '';
    if (prefs.automationUrgentHours > 0 && remaining < prefs.automationUrgentHours * 3600000) return 'urgent';
    if (prefs.automationHours > 0 && remaining < prefs.automationHours * 3600000) return 'warning';
    return '';
  }

  function automationQueueDescription(item, checkedAt) {
    const state = automationQueueWarning(item, checkedAt);
    return `${formatNumber(item.queuedDone || 0)} / ${formatNumber(item.queuedTotal || 0)} · ${automationRemainingTime(item, checkedAt)}${state === 'urgent' ? ' · Queue needs refilling' : state === 'warning' ? ' · Queue running low' : ''}`;
  }

  function automationQueuePercent(item) {
    return item.queuedTotal > 0 ? Math.max(0, Math.min(100, (item.queuedDone || 0) / item.queuedTotal * 100)) : 0;
  }
