  async function collectAttunement(doc) {
    const cards = [...doc.querySelectorAll('attunement-page .card')];
    const slotsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
    const slots = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])].map((slot) => ({
      name: clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent),
      skill: clean(slot.querySelector('.name .secondary')?.textContent),
      image: slot.querySelector('img')?.getAttribute('src') || ''
    }));
    const selected = [];
    const tributes = {};
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
      const tributeAmount = numberFrom(clean(tributeRow?.querySelector('.amount')?.textContent).split('/')[0]);
      selected.push({ name, skill, image, tribute: tributeName });
      if (tributeName) tributes[tributeName] = tributeAmount;
    }
    const data = { schema: 3, selected, tributes };
    setCache('attunement', data);
    return data;
  }
  async function collectAllAttunementLoot() {
    if (!automationEnabled()) return;
    if (AppState.ui.collectingAttunementLoot) return;
    AppState.ui.collectingAttunementLoot = true;
    const control = AppState.ui.page?.querySelector('[data-collect-attunement]');
    if (control) { control.disabled = true; control.textContent = 'Claiming…'; }
    let collected = 0;
    try {
      await withPage('/attunement', 'attunement-page', async (doc) => {
        const slotsCard = [...doc.querySelectorAll('attunement-page .card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
        const slotNames = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])]
          .map((slot) => clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent));
        for (const name of slotNames) {
          const liveSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
            .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
          const pendingXp = numberFrom(liveSlot?.querySelector('.amount')?.textContent);
          if (!liveSlot || pendingXp <= 0) continue;
          liveSlot?.click();
          const selectedStarted = Date.now();
          while (Date.now() - selectedStarted < 3000) {
            const activeSlot = doc.querySelector('attunement-page .card > button.row.row-active');
            const activeName = clean(activeSlot?.querySelector(':scope > .name')?.childNodes[0]?.textContent);
            if (activeName === name) break;
            await wait(100);
          }
          const collectButton = [...doc.querySelectorAll('attunement-page button')]
            .find((button) => clean(button.textContent) === 'Collect' && !button.disabled);
          if (!collectButton) continue;
          collectButton.click();
          const collectStarted = Date.now();
          let confirmed = false;
          while (Date.now() - collectStarted < 8000) {
            const updatedSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
              .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
            const updatedXp = numberFrom(updatedSlot?.querySelector('.amount')?.textContent);
            if (updatedXp < pendingXp) { confirmed = true; break; }
            await wait(150);
          }
          if (confirmed) collected++;
          await wait(150);
        }
        await collectAttunement(doc);
      });
      AppState.ui.lastSignature = '';
      render();
      const updated = AppState.ui.page?.querySelector('[data-collect-attunement]');
      if (updated) { updated.disabled = true; updated.textContent = collected ? `Claimed ${collected}` : 'Nothing to claim'; }
    } catch (error) {
      console.error('[Ironwood Status] Attunement collection failed', error);
      const failed = AppState.ui.page?.querySelector('[data-collect-attunement]');
      if (failed) { failed.textContent = 'Claim'; failed.title = error.message; }
    } finally {
      AppState.ui.collectingAttunementLoot = false;
      setTimeout(() => {
        const current = AppState.ui.page?.querySelector('[data-collect-attunement]');
        if (current) { current.disabled = false; current.textContent = 'Claim'; }
      }, 1800);
    }
  }
