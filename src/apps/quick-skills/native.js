  function quickRunningTarget(runtime) {
    const action = runtime?.state.user?.action, metadata = runtime?.actionCatalog?.[action?.actionId];
    return quickId(action?.skillId) && quickId(action?.actionId) && metadata?.name
      ? { skillId: action.skillId, actionId: action.actionId, name: metadata.name, finite: quickFiniteAction(action.skillId, metadata, runtime) } : null;
  }

  function quickRemainingAmount(runtime, target) {
    const metadata = runtime.actionCatalog[target.actionId];
    const output = metadata?.drops?.[0]?.id;
    if (!output || !runtime.action?.actionLoot) return null;
    const completed = runtime.action.actionLoot[output]?.amount || 0;
    return runtime.state.user.action?.amount - completed;
  }

  async function quickNativeReady(doc, frameWindow, target, planned = false) {
    let runtime;
    const started = Date.now();
    while (Date.now() - started < 10000) {
      runtime = quickRuntime(frameWindow);
      if (quickOwner(runtime) && runtime.actionCatalog?.[target.actionId] && !runtime.action.actionLoading
        && doc.querySelector('skill-page button.action-start, skill-page button.action-stop, skill-page button.action-invalid')) break;
      await wait(100);
    }
    if (!quickOwner(runtime) || !runtime.actionCatalog?.[target.actionId]) throw new Error('Native action metadata is unavailable. Open the skill page.');
    if ((planned ? runtime.router?.url : frameWindow.location.pathname) !== `/skill/${target.skillId}/action/${target.actionId}`) throw new Error('Ironwood redirected this action. Open the skill page to check access.');
    const metadata = runtime.actionCatalog[target.actionId];
    if (quickFiniteAction(target.skillId, metadata, runtime) !== target.finite) throw new Error('This action changed. Run it from its native page first.');
    const buttons = () => [...doc.querySelectorAll('skill-page button.action-start')];
    const limit = () => {
      if (!target.finite) return null;
      if (typeof runtime.craftLimit !== 'function') throw new Error('Native material requirements are unavailable. Open the skill page.');
      const available = runtime.craftLimit(runtime.state.user, metadata);
      if (!Number.isFinite(available) || available < 0) throw new Error('Native material limit is unavailable.');
      return Math.min(Math.floor(available), metadata.uniqueCraft ? 1 : 1000000);
    };
    const page = planned ? plannedNativePage(runtime) : null;
    const invocation = planned ? plannedNativeInvocation(runtime, page) : null;
    return { runtime: invocation?.runtime || runtime, limit, click: control => invocation ? invocation.click(control) : control.click(),
      guardCollection: guard => invocation?.guardCollection(guard),
      collect: () => invocation?.collect(),
      eligibilityReason() {
        if (planned) {
          if (page.skillId !== target.skillId || page.actionId !== target.actionId) return 'Native action selection changed. Refresh to check.';
          if (plannedNativeValue(page.canStart$) !== true || plannedNativeValue(page.uniqueCraftable$) !== true)
            return 'Native requirements are not met. Check level, materials, equipment and access on the native page.';
          if (quickSameAction(runtime.state.user.action, target) && plannedCurrentState(runtime).kind === 'completed') return '';
        }
        const invalid = [...doc.querySelectorAll('skill-page button.action-invalid')].map(button => clean(button.textContent)).filter(Boolean);
        if (invalid.length) return invalid.join('. ');
        const controls = buttons();
        if (controls.some(button => !button.disabled)) return '';
        return controls.length ? 'Native requirements are not met. Check level, materials, equipment and access on the native page.' : 'Native eligibility is unavailable. Refresh to check.';
      },
      quantityInfo(amount) {
        const user = runtime.state.user, output = metadata.drops?.[0]?.id;
        const owned = output && user.inventory ? user.inventory[output]?.amount || 0 : null;
        let time = '—';
        try {
          const stardust = [...doc.querySelectorAll('skill-page button.row')].find(row => /Stardust/.test(row.textContent));
          const coinCraft = /Coins/.test(stardust?.querySelector('.use')?.textContent || '');
          const duration = runtime.craftTime?.call({ user }, user, runtime.skillCatalog[target.skillId], metadata, amount || 1, coinCraft);
          if (duration) time = [['years', 'y'], ['months', 'mo'], ['days', 'd'], ['hours', 'h'], ['minutes', 'm'], ['seconds', 's']]
            .filter(([key]) => duration[key] > 0).map(([key, suffix]) => `${duration[key]}${suffix}`).join(' ') || '0s';
        } catch {}
        return { owned, time };
      },
      stopButton: () => [...doc.querySelectorAll('skill-page button.action-stop')].find(button => /Stop\s*&\s*Loot/i.test(clean(button.textContent))),
      async startControl(amount) {
        if (planned && quickSameAction(runtime.state.user.action, target) && target.finite) {
          if (this.eligibilityReason()) return null;
          runtime.zone.run(() => page.openAmountModal(metadata));
        }
        const start = Date.now();
        while (Date.now() - start < 5000) {
          const controls = buttons();
          if (target.finite && !metadata.uniqueCraft) {
            let input = doc.querySelector('skill-page modal-component input[name="quantity"]');
            if (!input) {
              const amountButton = controls.find(button => clean(button.textContent) === 'Amount');
              if (amountButton?.disabled) return null;
              if (amountButton) invocation ? invocation.click(amountButton) : amountButton.click();
              await wait(50);
              input = doc.querySelector('skill-page modal-component input[name="quantity"]');
            }
            if (input) {
              const setter = Object.getOwnPropertyDescriptor(frameWindow.HTMLInputElement.prototype, 'value')?.set;
              if (setter) setter.call(input, String(amount)); else input.value = String(amount);
              input.dispatchEvent(new frameWindow.Event('input', { bubbles: true }));
              input.dispatchEvent(new frameWindow.Event('change', { bubbles: true }));
              await wait(50);
              return [...doc.querySelectorAll('skill-page modal-component form.actions > .buttons > button')]
                .find(button => clean(button.textContent) === 'Craft' && !button.matches('[data-craft-all]'));
            }
          } else {
            const control = controls.find(button => /^(Gather|Mine|Craft One|Craft|Smelt|Smith|Enchant|Farm|Brew|Fish|Cook|Delve|Imbue|Explore|Fight|Start)$/i.test(clean(button.textContent)));
            if (control) return control;
          }
          await wait(100);
        }
        return null;
      }
    };
  }

  // Wrap the game's existing call and subscription, without sending a request.
  // A revoked start guard remains only in the disposable frame: a late stop
  // response must not start anything after a timeout or character change.
  function quickObserveRequests(runtime, target, assertOwner, beforeStart = null, beforeStop = null) {
    const original = runtime.firebase.startAction;
    if (typeof original !== 'function') throw new Error('Native start confirmation is unavailable.');
    let active = true, started = false, settled = false, error = '', invoked = false;
    // Native handlers catch observable errors, but not rejected Firebase
    // promises. Deliver guard refusals through their normal error channel so
    // they release loading state without requesting a mutation.
    const rejected = failure => ({ subscribe(observer) { observer.error(failure); return { unsubscribe() {} }; } });
    async function observed(...args) {
      try {
        if (!active || invoked) throw new Error('This action request has expired.');
        assertOwner();
        if (args[0] !== target.skillId || args[1] !== target.actionId) throw new Error('The native start target changed.');
        if (beforeStart) await beforeStart(args);
        if (!active || invoked) throw new Error('This action request has expired.');
        invoked = true;
        const response = await original.apply(this, args);
        const Observable = response?.constructor;
        if (typeof Observable?.prototype?.subscribe !== 'function') throw new Error('Native start returned an unsupported response.');
        return new Observable(subscriber => response.subscribe({
          next(value) {
            settled = true;
            if (active) {
              try {
                assertOwner();
                started = !value?.error && quickSameAction(value?.action, target);
                if (!started) error = 'Ironwood did not confirm the requested skill and action.';
              } catch (failure) { error = failure.message; }
            }
            subscriber.next(value);
          },
          error(failure) { settled = true; error = failure?.message || 'Ironwood rejected the action.'; subscriber.error(failure); },
          complete() { settled = true; if (!started && !error) error = 'Ironwood returned no action confirmation.'; subscriber.complete(); }
        }));
      } catch (failure) { settled = true; error = failure.message; if (beforeStart) return rejected(failure); throw failure; }
    }
    const originalStop = runtime.firebase.stopAction;
    let stopInvoked = false;
    const guardedStop = async function(...args) {
      try {
        if (!active || stopInvoked || !beforeStop) throw new Error('Current work appeared. The planned action will not stop or collect it.');
        stopInvoked = true;
        await beforeStop(args);
        if (!active) throw new Error('This action request has expired.');
        return await originalStop.apply(this, args);
      } catch (failure) { error = failure.message; return rejected(failure); }
    };
    if (beforeStart) runtime.firebase.stopAction = guardedStop;
    runtime.firebase.startAction = observed;
    return { started: () => started, error: () => error, refuse(failure) { error = failure.message; }, restore() {
      active = false;
      // Planned guards stay revoked in this disposable frame, including for
      // handlers resuming after a collection timeout.
      if (!beforeStart && settled && runtime.firebase.startAction === observed) runtime.firebase.startAction = original;
    } };
  }

  async function quickWaitUntil(predicate, observation, timeout) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (observation.error()) throw new Error(observation.error());
      if (predicate()) return;
      await wait(100);
    }
    throw new Error('Ironwood did not confirm the action in time. Check the current action before trying again.');
  }
