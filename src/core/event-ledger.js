  const EventLedger = {
    record(eventKey, payload, ttl) {
      const now = Date.now();
      for (const [key, event] of AppState.ui.events) {
        if (event.expiresAt <= now) AppState.ui.events.delete(key);
      }
      if (this.isActive(eventKey)) return false;
      AppState.ui.events.set(eventKey, { payload, startedAt: now, expiresAt: now + Math.max(0, ttl) });
      return true;
    },
    isActive(eventKey) {
      const event = AppState.ui.events.get(eventKey);
      if (!event) return false;
      if (event.expiresAt <= Date.now()) { AppState.ui.events.delete(eventKey); return false; }
      return true;
    }
  };
