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

  function automationRemainingTime(item, checkedAt) {
    const remaining = Math.max(0, (item.queuedTotal || 0) - (item.queuedDone || 0));
    if (!remaining) return item.queuedTotal ? 'Complete' : '—';
    if (!(item.intervalMs > 0)) return '—';
    const observedAt = item.checkedAt || checkedAt;
    const partialCycle = observedAt ? Math.max(0, Date.now() - observedAt) % item.intervalMs : 0;
    const hours = Math.ceil(Math.max(0, remaining * item.intervalMs - partialCycle) / 3600000);
    return `~${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
