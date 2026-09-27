  const SHOPPING_KEY = 'iw-status-shopping-v1:';

  function shoppingObserve(authoritative = false) {
    const ui = AppState.ui.shopping, runtime = quickRuntime(), owner = quickOwner(runtime);
    if (ui.owner !== owner) {
      Object.assign(ui, { owner, conversions: {}, plan: null, snapshot: null, signature: '', message: '', editing: true, draft: { itemId: '', quantity: '100', recipeKey: '' }, filter: '', selectedStep: null, expandedStep: null, refreshing: false, unavailable: false, revision: 0 });
      if (owner) {
        try {
          const saved = JSON.parse(localStorage.getItem(SHOPPING_KEY + owner));
          if (saved?.version === 1 && shoppingRecord(saved.conversions)) {
            for (const id of SHOPPING_CONVERSIONS) if (quickId(saved.conversions[id])) ui.conversions[id] = saved.conversions[id];
          }
          if (saved?.version === 1 && quickId(saved.plan?.itemId) && shoppingQuantity(saved.plan.quantity)
            && shoppingValidRecipeChoices(saved.plan.recipes)
            && typeof saved.plan.recipeKey === 'string' && /^(?:\d{1,10}:\d{1,10})?$/.test(saved.plan.recipeKey)) {
            ui.plan = saved.plan;
            if (!shoppingValidRecipeChoices(ui.plan.sources)) delete ui.plan.sources;
            if (!recipeValidQuantities(ui.plan.quantities || {})) delete ui.plan.quantities;
            ui.editing = false;
          }
        } catch {}
      }
    }
    if (!owner || !ui.plan) return ui;
    ui.unavailable = !runtime?.catalog || !runtime?.actionCatalog || !runtime?.skillCatalog
      || !shoppingRecord(runtime.state.user.inventory) || shoppingPending(runtime);
    if (ui.unavailable && ui.snapshot) return ui;
    const plan = { ...ui.plan, conversions: ui.conversions };
    const signature = shoppingObservationKey(runtime, plan, shoppingRecipes(runtime));
    if (signature !== ui.signature || authoritative) {
      ui.snapshot = { ...JSON.parse(JSON.stringify(shoppingCalculate(runtime, plan))), capacity: shoppingCapacity(runtime, plan), observedAt: Date.now() };
      const recipes = { ...ui.plan.recipes };
      let changed = false;
      for (const node of ui.snapshot.nodes) {
        if (node.id !== ui.plan.itemId && !node.special && node.chosen && !recipes[node.id]) {
          recipes[node.id] = node.chosen.key;
          changed = true;
        }
      }
      if (changed) { ui.plan.recipes = recipes; shoppingPersist(); }
      ui.signature = shoppingObservationKey(runtime, { ...ui.plan, conversions: ui.conversions }, shoppingRecipes(runtime));
      ui.revision = (ui.revision || 0) + 1;
    }
    return ui;
  }

  function shoppingPersist() {
    const ui = AppState.ui.shopping;
    try { localStorage.setItem(SHOPPING_KEY + ui.owner, JSON.stringify({ version: 1, plan: ui.plan, conversions: ui.conversions })); }
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
        ui.plan = { itemId, quantity, recipeKey: recipeKey || (choices.length === 1 ? choices[0].key : ''), recipes: ui.plan?.itemId === itemId ? { ...ui.plan.recipes } : {}, sources: ui.plan?.itemId === itemId ? { ...ui.plan.sources } : {}, quantities: {} };
        ui.editing = false;
        ui.selectedStep = null;
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
    ui.selectedStep = null;
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
    if (runtime?.recipePlanning) return false;
    return Boolean(runtime?.action?.actionLoading || runtime?.state?.loadingApp || runtime?.state?.syncingData
      || AppState.ui.pendingLootClaim || AppState.ui.collectingLoot || AppState.ui.nativeCollectionPending
      || AppState.ui.quickSkills.busy || AppState.ui.nativeSync?.running);
  }

  async function shoppingRefresh() {
    if (AppState.ui.recipePlan.open) return recipeRefresh();
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
    return [ui.owner, ui.revision, ui.plan, ui.conversions, ui.editing, ui.draft, ui.filter, ui.selectedStep, ui.expandedStep, ui.refreshing, ui.unavailable, ui.message,
      location.pathname, ui.plan ? Math.floor(Date.now() / 60000) : null];
  }

  function shoppingValidRecipeChoices(recipes) {
    return recipes === undefined || shoppingRecord(recipes) && Object.entries(recipes).every(([id, key]) => quickId(id) && typeof key === 'string' && /^\d{1,10}:\d{1,10}$/.test(key));
  }

  function shoppingChooseRecipe(control) {
    const owner = control.dataset.shoppingOwner, itemId = control.dataset.shoppingRecipeItem;
    const ui = shoppingObserve(), runtime = quickRuntime();
    if (!ui.plan || ui.owner !== owner || ui.unavailable || !quickId(itemId)) return;
    if (!ui.snapshot?.nodes.some(node => !node.special && node.id === itemId)) return;
    if (!(shoppingRecipes(runtime).byItem.get(itemId) || []).some(entry => entry.key === control.value)) return;
    if (itemId === ui.plan.itemId) ui.plan.recipeKey = control.value;
    else ui.plan.recipes = { ...ui.plan.recipes, [itemId]: control.value };
    ui.signature = '';
    ui.message = '';
    shoppingPersist();
    render();
  }

  function shoppingOpenStep(control) {
    const ui = shoppingObserve(), key = control.dataset.shoppingStepLink;
    if (!ui.owner || key !== 'defaults' && !ui.snapshot?.nodes.some(node => node.key === key)) return;
    if (!ui.selectedStep) AppState.ui.preferencesTrigger = control;
    AppState.ui.mastery.open = false;
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = false;
    if (ui.selectedStep !== key) ui.expandedStep = null;
    ui.selectedStep = key;
    render();
    document.querySelector('.iw-shopping-modal [data-modal-close]')?.focus();
  }

  async function shoppingOpenRecipe(control) {
    const ui = shoppingObserve(), runtime = quickRuntime();
    if (!ui.owner || ui.owner !== control.dataset.shoppingOwner || quickBusy() || shoppingPending(runtime)) return;
    const chosen = shoppingRecipes(runtime).recipes.find(entry => entry.key === control.dataset.shoppingNativeRecipe);
    if (!chosen) return;
    try {
      if (!runtime.router?.navigateByUrl) throw new Error('Open the recipe from its native skill page.');
      const route = `/skill/${chosen.skillId}/action/${chosen.recipe.id}`;
      if (runtime.router.url === route) { closePreferences(); leaveStats(); return; }
      const navigated = await runtime.zone.run(() => runtime.router.navigateByUrl(route));
      if (navigated === false) throw new Error('The native recipe page did not open.');
      closePreferences();
      leaveStats();
    } catch (error) {
      ui.message = error.message;
      render();
    }
  }

  function shoppingChooseConversion(control) {
    const owner = control.dataset.shoppingOwner, resource = control.dataset.shoppingResource;
    const ui = shoppingObserve(), runtime = quickRuntime();
    if (!ui.owner || ui.owner !== owner || shoppingPending(runtime) || !SHOPPING_CONVERSIONS.includes(resource)) return;
    if (control.value && !shoppingConversionChoices(runtime, resource).some(choice => choice.id === control.value)) return;
    ui.conversions = { ...ui.conversions };
    if (control.value) ui.conversions[resource] = control.value;
    else delete ui.conversions[resource];
    ui.signature = '';
    ui.message = '';
    shoppingPersist();
    render();
  }

  function shoppingToggleDetails(control) {
    const ui = AppState.ui.shopping;
    if (control.dataset.shoppingOwner !== ui.owner || control.dataset.shoppingStep !== ui.selectedStep) return;
    ui.expandedStep = control.open ? ui.selectedStep : null;
  }
