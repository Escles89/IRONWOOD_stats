  function readTamingEggs(root, previous = {}) {
    const cards = [...(root?.querySelectorAll('.card') || [])];
    const card = name => cards.find(card => clean(card.querySelector(':scope > .header > .name')?.textContent) === name);
    const menu = card('Menu');
    if (!menu) return {};
    const rows = [...menu.querySelectorAll('button.row')];
    const data = {};
    for (const [source, label, panel] of [['hatchery', 'Hatchery', 'Hatchery'], ['ranch', 'Pets', 'Ranch']]) {
      const row = rows.find(row => clean(row.querySelector(':scope > .name')?.textContent) === label);
      // Both ready and non-ready native markers must be recognized; a partially
      // mounted menu must not clear a previously observed ready state.
      const claim = clean(row?.querySelector(':scope > .claim')?.textContent) === 'Claim';
      const amount = clean(row?.querySelector(':scope > .amount')?.textContent);
      if (!claim && !/\d+\s*\/\s*\d+/.test(amount)) continue;
      data[`${source}EggsReady`] = claim;
      const oldDeadline = previous[`${source}EggsReadyAt`];
      data[`${source}EggsReadyAt`] = !claim && oldDeadline > Date.now() ? oldDeadline : null;
      const panelCard = card(panel);
      if (!claim && panelCard) {
        const delays = [...panelCard.querySelectorAll(source === 'ranch' ? '.header .time' : 'button.row .time')]
          .map(element => {
            const text = clean(element.textContent);
            if (!/^(?:\d+\s*[hms]\s*)+$/.test(text)) return null;
            // Native timers omit seconds when showing minutes/hours. Use the upper
            // bound of the visible precision so the badge never becomes ready early.
            const precision = /s/.test(text) ? 1000 : 60000;
            return durationMs(text) + precision;
          }).filter(delay => Number.isFinite(delay) && delay > 0);
        data[`${source}EggsReadyAt`] = delays.length ? Date.now() + Math.min(...delays) : null;
      }
    }
    return data;
  }

  function tamingEggReadiness(snapshot = {}, now = Date.now()) {
    const ready = source => snapshot[`${source}EggsReady`] === true
      || (Number.isFinite(snapshot[`${source}EggsReadyAt`]) && now >= snapshot[`${source}EggsReadyAt`]);
    return { hatchery: ready('hatchery'), ranch: ready('ranch') };
  }

  function renderTamingEggIndicator(readiness) {
    const sources = [readiness.hatchery && 'Hatchery', readiness.ranch && 'Ranch'].filter(Boolean);
    if (!sources.length) return '';
    const label = `Eggs ready · ${sources.join(' and ')}`;
    // Same egg outline as Ironwood's Hatchery menu, with our status badge colors.
    return `<span class="iw-task-icon iw-egg-ready" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.083c0 4.154 -2.966 6.74 -7 6.917c-4.2 0 -7 -2.763 -7 -6.917c0 -5.538 3.5 -11.09 7 -11.083c3.5 .007 7 5.545 7 11.083z"></path><path d="M12 3l-1.5 5l3.5 2.5l-2 3.5"></path></svg></span>`;
  }

  function collectTaming(doc) {
    const root = doc.querySelector('taming-page');
    if (!root) return false;
    const previous = getCache().taming || {};
    const eggs = readTamingEggs(root, previous);
    const activeExpedition = root?.querySelector('button.row.row-active');
    const expeditionName = clean(activeExpedition?.querySelector('.survival')?.childNodes[0]?.textContent);
    const expeditionType = clean(activeExpedition?.querySelector('.status')?.textContent);
    const snackRow = [...(root?.querySelectorAll('.row') || [])]
      .find((row) => clean(row.querySelector(':scope > .name')?.textContent) === 'Pet Snacks');
    const match = clean(snackRow?.querySelector('.amount')?.textContent)
      .match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
    const collectButton = [...(root?.querySelectorAll('button') || [])]
      .find((button) => clean(button.textContent) === 'Collect');
    if (!snackRow && !expeditionName && !Object.keys(eggs).length) return false;
    const data = { ...previous, schema: 2, ...eggs };
    if (match) {
      data.petSnacks = parseCompact(match[1]);
      data.snacksRequired = parseCompact(match[2]);
    }
    if (expeditionName) {
      data.expeditionName = expeditionName;
      data.expeditionType = expeditionType || '';
    }
    // Hatchery/Pets tabs omit the expedition panel. Preserve its cached loot and
    // snack counts while updating egg readiness from the always-visible menu.
    if (collectButton || snackRow) data.lootAvailable = Boolean(collectButton && !collectButton.disabled);
    setCache('taming', data);
    return data;
  }

  async function refreshTamingSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !needsLookup('taming')) return;
    if (AppState.ui.refreshingTaming) return;
    AppState.ui.refreshingTaming = true;
    try {
      await withPage('/skill/15', 'taming-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('taming-page .row .name')]
          .some((element) => clean(element.textContent) === 'Pet Snacks')) await wait(100);
        collectTaming(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Taming snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingTaming = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  async function collectTamingLoot() {
    if (!automationEnabled()) return;
    if (AppState.ui.collectingTaming) return;
    AppState.ui.collectingTaming = true;
    AppState.ui.lastSignature = '';
    render();
    const returnToStatus = location.pathname === STATS_PATH;
    let receipt;
    try {
      if (!document.querySelector('taming-page')) {
        const tamingNav = [...document.querySelectorAll('nav-component button')]
          .find((button) => clean(button.querySelector('.name')?.textContent) === 'Taming');
        if (!tamingNav) throw new Error('Could not open the Taming page');
        tamingNav.click();
        await waitFor(document, 'taming-page', 10000);
      }
      await (async (doc) => {
        const started = Date.now();
        let collectButton = null;
        while (Date.now() - started < 6000 && !collectButton) {
          collectButton = [...doc.querySelectorAll('taming-page button')]
            .find((button) => clean(button.textContent) === 'Collect' && !button.disabled);
          if (!collectButton) await wait(100);
        }
        if (!collectButton) throw new Error('No Taming loot is ready');
        const expeditionCard = () => [...doc.querySelectorAll('taming-page .card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Expedition');
        const lootTotal = () => [...(expeditionCard()?.querySelectorAll('.name-amount') || [])]
          .reduce((total, element) => total + numberFrom(element.textContent), 0);
        const elapsed = () => durationMs(clean(expeditionCard()?.querySelector(':scope > .header .interval')?.textContent).split('/')[0]);
        const beforeLoot = lootTotal();
        const beforeElapsed = elapsed();
        receipt = observeCollectionRewards(globalThis, ['lootPetExpedition', 'claimPetExpedition']);
        collectButton.click();
        const confirmStarted = Date.now();
        let confirmed = false;
        while (Date.now() - confirmStarted < 10000) {
          const current = [...doc.querySelectorAll('taming-page button')]
            .find((button) => clean(button.textContent) === 'Collect');
          const currentLoot = lootTotal();
          const currentElapsed = elapsed();
          if (receipt.confirmed() || (current && !current.disabled && ((beforeLoot > 0 && currentLoot < beforeLoot) || (beforeElapsed > 3000 && currentElapsed + 2000 < beforeElapsed)))) {
            confirmed = true;
            break;
          }
          await wait(100);
        }
        if (!confirmed) throw new Error('The game did not confirm the Taming loot claim');
        const refreshed = collectTaming(doc);
        setCache('taming', { ...refreshed, lastClaimAt: Date.now(), lastError: '' });
      })(document);
      AppState.ui.tamingClaimNoticeUntil = Date.now() + 1800;
      showCollectionRecap('Taming loot collected', receipt?.rewards(), '', getCache().taming?.expeditionName || '');
    } catch (error) {
      console.error('[Ironwood Status] Taming collection failed', error);
      const cached = getCache().taming || {};
      setCache('taming', { ...cached, lastError: error.message });
      showCollectionRecap('Taming collection stopped', receipt?.rewards(), error.message);
    } finally {
      receipt?.restore();
      try {
        // Status reads the mounted skill page; Taming has replaced it during collection.
        if (returnToStatus) await showStatusFromCurrentAction();
      } catch (error) {
        console.error('[Ironwood Status] Could not return from Taming', error);
        showActionToast({ icon: 'taming', title: 'Could not reopen Status', kind: 'warning', detail: 'Use Status in the menu to return to your current action.' });
      }
      AppState.ui.collectingTaming = false;
      AppState.ui.lastSignature = '';
      render();
      if (AppState.ui.tamingClaimNoticeUntil) setTimeout(() => {
        AppState.ui.tamingClaimNoticeUntil = 0;
        AppState.ui.lastSignature = '';
        render();
      }, 1800);
    }
  }
