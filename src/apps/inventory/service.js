  function collectInventory(doc) {
    // A mounted route with no item tiles is usually still loading. Never cache it as empty.
    if (AppState.ui.pendingLootClaim || !doc.querySelectorAll('inventory-page button.item').length) return false;
    const allItems = [...doc.querySelectorAll('inventory-page button.item')].map((button) => {
      const src = button.querySelector('img')?.getAttribute('src') || '';
      const key = src.split('/').pop()?.split('?')[0] || '';
      const quantity = readItemQuantity(button.querySelector('.amount'));
      const name = clean(button.querySelector('.name')?.textContent);
      return key ? { key, name, ...quantity, image: src } : null;
    }).filter(Boolean);
    const items = allItems.filter(item => /potion-divine-[\w-]+/.test(item.key)).map(item => ({
      ...item, slug: item.key.match(/potion-divine-[\w-]+/)[0],
      name: item.name || `Divine ${titleFromSlug(item.key.replace(/\.[^.]+$/, ''))} Potion`
    }));
    setCache('inventory', { schema: 1, items, allItems });
    return true;
  }

  async function refreshInventorySnapshot(force = false) {
    return SyncCoordinator.refresh('inventory', { force, load: () => withPage('/inventory', 'inventory-page', async doc => {
      const started = Date.now();
      while (Date.now() - started < 10000) {
        if (collectInventory(doc)) return;
        await wait(100);
      }
      throw new Error('Inventory items did not finish loading');
    }) });
  }

  function beginInventoryLootClaim(loot = readLoot(document)) {
    if (AppState.ui.pendingLootClaim) return AppState.ui.pendingLootClaim;
    const inventory = getCache().inventory;
    const claim = { loot: loot.map(item => ({ ...item })), inventoryCheckedAt: inventory?.checkedAt, applied: false };
    AppState.ui.pendingLootClaim = claim;
    return claim;
  }

  function setCachedInventoryQuantity(key, amount, name, image) {
    setCachedInventoryQuantities([{ key, amount, name, image }]);
  }

  function setCachedInventoryQuantities(observations) {
    if (!observations.length) return;
    const inventory = getCache().inventory;
    if (!Array.isArray(inventory?.allItems)) return;
    const counts = new Map(inventory.allItems.map(item => [item.key, item]));
    let changed = false;
    for (const { key, amount, name, image, approximate = false } of observations) {
      if (!key || !Number.isFinite(amount)) continue;
      const previous = counts.get(key);
      if ((previous?.amount === amount && quantityIsApproximate(previous) === approximate) || (!previous && amount === 0)) continue;
      counts.set(key, { ...previous, key, name: previous?.name || name, image: previous?.image || image, amount, approximate, amountText: formatItemQuantity({ amount, approximate }) });
      changed = true;
    }
    if (changed) setCache('inventory', { ...inventory, allItems: [...counts.values()] });
  }

  function applyInventoryLootClaim(claim) {
    if (!claim || claim.applied) return false;
    claim.applied = true;
    const inventory = getCache().inventory;
    if (!Array.isArray(inventory?.allItems)) return false;
    // A different tab may have captured inventory during the claim. Avoid double counting it.
    if (inventory.checkedAt !== claim.inventoryCheckedAt) {
      setCache('inventory', { ...inventory, needsReconcile: true, expiresAt: Date.now() });
      return false;
    }
    const counts = new Map(inventory.allItems.map(item => [item.key, { ...item }]));
    let changed = false;
    for (const item of claim.loot) {
      const key = item.image?.split('/').pop()?.split('?')[0];
      if (!key || item.name === 'Coins' || key === 'coin.png' || !Number.isFinite(item.amount) || item.amount <= 0) continue;
      const previous = counts.get(key);
      const amount = (previous?.amount || 0) + item.amount;
      const approximate = quantityIsApproximate(previous) || quantityIsApproximate(item);
      counts.set(key, { ...previous, key, name: previous?.name || item.name, image: previous?.image || item.image, amount, approximate, amountText: formatItemQuantity({ amount, approximate }) });
      changed = true;
    }
    if (!changed) return false;
    const allItems = [...counts.values()];
    const items = allItems.filter(item => /potion-divine-[\w-]+/.test(item.key)).map(item => ({
      ...item, slug: item.key.match(/potion-divine-[\w-]+/)[0]
    }));
    // Keep the full snapshot's age: collecting one item does not refresh every other item.
    setCache('inventory', { ...inventory, allItems, items, lootUpdatedAt: Date.now() });
    const scrolls = counts.get('challenge-scroll.png');
    if (scrolls && !quantityIsApproximate(scrolls) && claim.loot.some(item => item.image?.split('/').pop()?.split('?')[0] === 'challenge-scroll.png') && getCache().challenges) {
      setCache('challenges', { ...getCache().challenges, scrollsAvailable: scrolls.amount });
    }
    return true;
  }

  async function observeNativeLootClaim() {
    if (AppState.ui.collectingLoot || AppState.ui.pendingLootClaim) return;
    const claim = beginInventoryLootClaim();
    const receipt = observeCollectionRewards(globalThis, ['stopAction']);
    const route = location.pathname;
    try {
      const started = Date.now();
      while (Date.now() - started < 8000 && location.pathname === route) {
        await wait(100);
        if (findSkillStartButton()) { applyInventoryLootClaim(claim); render(); showCollectionRecap('Loot collected', receipt.rewards().length ? receipt.rewards() : claim.loot); return; }
      }
      showCollectionRecap('Loot collection stopped', receipt.rewards(), 'Ironwood did not confirm collection.');
    } finally {
      receipt.restore();
      if (AppState.ui.pendingLootClaim === claim) AppState.ui.pendingLootClaim = null;
    }
  }
  function divineConsumables(doc) {
    const card = [...doc.querySelectorAll('.card')].find((item) =>
      clean(item.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'
    );
    return [...(card?.querySelectorAll(':scope > .row, :scope > .items > button.item') || [])].map((row) => {
      const image = row.querySelector(':scope > .image img, img')?.getAttribute('src') || '';
      const slug = image.match(/potion-divine-[\w-]+/)?.[0];
      if (!slug) return null;
      return {
        slug,
        name: clean(row.querySelector('.description > .name, :scope > .name')?.textContent) || `Divine ${titleFromSlug(slug)} Potion`,
        amount: parseCompact(row.querySelector('.description > .amount, :scope > .amount')?.textContent),
        image
      };
    }).filter(Boolean);
  }
  function storeEquippedDivine(items, replace = false) {
    let equipped = [];
    try { equipped = JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'); } catch { equipped = []; }
    if (!Array.isArray(equipped)) equipped = [];
    equipped = equipped.filter((item) => item && typeof item.image === 'string' && item.image);
    items = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.image === 'string' && item.image);
    const map = new Map((replace ? [] : equipped).map((item) => [item.slug || item.image.split('/').pop(), item]));
    items.forEach((item) => map.set(item.slug || item.image.split('/').pop(), item));
    equipped = [...map.values()];
    const serialized = JSON.stringify(equipped);
    if (localStorage.getItem(EQUIPPED_KEY) !== serialized) localStorage.setItem(EQUIPPED_KEY, serialized);
    const cached = getCache().equipped?.items;
    if (JSON.stringify(cached) !== serialized) setCache('equipped', { items: equipped });
    return equipped;
  }
  function collectMastery(doc) {
    const root = doc.querySelector('mastery-page');
    const skillsCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => [...card.querySelectorAll(':scope > .row .name')]
        .some((name) => clean(name.textContent) === 'Woodcutting'));
    const completeSkills = [...(skillsCard?.querySelectorAll(':scope > .row') || [])]
      .filter((row) => clean(row.textContent).endsWith('Complete'))
      .map((row) => clean(row.querySelector(':scope > .name')?.textContent))
      .filter(Boolean);
    const data = { schema: 1, completeSkills };
    setCache('mastery', data);
    return data;
  }

  function recordMaterialChanges(materials, now = Date.now()) {
    const previous = AppState.live.previousMaterialValues;
    const notices = AppState.ui.materialDeltaNotices;
    const current = new Map();
    const inventoryUpdates = [];
    for (const item of materials) {
      if (!Number.isFinite(item.available)) continue;
      const key = item.image || item.name;
      current.set(key, item.approximate ? undefined : item.available);
      const before = previous.get(key);
      const delta = item.approximate || before === undefined ? 0 : item.available - before;
      if (before === undefined || delta) inventoryUpdates.push({ key: item.image?.split('/').pop()?.split('?')[0], amount: item.available, approximate: Boolean(item.approximate), name: item.name, image: item.image });
      if (delta && EventLedger.record(`material:${key}:${now}`, { delta }, 4000)) {
        notices.set(key, { delta, started: now, until: now + 4000 });
      }
    }
    for (const [key, notice] of notices) {
      if (notice.until <= now || !current.has(key)) notices.delete(key);
    }
    AppState.live.previousMaterialValues = current;
    setCachedInventoryQuantities(inventoryUpdates);
  }
