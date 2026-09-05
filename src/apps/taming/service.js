  function collectTaming(doc) {
    const root = doc.querySelector('taming-page');
    const activeExpedition = root?.querySelector('button.row.row-active');
    const expeditionName = clean(activeExpedition?.querySelector('.survival')?.childNodes[0]?.textContent);
    const expeditionType = clean(activeExpedition?.querySelector('.status')?.textContent);
    const snackRow = [...(root?.querySelectorAll('.row') || [])]
      .find((row) => clean(row.querySelector(':scope > .name')?.textContent) === 'Pet Snacks');
    const match = clean(snackRow?.querySelector('.amount')?.textContent)
      .match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
    const collectButton = [...(root?.querySelectorAll('button') || [])]
      .find((button) => clean(button.textContent) === 'Collect');
    const data = {
      schema: 2,
      petSnacks: match ? parseCompact(match[1]) : null,
      snacksRequired: match ? parseCompact(match[2]) : null,
      expeditionName: expeditionName || '',
      expeditionType: expeditionType || '',
      lootAvailable: Boolean(collectButton && !collectButton.disabled)
    };
    setCache('taming', data);
    return data;
  }

  async function refreshTamingSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !isStale('taming')) return;
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
        collectButton.click();
        const confirmStarted = Date.now();
        let confirmed = false;
        while (Date.now() - confirmStarted < 10000) {
          const current = [...doc.querySelectorAll('taming-page button')]
            .find((button) => clean(button.textContent) === 'Collect');
          const currentLoot = lootTotal();
          const currentElapsed = elapsed();
          if (!current || current.disabled || (beforeLoot > 0 && currentLoot < beforeLoot) || (beforeElapsed > 3000 && currentElapsed + 2000 < beforeElapsed)) {
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
    } catch (error) {
      console.error('[Ironwood Status] Taming collection failed', error);
      const cached = getCache().taming || {};
      setCache('taming', { ...cached, lastError: error.message });
    } finally {
      AppState.ui.collectingTaming = false;
      if (returnToStatus) showStats({ push: true });
      AppState.ui.lastSignature = '';
      render();
      if (AppState.ui.tamingClaimNoticeUntil) setTimeout(() => {
        AppState.ui.tamingClaimNoticeUntil = 0;
        AppState.ui.lastSignature = '';
        render();
      }, 1800);
    }
  }
