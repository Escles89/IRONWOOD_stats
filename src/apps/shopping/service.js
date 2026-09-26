  const SHOPPING_KEY = 'iw-status-shopping-v1:';

  function shoppingObserve(authoritative = false) {
    const ui = AppState.ui.shopping, runtime = quickRuntime(), owner = quickOwner(runtime);
    if (ui.owner !== owner) {
      Object.assign(ui, { owner, plan: null, snapshot: null, signature: '', message: '', editing: true, draft: { itemId: '', quantity: '100', recipeKey: '' }, filter: '', expanded: false, refreshing: false, unavailable: false, revision: 0 });
      if (owner) {
        try {
          const saved = JSON.parse(localStorage.getItem(SHOPPING_KEY + owner));
          if (saved?.version === 1 && quickId(saved.plan?.itemId) && shoppingQuantity(saved.plan.quantity)
            && typeof saved.plan.recipeKey === 'string' && /^(?:\d{1,10}:\d{1,10})?$/.test(saved.plan.recipeKey)) {
            ui.plan = saved.plan;
            ui.editing = false;
          }
        } catch {}
      }
    }
    if (!owner || !ui.plan) return ui;
    ui.unavailable = !runtime?.catalog || !runtime?.actionCatalog || !runtime?.skillCatalog
      || !shoppingRecord(runtime.state.user.inventory) || shoppingPending(runtime);
    if (ui.unavailable && ui.snapshot) return ui;
    const signature = shoppingObservationKey(runtime, ui.plan, shoppingRecipes(runtime));
    if (signature !== ui.signature || authoritative) {
      ui.snapshot = { ...JSON.parse(JSON.stringify(shoppingCalculate(runtime, ui.plan))), observedAt: Date.now() };
      ui.signature = signature;
      ui.revision = (ui.revision || 0) + 1;
    }
    return ui;
  }

  function shoppingPersist() {
    const ui = AppState.ui.shopping;
    try { localStorage.setItem(SHOPPING_KEY + ui.owner, JSON.stringify({ version: 1, plan: ui.plan })); }
    catch { ui.message = 'Shopping list could not be saved in this browser.'; }
  }

  function shoppingSave(form) {
    const formOwner = form.dataset.shoppingOwner, ui = shoppingObserve(), runtime = quickRuntime();
    if (!ui.owner || ui.owner !== formOwner) return;
    const itemId = form.querySelector('[name="item"]').value, quantity = Number(form.querySelector('[name="quantity"]').value);
    const recipeKey = form.querySelector('[name="recipe"]')?.value || '';
    if (!shoppingItem(runtime, itemId) || !shoppingQuantity(quantity)) ui.message = 'Choose an item and a positive whole-number Target owned quantity.';
    else {
      const choices = (shoppingRecipes(runtime).byItem.get(itemId) || []);
      const invalidated = ui.plan?.itemId === itemId && ui.plan.recipeKey && !choices.some(entry => entry.key === ui.plan.recipeKey);
      if ((recipeKey && !choices.some(entry => entry.key === recipeKey)) || (invalidated && !recipeKey)) ui.message = 'Choose a current recipe.';
      else {
        ui.plan = { itemId, quantity, recipeKey: recipeKey || (choices.length === 1 ? choices[0].key : '') };
        ui.editing = false;
        ui.signature = '';
        ui.snapshot = null;
        ui.message = '';
        shoppingPersist();
      }
    }
    AppState.ui.lastSignature = '';
    render();
  }

  function shoppingEdit() {
    const ui = shoppingObserve();
    if (!ui.owner) return;
    ui.editing = true;
    ui.draft = ui.plan ? { ...ui.plan, quantity: String(ui.plan.quantity) } : { itemId: '', quantity: '100', recipeKey: '' };
    ui.filter = '';
    render();
    document.querySelector('[data-shopping-item]')?.focus();
  }

  function shoppingClear() {
    const ui = shoppingObserve();
    if (!ui.owner) return;
    ui.plan = null;
    ui.snapshot = null;
    ui.signature = '';
    ui.message = '';
    shoppingPersist();
    shoppingEdit();
  }

  function shoppingDraft(control) {
    const ui = shoppingObserve();
    if (!ui.owner || !ui.editing) return;
    if (control.matches('[data-shopping-item]')) { ui.draft.itemId = control.value; ui.draft.recipeKey = ''; }
    if (control.matches('[data-shopping-recipe]')) ui.draft.recipeKey = control.value;
    if (control.matches('[data-shopping-quantity]')) ui.draft.quantity = control.value;
    if (control.matches('[data-shopping-filter]')) ui.filter = control.value;
    render();
  }

  function shoppingPending(runtime) {
    return Boolean(runtime?.action?.actionLoading || runtime?.state?.loadingApp || runtime?.state?.syncingData
      || AppState.ui.pendingLootClaim || AppState.ui.collectingLoot || AppState.ui.nativeCollectionPending
      || AppState.ui.quickSkills.busy || AppState.ui.nativeSync?.running);
  }

  async function shoppingRefresh() {
    const ui = shoppingObserve(), owner = ui.owner;
    if (!owner || ui.refreshing || quickBusy() || shoppingPending(quickRuntime())) return;
    ui.refreshing = true;
    ui.message = '';
    render();
    try {
      await synchronizeNativeGame();
      if (quickOwner(quickRuntime()) !== owner) return;
      shoppingObserve(true);
    } catch (error) {
      if (quickOwner(quickRuntime()) === owner) ui.message = `Refresh unavailable: ${error.message}`;
    } finally {
      if (ui.owner === owner) ui.refreshing = false;
      render();
    }
  }

  function shoppingRenderKey() {
    const ui = AppState.ui.shopping;
    return [ui.owner, ui.revision, ui.plan, ui.editing, ui.draft, ui.filter, ui.expanded, ui.refreshing, ui.unavailable, ui.message,
      location.pathname, ui.plan ? Math.floor(Date.now() / 60000) : null];
  }
