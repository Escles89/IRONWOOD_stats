  const MASTERY_SELECTION_KEY = 'iw-status-mastery-v1:';
  const masteryNumber = value => Number.isFinite(value) && value >= 0 ? value : null;
  const masteryRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const masteryImage = value => typeof value === 'string' && /^\/assets\/(?:items|misc)\/[\w/-]+\.(?:png|webp|svg)$/.test(value) ? value : '';

  function masteryCompletion(skills, id) {
    if (!masteryRecord(skills)) return null;
    if (!Object.hasOwn(skills, id)) return false;
    const progress = skills[id];
    if (!masteryRecord(progress)) return null;
    return progress.complete === undefined ? false : typeof progress.complete === 'boolean' ? progress.complete : null;
  }

  function validMasterySnapshot(snapshot, id) {
    const quantity = value => value === null || masteryNumber(value) !== null;
    const stamp = value => Number.isFinite(value) && value > 0 && value <= Date.now();
    return snapshot?.skillId === id && typeof snapshot.name === 'string' && snapshot.name.length <= 200
      && [null, true, false].includes(snapshot.complete) && typeof snapshot.needsReconcile === 'boolean'
      && ['xp', 'xpRequired', 'coins', 'coinsRequired'].every(key => quantity(snapshot[key]))
      && ['observedAt', 'contributionsAt', 'inventoryAt'].every(key => stamp(snapshot[key]))
      && (snapshot.rows === null || (Array.isArray(snapshot.rows) && snapshot.rows.length <= 100
        && snapshot.rows.every(row => quickId(row?.id) && typeof row.name === 'string' && row.name.length <= 200
          && (row.image === undefined || row.image === '' || masteryImage(row.image))
          && ['required', 'contributed', 'owned'].every(key => quantity(row[key])))
        && new Set(snapshot.rows.map(row => row.id)).size === snapshot.rows.length));
  }

  function persistMastery() {
    const ui = AppState.ui.mastery;
    if (!ui.owner || quickOwner(quickRuntime()) !== ui.owner) return;
    try { localStorage.setItem(MASTERY_SELECTION_KEY + ui.owner, JSON.stringify({ version: 1, selected: ui.selected, snapshots: ui.snapshots })); }
    catch { ui.message = 'Mastery selection and observations could not be saved in this browser.'; }
  }

  function masteryObserve(runtime = quickRuntime(), authoritative = false) {
    const ui = AppState.ui.mastery, owner = quickOwner(runtime);
    if (ui.owner !== owner) {
      Object.assign(ui, { owner, selected: '', snapshot: null, snapshots: {}, signature: '', message: '', choosing: false });
      if (owner) {
        try {
          const saved = JSON.parse(localStorage.getItem(MASTERY_SELECTION_KEY + owner));
          if (saved?.version === 1 && quickId(saved.selected)) {
            ui.selected = saved.selected;
            for (const [id, snapshot] of Object.entries(saved.snapshots || {})) {
              if (quickId(id) && validMasterySnapshot(snapshot, id)) ui.snapshots[id] = snapshot;
            }
            ui.snapshot = ui.snapshots[ui.selected] || null;
          }
        } catch {}
      }
    }
    if (!owner) return ui;
    const definition = runtime?.mastery, native = definition?.catalog?.[ui.selected];
    if (!native) return ui;
    const user = runtime.state.user, progress = user.masteries?.skills?.[ui.selected];
    const rows = masteryRecord(native.items) ? Object.entries(native.items).sort(([left], [right]) => (runtime.catalog?.[left]?.tier ?? Infinity) - (runtime.catalog?.[right]?.tier ?? Infinity)).map(([id, value]) => {
      const item = runtime.catalog?.[id], valid = quickId(id) && id === value && item && (!item.id || item.id === id);
      let required = null;
      try { if (valid && Number.isFinite(item.tier)) required = masteryNumber(definition.required(ui.selected, item.tier)); } catch {}
      return { id, name: valid && typeof item.name === 'string' ? item.name : `Unknown item (${id})`, required,
        image: valid ? masteryImage(`/assets/${item.image}`) : '',
        contributed: valid && masteryRecord(progress?.items) ? masteryNumber(Object.hasOwn(progress.items, id) ? progress.items[id] : 0) : null,
        owned: valid && masteryRecord(user.inventory) ? masteryNumber(Object.hasOwn(user.inventory, id) ? user.inventory[id]?.amount : 0) : null };
    }) : null;
    const snapshot = { skillId: ui.selected, name: native.name, rows,
      complete: masteryCompletion(user.masteries?.skills, ui.selected),
      xp: masteryNumber(user.skills?.[ui.selected]?.exp), xpRequired: masteryNumber(definition.exp),
      coins: masteryNumber(user.coins), coinsRequired: masteryNumber(definition.cost) };
    const signature = JSON.stringify(snapshot);
    if (signature !== ui.signature || authoritative) {
      const previous = ui.snapshots[ui.selected];
      const contributionsChanged = previous?.skillId === snapshot.skillId && JSON.stringify(previous.rows?.map(row => [row.id, row.contributed])) !== JSON.stringify(rows?.map(row => [row.id, row.contributed]));
      const inventoryChanged = !previous || JSON.stringify(previous.rows?.map(row => [row.id, row.owned])) !== JSON.stringify(rows?.map(row => [row.id, row.owned]));
      ui.signature = signature;
      ui.snapshot = { ...snapshot, observedAt: Date.now(),
        contributionsAt: !previous || contributionsChanged || authoritative ? Date.now() : previous.contributionsAt,
        inventoryAt: inventoryChanged || authoritative ? Date.now() : previous.inventoryAt,
        needsReconcile: !authoritative && Boolean(previous?.needsReconcile || contributionsChanged) };
      ui.snapshots[ui.selected] = ui.snapshot;
      persistMastery();
    }
    return ui;
  }

  function selectMastery(id) {
    const runtime = quickRuntime(), ui = masteryObserve(runtime);
    if (!ui.owner || !quickId(id) || runtime?.mastery?.catalog?.[id]?.id !== id) return;
    if (runtime.state.user.masteries?.skills?.[id]?.complete === true) return;
    ui.selected = id;
    ui.choosing = false;
    ui.snapshot = ui.snapshots[id] || null;
    ui.signature = '';
    persistMastery();
    render();
    document.querySelector('[data-mastery-settings]')?.focus();
  }

  async function refreshMastery() {
    const ui = masteryObserve(), owner = ui.owner;
    if (!owner || ui.refreshing || quickBusy()) return;
    ui.refreshing = true;
    ui.message = '';
    render();
    try {
      await synchronizeNativeGame();
      if (quickOwner(quickRuntime()) !== owner) throw new Error('Character changed during refresh.');
      masteryObserve(quickRuntime(), true);
    } catch (error) { ui.message = `Refresh unavailable: ${error.message}`; }
    finally { ui.refreshing = false; render(); }
  }
