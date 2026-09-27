  function discoverPlannedSkillLevel(Page, modules) {
    if (!Page) return null;
    // Resolve the native effective-level calculation from the SkillPage's own
    // skillLevel$ binding. Never approximate bonus levels with the XP level.
    const source = Function.prototype.toString.call(Page);
    const binding = source.match(/this\.skillLevel\$=([\s\S]*?),this\.canFight\$/)?.[1];
    const calls = [...(binding || '').matchAll(/\(0,[\w$]+\.([\w$]+)\)/g)];
    const exportName = calls.at(-1)?.[1];
    const candidates = modules.map(module => module[exportName]).filter(value => typeof value === 'function'
      && /\.skills\[[^\]]+\]\.exp/.test(Function.prototype.toString.call(value)));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function plannedNativePage(runtime) {
    let context = runtime.outletContexts?.getContext('primary');
    for (let depth = 0; context && depth < 8; depth++, context = context.children?.getContext('primary')) {
      const component = context.outlet?.component;
      if (typeof component?.handleStartAction === 'function' && typeof component.openAmountModal === 'function') return component;
    }
    return null;
  }

  function plannedNativeValue(observable) {
    let value;
    const subscription = observable?.subscribe?.(next => { value = next; });
    subscription?.unsubscribe();
    return value;
  }

  async function withPlannedPage(path, selector, task) {
    const runtime = quickRuntime(), owner = quickOwner(runtime), previous = runtime?.router?.url, visiblePath = location.pathname;
    if (!runtime?.router?.navigateByUrl) throw new Error('Open Status before starting the plan.');
    try {
      const opened = await runtime.zone.run(() => runtime.router.navigateByUrl(path, { skipLocationChange: true }));
      quickAssertOwner(owner, runtime);
      if (opened === false || location.pathname !== visiblePath) throw new Error('The native page changed. Plan kept.');
      if (visiblePath === STATS_PATH) hideStatusRouteElements();
      await waitFor(document, selector);
      if (runtime.router.url !== path) throw new Error('Ironwood redirected this action. Open its native page to check access.');
      return await task(document, globalThis);
    } finally {
      // The existing native app is reused: no new ActionService can bootstrap
      // and collect work while we are only inspecting requirements.
      if (location.pathname === visiblePath && quickOwner(runtime) === owner && previous && runtime.router.url === path) {
        await runtime.zone.run(() => runtime.router.navigateByUrl(previous, { skipLocationChange: true }));
        if (visiblePath === STATS_PATH) hideStatusRouteElements();
      }
    }
  }

  function plannedNativeInvocation(runtime, page) {
    if (!page) throw new Error('Native action controls are unavailable. Refresh to check.');
    // Keep guards private to this one native handler invocation. Its captured
    // proxies stay revoked after timeout without changing the live services or
    // allowing a late native continuation to escape through restored methods.
    const firebase = Object.create(runtime.firebase);
    let beforeCollection = () => { throw new Error('Collection has not been authorized for this attempt.'); };
    const action = new Proxy(runtime.action, {
      get(target, key, receiver) {
        if (key === 'firebaseSvc') return firebase;
        if (key === 'handleStopAction') return (...args) => {
          // A false native stop outcome lets SkillPage release its own loading
          // state without ever touching the action's loop or loading flag.
          if (!beforeCollection()) return Promise.resolve(false);
          return target.handleStopAction.apply(receiver, args);
        };
        return Reflect.get(target, key, receiver);
      },
      set(target, key, value) { return Reflect.set(target, key, value); }
    });
    const context = new Proxy(page, {
      get(target, key, receiver) { return key === 'firebaseSvc' ? firebase : key === 'actionSvc' ? action : Reflect.get(target, key, receiver); },
      set(target, key, value) { return Reflect.set(target, key, value); }
    });
    return { runtime: { ...runtime, firebase }, collect: () => runtime.zone.run(() => action.handleStopAction()), guardCollection(guard) { beforeCollection = guard; }, click(control) {
      const original = page.handleStartAction;
      page.handleStartAction = function(...args) { return original.apply(context, args); };
      const request = AppState.ui.quickSkills.request;
      if (request) request.nativeDispatch = true;
      try { runtime.zone.run(() => control.click()); }
      finally { page.handleStartAction = original; if (request) request.nativeDispatch = false; }
    } };
  }
