  async function collectAutomations(doc) {
    const root = doc.querySelector('home-page');
    const structuresCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
    const structureEntries = [...(structuresCard?.querySelectorAll(':scope > button.row') || [])].map((row) => ({
      structure: clean(row.querySelector(':scope > .name')?.textContent),
      image: row.querySelector(':scope > .image img')?.getAttribute('src') || '/assets/misc/structure.png',
      making: clean([...row.children].find((child) => !child.classList.contains('image') && !child.classList.contains('name'))?.textContent)
    }));
    const structures = [];
    for (const entry of structureEntries) {
      const { structure, image, making } = entry;
      const currentStructuresCard = [...(root?.querySelectorAll('.card') || [])]
        .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
      const row = [...(currentStructuresCard?.querySelectorAll(':scope > button.row') || [])]
        .find((candidate) => clean(candidate.querySelector(':scope > .name')?.textContent) === structure);
      if (!row) continue;
      row.click();
      const selectedAt = Date.now();
      while (Date.now() - selectedAt < 4000) {
        const currentActionsCard = [...root.querySelectorAll('.card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
        const activeName = clean(currentActionsCard?.querySelector(':scope > button.row.active-link .name')?.textContent);
        if (!making || activeName === making) break;
        await wait(75);
      }
      await wait(150);
      const cards = [...root.querySelectorAll('.card')];
      const lootCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Loot');
      const actionsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
      const selectedAction = actionsCard?.querySelector(':scope > button.row.active-link')
        || [...(actionsCard?.querySelectorAll(':scope > button.row') || [])]
          .find((action) => clean(action.querySelector(':scope > .name')?.textContent) === making);
      const baseIntervalMs = durationMs(selectedAction?.querySelector('.interval')?.textContent);
      const statsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Stats');
      const speedRow = [...(statsCard?.querySelectorAll(':scope > .row') || [])]
        .find((item) => clean(item.querySelector('.name')?.textContent) === `${structure} Automation Speed`);
      const speedBonus = numberFrom(speedRow?.querySelector('.bonus')?.textContent) / 100;
      const queueMatch = clean(lootCard?.querySelector(':scope > .header > .amount')?.textContent)
        .match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
      const lootRow = lootCard?.querySelector(':scope > .row');
      structures.push({
        structure,
        image,
        making,
        makingImage: selectedAction?.querySelector('img')?.getAttribute('src') || '',
        lootName: clean(lootRow?.querySelector('.name')?.textContent),
        lootAmount: numberFrom(lootRow?.querySelector('.amount')?.textContent),
        queuedDone: queueMatch ? numberFrom(queueMatch[1]) : 0,
        queuedTotal: queueMatch ? numberFrom(queueMatch[2]) : 0,
        checkedAt: Date.now(),
        intervalMs: baseIntervalMs ? baseIntervalMs / (1 + Math.max(0, speedBonus)) : 0
      });
    }
    structures.forEach((item) => {
      item.outputPerAction = item.queuedDone > 0 ? item.lootAmount / item.queuedDone : 0;
    });
    const data = automationSnapshot(structures);
    setCache('automations', data);
    return data;
  }

  async function openAutomationHouse(doc) {
    if (!doc.querySelector('home-page')) {
      const started = Date.now();
      let houseButton;
      while (Date.now() - started < 10000 && !houseButton) {
        houseButton = [...doc.querySelectorAll('nav-component button')]
          .find((button) => clean(button.textContent) === 'House');
        if (!houseButton) await wait(100);
      }
      if (!houseButton) throw new Error('Could not open the House page');
      houseButton.click();
    }
    await waitFor(doc, 'home-page', 10000);
    const started = Date.now();
    while (Date.now() - started < 6000) {
      if ([...doc.querySelectorAll('home-page .card > .header > .name')]
        .some((element) => clean(element.textContent) === 'Structures')) return;
      await wait(100);
    }
    throw new Error('Could not load automation structures');
  }

  async function collectAutomationStructure(doc, structure) {
    const root = doc.querySelector('home-page');
    const card = (name) => [...root.querySelectorAll('.card')]
      .find((item) => clean(item.querySelector(':scope > .header > .name')?.textContent) === name);
    const row = [...(card('Structures')?.querySelectorAll(':scope > button.row') || [])]
      .find((candidate) => clean(candidate.querySelector(':scope > .name')?.textContent) === structure);
    if (!row) throw new Error(`Could not find ${structure}`);
    row.click();
    await wait(100);
    const selectedAt = Date.now();
    let before;
    while (Date.now() - selectedAt < 6000) {
      const selected = card('Structures')?.querySelector(':scope > button.row.active-link');
      if (clean(selected?.querySelector(':scope > .name')?.textContent) === structure) {
        before = readVisibleAutomation(doc);
        if (before) break;
      }
      await wait(100);
    }
    if (!before) throw new Error(`Could not load ${structure} automation loot`);
    if (before.lootAmount <= 0) {
      storeAutomationStructure(before);
      return;
    }
    // Native controls are siblings of the Loot card inside automate-component.
    const collectButton = [...root.querySelectorAll('automate-component > .action-buttons > button')]
      .find((button) => !button.disabled && /^(?:collect|claim)(?:\s+loot)?$/i.test(clean(button.textContent)));
    if (!collectButton) throw new Error(`No loot claim control for ${structure}`);
    if (!automationEnabled()) return;
    collectButton.click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const after = readVisibleAutomation(doc);
      // A disabled button can mean a pending request. Confirm the actual loot
      // reduction before replacing the snapshot or moving to another structure.
      if (after?.structure === structure && after.lootAmount < before.lootAmount) {
        storeAutomationStructure(after);
        return;
      }
      await wait(100);
    }
    throw new Error(`The game did not confirm the ${structure} loot claim`);
  }

  async function collectAllAutomationLoot() {
    if (!automationEnabled() || AppState.ui.collectingAutomation || AppState.ui.refreshingAutomations) return;
    const cached = getCache().automations;
    const structures = (cached?.structures || [])
      .map((item) => projectedAutomation(item, cached.checkedAt))
      .filter((item) => item.lootAmount > 0);
    if (!structures.length) return;
    AppState.ui.collectingAutomation = 'all';
    setCache('automations', { ...cached, lastError: '' });
    AppState.ui.lastSignature = '';
    render();
    try {
      await withPage('/', 'app-component', async (doc) => {
        await openAutomationHouse(doc);
        for (const item of structures) {
          if (!automationEnabled()) break;
          AppState.ui.collectingAutomation = item.structure;
          await collectAutomationStructure(doc, item.structure);
          AppState.ui.lastSignature = '';
          render();
        }
      });
    } catch (error) {
      console.error('[Ironwood Status] Automation collection failed', error);
      setCache('automations', { ...getCache().automations, lastError: error.message });
    } finally {
      AppState.ui.collectingAutomation = '';
      AppState.ui.lastSignature = '';
      render();
    }
  }

  async function refreshAutomationsSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (AppState.ui.refreshingAutomations || AppState.ui.collectingAutomation || (!force && !needsLookup('automations'))) return;
    AppState.ui.refreshingAutomations = true;
    try {
      await withPage('/', 'app-component', async (doc) => {
        await openAutomationHouse(doc);
        await collectAutomations(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Automation snapshot refresh failed', error);
    } finally {
      AppState.ui.refreshingAutomations = false;
      AppState.ui.lastSignature = '';
      render();
    }
  }

  function readVisibleAutomation(doc) {
    const root = doc.querySelector('home-page');
    const cards = [...(root?.querySelectorAll('.card') || [])];
    const structuresCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
    const row = structuresCard?.querySelector(':scope > button.row.active-link');
    const lootCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Loot');
    if (!row || !lootCard) return;
    const structure = clean(row.querySelector(':scope > .name')?.textContent);
    const making = clean([...row.children].find((child) => !child.classList.contains('image') && !child.classList.contains('name'))?.textContent);
    const queueMatch = clean(lootCard.querySelector(':scope > .header > .amount')?.textContent).match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    if (!queueMatch) return;
    const lootRow = lootCard.querySelector(':scope > .row');
    const actionsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
    const selectedAction = actionsCard?.querySelector(':scope > button.row.active-link')
      || [...(actionsCard?.querySelectorAll(':scope > button.row') || [])].find((action) => clean(action.querySelector(':scope > .name')?.textContent) === making);
    const statsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Stats');
    const speedRow = [...(statsCard?.querySelectorAll(':scope > .row') || [])]
      .find((item) => clean(item.querySelector('.name')?.textContent) === `${structure} Automation Speed`);
    const speedBonus = numberFrom(speedRow?.querySelector('.bonus')?.textContent) / 100;
    const queuedDone = numberFrom(queueMatch[1]);
    const queuedTotal = numberFrom(queueMatch[2]);
    const lootAmount = numberFrom(lootRow?.querySelector('.amount')?.textContent);
    return {
      structure,
      image: row.querySelector(':scope > .image img')?.getAttribute('src') || '/assets/misc/structure.png',
      making,
      makingImage: selectedAction?.querySelector('img')?.getAttribute('src') || '',
      lootName: clean(lootRow?.querySelector('.name')?.textContent),
      lootAmount,
      queuedDone,
      queuedTotal,
      checkedAt: Date.now(),
      intervalMs: durationMs(selectedAction?.querySelector('.interval')?.textContent) / (1 + Math.max(0, speedBonus)),
      outputPerAction: queuedDone > 0 ? lootAmount / queuedDone : 0
    };
  }

  function storeAutomationStructure(item) {
    const previous = getCache().automations || {};
    const prior = previous.structures?.find((entry) => entry.structure === item.structure);
    if (!item.outputPerAction && prior?.making === item.making) item.outputPerAction = prior.outputPerAction || 0;
    const byStructure = new Map((previous.structures || []).map((entry) => [entry.structure, {
      ...entry, checkedAt: entry.checkedAt || previous.checkedAt || Date.now()
    }]));
    byStructure.set(item.structure, item);
    const structures = [...byStructure.values()];
    setCache('automations', automationSnapshot(structures));
  }
