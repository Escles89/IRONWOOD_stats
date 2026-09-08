  function patchNativeQuantityPipe(Pipe, name) {
    if (!['layoutNumber', 'shortNumber'].includes(name) || Pipe?.ɵpipe?.name !== name || typeof Pipe.prototype?.transform !== 'function') return false;
    if (Pipe.prototype.transform.iwFullPrecision) return true;
    const original = Pipe.prototype.transform;
    function transform(value, ...args) {
      const fullPrecision = location.pathname === STATS_PATH || location.pathname === '/inventory' || location.pathname.startsWith('/skill/');
      if (fullPrecision && typeof value === 'number' && Number.isFinite(value)) return formatNumber(value);
      return original.call(this, value, ...args);
    }
    transform.iwFullPrecision = true;
    Pipe.prototype.transform = transform;
    return true;
  }

  function installNativeQuantityPrecision() {
    const state = AppState.ui.quantityPrecision;
    if (state.installed || (state.lastAttemptAt !== null && Date.now() - state.lastAttemptAt < 5000)) return;
    state.lastAttemptAt = Date.now();
    // Ironwood's public Angular pipes receive the exact number before rounding.
    // Discover their already-loaded module factories by pipe name, not build IDs.
    // No game data, endpoints, or layout settings are changed.
    const chunks = window.webpackChunkidle_game;
    if (!Array.isArray(chunks)) return;
    const modules = new Map();
    for (const chunk of chunks) {
      for (const [id, factory] of Object.entries(chunk?.[1] || {})) {
        if (typeof factory !== 'function') continue;
        const name = Function.prototype.toString.call(factory).match(/name\s*:\s*["'](layoutNumber|shortNumber)["']/)?.[1];
        if (name) modules.set(id, name);
      }
    }
    if (modules.size < 2) return;
    try {
      const patched = new Set();
      chunks.push([['iw-status-quantity-precision'], {}, requireModule => {
        for (const [id, name] of modules) {
          for (const Pipe of Object.values(requireModule(id))) {
            if (patchNativeQuantityPipe(Pipe, name)) patched.add(name);
          }
        }
      }]);
      state.installed = patched.has('layoutNumber') && patched.has('shortNumber');
    } catch {
      // A changed game build falls back to DOM parsing with internal precision tracking.
    }
  }
