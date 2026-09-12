  async function collectAttunement(doc) {
    const cards = [...doc.querySelectorAll('attunement-page .card')];
    const slotsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
    const slots = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])].map((slot) => ({
      name: clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent),
      skill: clean(slot.querySelector('.name .secondary')?.textContent),
      image: slot.querySelector('img')?.getAttribute('src') || ''
    }));
    const selected = [];
    const tributes = { ...(getCache().attunement?.tributes || {}) };
    for (const slot of slots) {
      const { name, skill, image } = slot;
      const liveSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
        .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
      liveSlot?.click();
      const started = Date.now();
      let tributeRow = null;
      while (Date.now() - started < 3000 && !tributeRow) {
        const liveCards = [...doc.querySelectorAll('attunement-page .card')];
        const selectedLoaded = liveCards.some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === name);
        const requirements = liveCards
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
        if (selectedLoaded) tributeRow = [...(requirements?.querySelectorAll(':scope > .row') || [])]
          .find((row) => /^(Forest|Mountain|Ocean) Tribute$/.test(clean(row.querySelector('.name')?.textContent)));
        if (!tributeRow) await wait(100);
      }
      const tributeName = clean(tributeRow?.querySelector('.name')?.textContent).replace(' Tribute', '');
      const tributeAmount = readTributeBalance(tributeRow?.querySelector('.amount')?.textContent);
      selected.push({ name, skill, image, tribute: tributeName });
      if (tributeName && Number.isFinite(tributeAmount)) tributes[tributeName] = tributeAmount;
    }
    const data = { schema: 3, selected, tributes, lastClaim: getCache().attunement?.lastClaim };
    setCache('attunement', data);
    return data;
  }
  function readAttunementSlotXp(slot) {
    const value = clean(slot?.querySelector('.amount')?.textContent).replace(/\s*XP$/i, '');
    // A disappearing row or loading placeholder is not a confirmed zero.
    if (!/^\d[\d,]*(?:\.\d+)?[KMB]?$/i.test(value)) return null;
    const amount = parseCompact(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }
  function observeAttunementReward(frameWindow) {
    let result = null;
    if (!frameWindow) return { read: () => result, restore() {} };
    const { firebase, catalog } = findNativeSyncRuntime(frameWindow);
    const original = firebase.lootAttunement;
    if (typeof original !== 'function') throw new Error('Native Attunement reward details are unavailable');
    // Observe the native request's single subscription. Subscribing separately
    // would send a second Collect request, so forward the existing stream only.
    async function observed(...args) {
      const response = await original.apply(this, args);
      const Observable = response?.constructor;
      if (typeof Observable !== 'function' || typeof Observable.prototype?.subscribe !== 'function') return response;
      return new Observable(subscriber => response.subscribe({
        next(value) {
          try {
            if (value?.user && !result) {
              const rewards = value.loot == null || typeof value.loot === 'object' ? Object.entries(value.loot || {}).map(([id, owned]) => {
                const item = catalog?.[id];
                return Number.isFinite(owned?.amount) && owned.amount >= 0 ? { name: item?.name || 'Unidentified item', image: item?.image ? `/assets/${item.image}` : '', amount: owned.amount } : null;
              }) : null;
              // The native handler treats omitted XP/points as no award.
              const amount = value => value == null ? 0 : Number.isFinite(value) && value >= 0 ? value : null;
              result = { xp: amount(value.exp), shards: amount(value.points),
                rewards: rewards?.every(Boolean) ? rewards.filter(item => item.amount > 0) : null };
            }
          } catch { result = null; }
          subscriber.next(value);
        },
        error: error => subscriber.error(error), complete: () => subscriber.complete()
      }));
    }
    firebase.lootAttunement = observed;
    return { read: () => result, restore() { if (firebase.lootAttunement === observed) firebase.lootAttunement = original; } };
  }

  function readAttunementRewardCategory(doc, slot, name) {
    const requirements = [...doc.querySelectorAll('attunement-page .card')]
      .find(card => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
    const tribute = [...(requirements?.querySelectorAll(':scope > .row') || [])]
      .map(row => clean(row.querySelector('.name')?.textContent)).find(text => /^(Forest|Mountain|Ocean) Tribute$/.test(text));
    return { name, skill: clean(slot?.querySelector('.name .secondary')?.textContent), region: tribute?.replace(' Tribute', '') || '' };
  }

  async function collectAllAttunementLoot() {
    if (!automationEnabled()) return;
    if (AppState.ui.collectingAttunementLoot) return;
    AppState.ui.collectingAttunementLoot = true;
    const control = AppState.ui.page?.querySelector('[data-collect-attunement]');
    if (control) { control.disabled = true; setClaimButtonState(control, 'Claiming…', 'busy'); }
    let collected = 0;
    const collectedSlots = [];
    const categories = [];
    let mutationAttempted = false;
    let failure = null;
    let syncError = '';
    try {
      await withPage('/attunement', 'attunement-page', async (doc, frameWindow) => {
        const slotsCard = [...doc.querySelectorAll('attunement-page .card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
        const slotNames = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])]
          .map((slot) => clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent));
        for (const name of slotNames) {
          const liveSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
            .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
          const pendingXp = readAttunementSlotXp(liveSlot);
          if (pendingXp === null) throw new Error(`Could not read the pending XP for ${name}.`);
          if (pendingXp <= 0) continue;
          liveSlot?.click();
          const selectedStarted = Date.now();
          let selected = false;
          while (Date.now() - selectedStarted < 3000) {
            const activeSlot = doc.querySelector('attunement-page .card > button.row.row-active');
            const activeName = clean(activeSlot?.querySelector(':scope > .name')?.childNodes[0]?.textContent);
            if (activeName === name) { selected = true; break; }
            await wait(100);
          }
          if (!selected) throw new Error(`Could not select ${name} for collection.`);
          const collectButton = [...doc.querySelectorAll('attunement-page button')]
            .find((button) => clean(button.textContent) === 'Collect' && !button.disabled);
          if (!collectButton) throw new Error(`Could not collect ${name}: the Collect control is unavailable.`);
          if (!automationEnabled()) throw new Error('Automation is disabled');
          const category = readAttunementRewardCategory(doc, liveSlot, name);
          const notifications = observeCollectionRewards(frameWindow);
          let receipt;
          try { receipt = observeAttunementReward(frameWindow); }
          catch (error) { console.error('[Ironwood Status] Reward detail observation unavailable', error); }
          try {
            mutationAttempted = true;
            collectButton.click();
            const collectStarted = Date.now();
            let confirmed = false;
            while (Date.now() - collectStarted < 8000) {
              const updatedSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
                .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
              const updatedXp = readAttunementSlotXp(updatedSlot);
              if (updatedXp !== null && updatedXp < pendingXp) { confirmed = true; break; }
              await wait(150);
            }
            const reward = receipt?.read();
            // A successful native response also preserves an accepted reward when
            // its UI confirmation is delayed. Stop the batch rather than recollect.
            if (confirmed || reward) {
              collected++;
              collectedSlots.push(name);
              categories.push({ ...category, ...(reward || { xp: null, shards: null, rewards: null }) });
            }
            if (!confirmed) throw new Error(`Ironwood did not confirm collection for ${name}.`);
          } finally { receipt?.restore(); notifications.restore(); }
          await wait(150);
        }
        await collectAttunement(doc);
      });
    } catch (error) {
      failure = error;
      console.error('[Ironwood Status] Attunement collection failed', error);
    } finally {
      // Synchronize once after the frame closes, even if a later claim failed or
      // a request may have succeeded without its confirmation reaching the frame.
      if (mutationAttempted) {
        try { await synchronizeNativeGame(); }
        catch (error) {
          syncError = 'Game state could not sync. Reload the game to refresh Attunement and inventory.';
          console.error('[Ironwood Status] Post-attunement synchronization failed', error);
        }
      }
      const lastClaim = { collected, collectedSlots, categories, successful: !failure, finishedAt: Date.now(), error: failure?.message || '', syncError };
      setCache('attunement', { ...getCache().attunement, lastClaim });
      showAttunementRecap(lastClaim);
      AppState.ui.collectingAttunementLoot = false;
      AppState.ui.lastSignature = '';
      render();
      const updated = AppState.ui.page?.querySelector('[data-collect-attunement]');
      if (updated) {
        updated.disabled = true;
        setClaimButtonState(updated, failure ? `Retry claim: ${failure.message}` : collected ? `Claimed ${collected}` : 'Nothing to claim', failure || syncError ? 'error' : 'done');
      }
      setTimeout(() => {
        const current = AppState.ui.page?.querySelector('[data-collect-attunement]');
        if (current) { current.disabled = false; setClaimButtonState(current, 'Claim'); }
      }, 1800);
    }
  }

  function readPendingAttunementShards(skillName) {
    if (!skillName) return null;
    try {
      const runtime = findNativeSyncRuntime(globalThis);
      const user = runtime.state?.user$?.getValue();
      const attunement = Object.values(runtime.attunementCatalog || {}).find(item => item.name === skillName);
      const shard = Object.values(runtime.catalog || {}).find(item => item.image === 'items/attunement-shard.png');
      if (!user || !attunement || !shard) return null;
      const slots = Object.values(user.attunements?.slots || {}).filter(slot => slot.id === attunement.id);
      if (!slots.length) return null;
      let total = 0;
      for (const slot of slots) {
        if (!slot.loot || typeof slot.loot !== 'object') return null;
        const amount = slot.loot[shard.id]?.amount ?? 0;
        if (!Number.isFinite(amount) || amount < 0) return null;
        total += amount;
      }
      return Math.floor(total);
    } catch { return null; }
  }
