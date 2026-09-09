  let nativeGameSyncPromise = null;
  const nativeSyncRuntimes = new WeakMap();
  let nativeSyncRuntimeSequence = 0;

  function findNativeSyncRuntime(targetWindow = window) {
    const cached = nativeSyncRuntimes.get(targetWindow);
    if (cached) return cached;
    const chunks = targetWindow.webpackChunkidle_game;
    if (!Array.isArray(chunks)) throw new Error('Game synchronization is unavailable in this game build');
    const candidates = new Set();
    for (const chunk of chunks) for (const [id, factory] of Object.entries(chunk?.[1] || {})) {
      if (typeof factory !== 'function') continue;
      const source = Function.prototype.toString.call(factory);
      if (source.includes('.bootstrapModule(')) continue;
      if (['Platform: ', 'syncUser(', 'getUser(', 'handleActionSync(', 'handleAutomationSync(', 'handleExpeditionSync(', 'items/challenge-scroll.png', 'createNotifications('].some(marker => source.includes(marker))) candidates.add(id);
    }
    let runtime;
    chunks.push([[`iw-status-state-sync-${Date.now()}-${++nativeSyncRuntimeSequence}`], {}, requireModule => {
      const exports = [...candidates].flatMap(id => Object.values(requireModule(id)));
      const platformFactory = exports.find(value => typeof value === 'function' && Function.prototype.toString.call(value).includes('Platform: '));
      if (!platformFactory) return;
      // Ask Angular for the existing platform only. The parent factory throws if
      // the game has not bootstrapped; never create a second application/platform.
      const platform = platformFactory(() => { throw new Error('Game is still loading'); }, 'Ironwood Status')();
      const injector = platform?._modules?.find(module => !module.destroyed && module.injector)?.injector;
      if (!injector) return;
      const service = method => {
        const Type = exports.find(value => value?.ɵprov && typeof value.prototype?.[method] === 'function');
        return Type ? injector.get(Type, null) : null;
      };
      const Zone = exports.find(value => typeof value?.prototype?.run === 'function' && typeof value.prototype.runOutsideAngular === 'function');
      runtime = {
        state: service('syncUser'), firebase: service('getUser'), action: service('handleActionSync'),
        automations: service('handleAutomationSync'), expedition: service('handleExpeditionSync'),
        zone: Zone && injector.get(Zone, null),
        notificationComponent: exports.find(value => typeof value?.prototype?.createNotifications === 'function'),
        catalog: exports.find(value => value && typeof value === 'object' && Object.values(value).some(item => item?.image === 'items/challenge-scroll.png'))
      };
    }]);
    if (!runtime?.state || !runtime.firebase || !runtime.action || !runtime.automations || !runtime.expedition || !runtime.zone) {
      throw new Error('Game synchronization is unavailable in this game build');
    }
    nativeSyncRuntimes.set(targetWindow, runtime);
    return runtime;
  }

  function requestNativeUser(firebase, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let finished = false, subscription;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        subscription?.unsubscribe();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Game synchronization timed out')), timeoutMs);
      Promise.resolve().then(() => firebase.getUser()).then(response => {
        if (finished) return;
        if (typeof response?.subscribe !== 'function') { finish(new Error('Game returned an unsupported synchronization response')); return; }
        subscription = response.subscribe({
          next: value => finish(null, value), error: error => finish(error),
          complete: () => finish(new Error('Game synchronization returned no state'))
        });
        if (finished) subscription?.unsubscribe();
      }).catch(error => finish(error));
    });
  }

  function cacheSynchronizedInventory(inventory, catalog) {
    if (!inventory || !catalog || AppState.ui.pendingLootClaim) return false;
    const allItems = [];
    for (const [id, owned] of Object.entries(inventory)) {
      if (!Number.isFinite(owned?.amount) || owned.amount < 0) return false;
      const item = catalog[id];
      if (!item?.image || !item.name) return false;
      if (item.image === 'misc/coin.png' || owned.amount === 0) continue;
      allItems.push({ key: item.image.split('/').pop(), name: item.name, image: `/assets/${item.image}`, amount: owned.amount, amountText: formatNumber(owned.amount), approximate: false });
    }
    const items = allItems.filter(item => /potion-divine-[\w-]+/.test(item.key)).map(item => ({ ...item, slug: item.key.match(/potion-divine-[\w-]+/)[0] }));
    setCache('inventory', { schema: 1, allItems, items, syncedAt: Date.now() });
    return true;
  }

  function synchronizeNativeGame() {
    if (nativeGameSyncPromise) return nativeGameSyncPromise;
    nativeGameSyncPromise = (async () => {
      AppState.ui.nativeSync = { ...AppState.ui.nativeSync, running: true, startedAt: Date.now(), error: '' };
      try {
        const runtime = findNativeSyncRuntime();
        const { state, firebase, action, automations, expedition, zone } = runtime;
        if (!state.user || state.newVersion || state.swappingCharacter) throw new Error('Reload the game before synchronizing');
        const character = state.user.id ?? state.user.name;
        const solo = state.isSolo;
        const response = await zone.run(() => requestNativeUser(firebase));
        // Native async/await can resume outside Angular's zone. Re-enter it for
        // the actual state changes so mounted native pages repaint immediately.
        return zone.run(() => {
          // Ironwood uses date strings for server time (its loops call new Date).
          // Keep the native value when reconciling; validate either supported form.
          const time = response?.time;
          const serverTimestamp = typeof time === 'number' ? time : typeof time === 'string' && time.trim() ? Date.parse(time) : NaN;
          if (!response?.user?.inventory || !Number.isFinite(serverTimestamp)) throw new Error('Game synchronization returned incomplete state');
          if (state.swappingCharacter || state.isSolo !== solo || (state.user.id ?? state.user.name) !== character
            || (response.user.id ?? response.user.name) !== character) throw new Error('Character changed during synchronization');
          // Use the same reconciliation sequence as the native header's checkSync.
          // A fresh server snapshot avoids copying an iframe's stale action history.
          state.syncUser(response.user);
          action.handleActionSync(response.time);
          automations.handleAutomationSync(response.time);
          expedition.handleExpeditionSync(response.time);
          if (!cacheSynchronizedInventory(response.user.inventory, runtime.catalog)) {
            const inventory = getCache().inventory;
            if (inventory) setCache('inventory', { ...inventory, needsReconcile: true });
          }
          AppState.ui.nativeSync.lastSuccessAt = Date.now();
        });
      } catch (error) {
        AppState.ui.nativeSync.error = error.message;
        throw error;
      } finally {
        AppState.ui.nativeSync.running = false;
      }
    })().finally(() => { nativeGameSyncPromise = null; });
    return nativeGameSyncPromise;
  }
