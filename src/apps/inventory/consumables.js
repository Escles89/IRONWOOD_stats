  function equipmentConsumables(card) {
    return [...card.querySelectorAll(':scope > .items > button.item')].map(button => {
      const image = button.querySelector('img')?.getAttribute('src') || '';
      const name = clean(button.querySelector('.description > .name')?.textContent);
      const amountText = clean(button.querySelector('.description > .amount')?.textContent).replace(/\s*&\s*/g, ' & ');
      return { key: image.split('/').pop(), image, name, amountText, button };
    }).filter(item => item.key && item.name);
  }

  function consumableCategory(item) {
    const key = item.key || item.image?.split('/').pop() || '';
    if (/^potion-/.test(key)) return 'Potions';
    if (/^sigil-/.test(key)) return 'Sigils';
    if (/^key-/.test(key)) return 'Keys';
    if (/^(mastery-brew-|brew-)/.test(key)) return 'Brews';
    if (/^(cooked-|pie-|food-)/.test(key) || item.stats?.heal > 0) return 'Food';
    return 'Other';
  }

  function consumableTime(seconds) {
    if (seconds < 60) return '<1m';
    const minutes = Math.ceil(seconds / 60), days = Math.floor(minutes / 1440);
    return days ? `${days}d ${Math.floor(minutes % 1440 / 60)}h` : formatDuration(seconds);
  }

  function consumableDurationRate(category, runtime) {
    const stat = category === 'Potions' ? 'potionDuration' : category === 'Sigils' ? 'sigilDuration' : null;
    if (!stat) return 1;
    const tome = Object.values(runtime.state.user.equipment || {}).map(entry => runtime.catalog?.[entry?.id]).find(item => item?.stats?.[stat]);
    if (!tome) return 1;
    const passiveName = category === 'Potions' ? 'Potent Concoction Effect' : 'Runic Wisdom Effect';
    const passive = Object.values(runtime.masteryPassiveCatalog || {}).find(item => item.name === passiveName);
    if (!passive) return null; // Do not guess whether the tome's effect is doubled.
    const doubled = Boolean(runtime.state.user.masteries?.passives?.[passive.id]?.level);
    return 1 + tome.stats[stat] * (doubled ? 2 : 1) / 100;
  }

  function consumableSupplyEstimate(item, runtime, samples, now = Date.now()) {
    const unavailable = { label: 'Estimate unavailable', detail: 'Waiting for current equipment data.', state: 'unknown', percent: null };
    const user = runtime?.state?.user;
    if (!user || !runtime.catalog) return unavailable;
    const entry = Object.entries(user.equipment || {}).find(([, worn]) => runtime.catalog[worn?.id]?.image?.split('/').pop() === item.key);
    if (!entry) return unavailable;
    const [slot, worn] = entry, definition = runtime.catalog[worn.id], category = consumableCategory(definition);
    // Ironwood stores timed charges in tenths of a second. The amount excludes
    // the opened item, whose remaining charge lives in uses.
    const duration = definition.stats?.duration, usesPerItem = duration ? duration * 10 : definition.stats?.uses || 1;
    if (!Number.isFinite(worn.amount) || worn.amount < 0 || (worn.uses != null && (!Number.isFinite(worn.uses) || worn.uses < 0))) return unavailable;
    const remaining = worn.amount + (worn.uses || 0) / usesPerItem;
    const percent = duration || definition.stats?.uses ? Math.min(100, Math.max(0, (worn.uses || 0) / usesPerItem * 100)) : null;
    if (!remaining) { samples.delete(item.key); return { label: 'Empty', detail: 'Equip more to keep this supplied.', state: 'empty', percent }; }
    const skill = runtime.skillCatalog?.[user.action?.skillId]?.name;
    const slotName = runtime.equipmentCatalog?.[slot]?.name;
    const combat = COMBAT_SKILLS.has(skill);
    const action = runtime.actionCatalog?.[user.action?.actionId];
    const hunger = Object.values(user.equipment || {}).some(entry => runtime.catalog[entry?.id]?.stats?.hungerHeal > 0);
    const applies = category === 'Potions' ? ({ 'Gathering Potion': GATHERING_SKILLS.has(skill), 'Crafting Potion': CRAFTING_SKILLS.has(skill), 'Combat Potion': combat })[slotName]
      : category === 'Keys' ? combat && action?.eliteKey === worn.id
      : category === 'Food' ? combat || hunger
      : ['Sigils', 'Brews'].includes(category) ? true : undefined;
    const active = Boolean(user.action && skill && applies);
    const previous = samples.get(item.key);
    // Observe actual use for variable supplies. Reset on refills, navigation gaps,
    // and action/equipment changes (the caller owns the observation signature).
    let sample = previous;
    if (!active || !sample || remaining > sample.last || now - sample.seenAt > 10000) {
      sample = { start: now, initial: remaining, last: remaining, seenAt: now, changes: 0, seconds: null };
    } else {
      if (remaining < sample.last) {
        sample.changes++;
        // The first use may arrive midway through a consumption cycle.
        if (sample.changes === 1) { sample.start = now; sample.initial = remaining; }
        const elapsed = (now - sample.start) / 1000;
        if (sample.changes >= 2 && elapsed >= 15) sample.seconds = elapsed / (sample.initial - remaining);
      }
      sample.last = remaining; sample.seenAt = now;
    }
    samples.set(item.key, sample);
    const rate = duration ? consumableDurationRate(category, runtime) : null;
    const seconds = duration && rate > 0 ? remaining * duration / rate
      : active && sample.seconds ? remaining * sample.seconds : null;
    const state = active ? 'active' : 'paused';
    const label = seconds !== null ? `≈ ${consumableTime(seconds)}${active ? ' left' : ' of use'}`
      : active ? 'Estimating time…' : 'Not in use';
    const detail = !user.action ? 'Paused · no current action'
      : !active ? `${applies === undefined ? 'Usage unknown' : 'Not used'} · ${skill || 'current action'}`
      : duration && rate > 0 ? 'Active time · equipped supply only'
      : sample.seconds ? 'At recent use rate · equipped only'
      : 'Waiting for a few uses to estimate';
    return { label, detail, state, percent };
  }

  function enhanceEquippedConsumables(card, equipped, runtime) {
    if (!equipped.length) return;
    let heading = card.querySelector('.iw-equipped-heading');
    if (!heading) {
      heading = document.createElement('div');
      heading.className = 'iw-equipped-heading';
      heading.innerHTML = '<h3>Equipped consumables</h3><small>Approx. time left</small>';
      card.querySelector('.items')?.before(heading);
    }
    const rates = AppState.ui.consumableSupplyRates;
    const user = runtime?.state?.user;
    const signature = JSON.stringify([quickOwner(runtime), user?.action?.skillId, user?.action?.actionId, user?.action?.startDate,
      Object.entries(user?.equipment || {}).map(([slot, item]) => [slot, item?.id]), user?.masteries?.passives]);
    if (rates.signature !== signature) { rates.signature = signature; rates.samples.clear(); }
    for (const item of equipped) {
      const estimate = consumableSupplyEstimate(item, runtime, rates.samples);
      const button = item.button;
      button.classList.add('iw-equipped-item');
      button.dataset.supplyState = estimate.state;
      let timer = button.querySelector('.iw-equipped-timer');
      if (!timer) { timer = document.createElement('div'); timer.className = 'iw-equipped-timer'; button.appendChild(timer); }
      const value = estimate.label.replace(/ (left|of use)$/, '').replace('Estimating time…', 'Estimating…');
      const status = estimate.state === 'empty' ? 'No supply' : estimate.state === 'paused' ? (estimate.label === 'Not in use' ? '' : 'Not in use')
        : estimate.state === 'unknown' ? '' : estimate.label.startsWith('≈') ? 'Active use' : 'After a few uses';
      const markup = `<span>${escapeHtml(value)}</span><small>${status}</small>`;
      timer.title = estimate.detail;
      if (timer._iwMarkup !== markup) { timer.innerHTML = markup; timer._iwMarkup = markup; }
    }
  }

  function consumableStock(equipped, inventory, catalog = null, nativeInventory = null) {
    const items = Object.values(catalog || {});
    const consumableType = items.find(item => item.image === 'items/potion-divine-gather-yield.png')?.type;
    const definitions = new Map(items.filter(item => consumableType !== undefined && item.type === consumableType)
      .map(item => [item.image?.split('/').pop(), item]));
    const equippedByKey = new Map(equipped.map(item => [item.key, item]));
    const known = nativeInventory !== null || Array.isArray(inventory?.allItems);
    const storedByKey = new Map((inventory?.allItems || []).map(item => [item.key, item]));
    if (nativeInventory !== null) {
      storedByKey.clear();
      for (const [key, item] of definitions) {
        const owned = nativeInventory[item.id];
        const amount = owned === undefined ? 0 : owned?.amount;
        storedByKey.set(key, { amount, name: item.name, image: `/assets/${item.image}` });
      }
    }
    const keys = new Set([...equippedByKey.keys(), ...storedByKey.keys()]);
    return [...keys].filter(key => equippedByKey.has(key) || definitions.has(key)
      || (!definitions.size && /^(potion-|sigil-|key-|mastery-brew-|cooked-|pie-(?!burnt))/.test(key)))
      .map(key => {
        const worn = equippedByKey.get(key), stored = storedByKey.get(key), definition = definitions.get(key);
        return { key, category: consumableCategory(definition || { key }), name: worn?.name || definition?.name || stored?.name || titleFromSlug(key.replace(/\.png$/, '')),
          image: worn?.image || stored?.image || `/assets/${definition?.image}`,
          equipped: worn?.amountText || '—', stored: stored ? (Number.isFinite(stored.amount) ? stored.amount : null) : (known ? 0 : null),
          approximate: quantityIsApproximate(stored) };
      }).filter(item => equippedByKey.has(item.key) || item.stored > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderConsumableStock(rows, nativeInventory) {
    return `${nativeInventory ? '' : '<p class="iw-supply-note">Last observed inventory · open Inventory to update.</p>'}
      ${['Potions', 'Sigils', 'Food', 'Keys', 'Brews', 'Other'].map(category => {
        const group = rows.filter(item => (item.category || consumableCategory(item)) === category);
        if (!group.length) return '';
        return `<section class="iw-card iw-supply-group" aria-label="${category}"><div class="iw-card-header"><h3>${category}</h3><small>Stored reserves</small></div><table aria-label="${category} stored reserves"><thead><tr><th scope="col">Item</th><th scope="col">Stored</th></tr></thead><tbody>${group.map(item => `<tr><th scope="row"><span><img src="${escapeHtml(item.image)}" alt="">${escapeHtml(item.name)}</span></th><td>${item.stored === null ? 'Unknown' : item.stored === 0 ? '<span class="iw-no-reserve">No reserve</span>' : formatQuantityMarkup({ amount: item.stored, approximate: item.approximate })}</td></tr>`).join('')}</tbody></table></section>`;
      }).join('')}`;
  }

  function consumableOverviewRows(category, runtime = quickRuntime()) {
    const native = quickOwner(runtime) && runtime?.catalog ? runtime : null;
    const equipped = native ? Object.values(native.state.user.equipment || {}).flatMap(worn => {
      const item = native.catalog[worn?.id];
      if (!item?.image) return [];
      return [{ key: item.image.split('/').pop(), name: item.name, image: `/assets/${item.image}`,
        amountText: Number.isFinite(worn.amount) ? formatNumber(worn.amount) : 'Unknown' }];
    }) : (AppState.derived.consumableRows || []).filter(item => !item.storedOnly).map(item => ({
      ...item, key: item.image.split('/').pop()?.split('?')[0],
      amountText: Number.isFinite(item.equipped) ? `${item.equippedApproximate ? '≈ ' : ''}${formatNumber(item.equipped)}` : 'Unknown'
    }));
    return consumableStock(equipped, getCache().inventory, native?.catalog, native?.state.user.inventory ?? null)
      .filter(item => item.category === category);
  }

  function openConsumableOverview(category, trigger) {
    if (!['Potions', 'Sigils', 'Food', 'Keys', 'Brews', 'Other'].includes(category)) return;
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = false;
    AppState.ui.mastery.open = false;
    AppState.ui.traits.open = false;
    AppState.ui.shopping.selectedStep = null;
    AppState.ui.consumableOverview = category;
    AppState.ui.preferencesTrigger = trigger;
    renderGlobalDialog();
    document.querySelector('.iw-consumables-panel [data-modal-close]')?.focus();
  }

  function renderConsumableOverview() {
    const category = AppState.ui.consumableOverview;
    const runtime = quickRuntime();
    const rows = consumableOverviewRows(category, runtime);
    const live = quickOwner(runtime) && runtime?.catalog && runtime.state.user.inventory != null;
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-consumables-panel" role="dialog" aria-modal="true" aria-labelledby="iw-consumables-title">
      <div class="iw-options-heading"><div><h2 id="iw-consumables-title">${escapeHtml(category)}</h2><small>Equipped supplies and stored reserves</small></div><button type="button" class="iw-modal-close" data-modal-close aria-label="Close consumable overview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg></button></div>
      <div class="iw-options-body">${live ? '' : '<p class="iw-supply-note">Last observed inventory · open Inventory to update.</p>'}${rows.length ? `<table class="iw-supply-table" aria-label="${escapeHtml(category)} supplies"><thead><tr><th scope="col">Item</th><th scope="col">Equipped</th><th scope="col">Stored</th></tr></thead><tbody>${rows.map(item => `<tr><th scope="row"><span><img src="${escapeHtml(item.image)}" alt="">${escapeHtml(item.name)}</span></th><td>${escapeHtml(item.equipped)}</td><td>${item.stored === null ? 'Unknown' : formatQuantityMarkup({ amount: item.stored, approximate: item.approximate })}</td></tr>`).join('')}</tbody></table>` : '<p class="iw-supply-note">No supplies observed in this category.</p>'}</div>
      <footer><button type="button" class="iw-small-button iw-options-done" data-modal-close>Done</button></footer></section></div>`;
  }

  function syncEquipmentConsumables() {
    if (location.pathname !== '/equipment') return;
    const root = document.querySelector('equipment-page');
    const categories = root?.querySelector('.cards > .categories');
    if (!categories) return;
    const nativeTabs = [...categories.querySelectorAll('button.category')].filter(button => button.id !== 'iw-consumables-tab');
    const equipment = nativeTabs.find(button => clean(button.textContent) === 'Equipment');
    const runes = nativeTabs.find(button => clean(button.textContent) === 'Runes');
    if (!equipment || !runes) return;
    const cards = categories.parentElement;
    let tab = categories.querySelector('#iw-consumables-tab');
    if (!tab) {
      // Clone only the native style scope; Angular keeps ownership of its cards and controls.
      tab = equipment.cloneNode(true);
      tab.id = 'iw-consumables-tab';
      tab.querySelector('.name').textContent = 'Consumables';
      tab.disabled = false;
      tab.setAttribute('aria-controls', 'iw-consumables-stock');
      runes.before(tab);
      tab.addEventListener('click', () => {
        equipment.click();
        cards.dataset.iwConsumables = 'true';
        syncEquipmentConsumables();
      });
      for (const button of nativeTabs) button.addEventListener('click', () => {
        cards.dataset.iwConsumables = 'false';
        syncEquipmentConsumables();
      });
    }
    const active = cards.dataset.iwConsumables === 'true';
    tab.disabled = active;
    tab.setAttribute('aria-pressed', String(active));
    // The native Equipment category remains mounted while Consumables is selected.
    // Enable its button so the user can return to the equipment cards.
    if (active) equipment.disabled = false;
    else if (!nativeTabs.some(button => button !== equipment && button.disabled)) equipment.disabled = true;
    for (const card of cards.querySelectorAll(':scope > .card')) {
      const isConsumables = clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Consumables';
      card.classList.toggle('iw-equipment-consumables', isConsumables);
      if (isConsumables && card.id !== 'iw-equipped-consumables') card.id = 'iw-equipped-consumables';
      else if (!isConsumables && card.id === 'iw-equipped-consumables') card.id = '';
      if (!isConsumables) {
        // Angular can reuse a card when changing categories. Remove our additions
        // so a reused rune/tome card never inherits consumable content or styling.
        card.querySelectorAll('.iw-equipped-heading, .iw-equipped-timer').forEach(node => node.remove());
        card.querySelectorAll('.iw-equipped-item').forEach(button => {
          button.classList.remove('iw-equipped-item');
          delete button.dataset.supplyState;
        });
      }
      card.classList.toggle('iw-equipment-hidden', isConsumables ? !active : active);
    }
    let stock = cards.querySelector('#iw-consumables-stock');
    if (!stock) {
      stock = document.createElement('section');
      stock.id = 'iw-consumables-stock';
      stock.setAttribute('aria-label', 'Consumable supplies');
      cards.appendChild(stock);
    }
    stock.hidden = !active;
    if (!active) return;
    const card = cards.querySelector('.iw-equipment-consumables');
    if (!card) return; // Angular may still be mounting Equipment after another category.
    const runtime = quickRuntime();
    const nativeInventory = quickOwner(runtime) && runtime?.catalog ? runtime.state.user.inventory ?? null : null;
    const equipped = equipmentConsumables(card);
    enhanceEquippedConsumables(card, equipped, quickOwner(runtime) ? runtime : null);
    const rows = consumableStock(equipped, getCache().inventory, runtime?.catalog, nativeInventory);
    const markup = renderConsumableStock(rows, nativeInventory !== null);
    if (stock._iwMarkup !== markup) { stock.innerHTML = markup; stock._iwMarkup = markup; }
  }
