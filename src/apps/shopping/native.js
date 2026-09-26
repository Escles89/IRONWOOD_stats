  const SHOPPING_SKILLS = ['3', '4', '11', '12', '10', '16'];
  const SHOPPING_RESOURCES = { charcoal: 'Charcoal', compost: 'Compost', metalParts: 'Metal Parts', sigilPieces: 'Sigil Pieces', potionMix: 'Potion Mix', arcanePowder: 'Arcane Powder' };
  // Native main-client item artwork; these resources use top-level balances.
  const SHOPPING_RESOURCE_IMAGES = { charcoal: 'items/charcoal.png', compost: 'items/compost.png', metalParts: 'items/metal-parts.png', sigilPieces: 'items/sigil-pieces.png', potionMix: 'items/potion-mix.png', arcanePowder: 'items/arcane-powder.png' };
  const shoppingNumber = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  const shoppingQuantity = value => Number.isSafeInteger(value) && value > 0;
  const shoppingRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function shoppingItem(runtime, id) {
    const item = runtime?.catalog?.[id];
    return quickId(id) && item?.id === id && typeof item.name === 'string' ? item : null;
  }

  function shoppingOutputs(recipe) {
    const ids = new Set();
    let complete = true;
    const visit = (drops, depth = 0) => {
      if (!Array.isArray(drops) || depth > 10) { complete = false; return; }
      for (const drop of drops) {
        if (!shoppingRecord(drop)) { complete = false; continue; }
        if (quickId(drop.id)) ids.add(drop.id);
        else if (!drop.drops) complete = false;
        if (drop.drops) visit(drop.drops, depth + 1);
      }
    };
    visit(recipe.drops);
    if (recipe.failDrops) visit(recipe.failDrops);
    return { ids: [...ids], complete };
  }

  function shoppingRecipes(runtime) {
    const discovery = AppState.ui.shoppingCatalog;
    const cached = runtime && discovery.cache.get(runtime);
    if (cached && cached.skills === runtime.skillCatalog && cached.actions === runtime.actionCatalog && cached.items === runtime.catalog && cached.conversions === runtime.conversionCatalog) return cached;
    const recipes = [];
    let complete = Boolean(runtime?.catalog && runtime?.actionCatalog);
    for (const skillId of SHOPPING_SKILLS) {
      const skill = runtime?.skillCatalog?.[skillId];
      if (!Array.isArray(skill?.actions)) { complete = false; continue; }
      for (const member of skill.actions) {
        const recipe = runtime.actionCatalog?.[member?.id];
        if (!quickId(member?.id) || recipe?.id !== member.id || !Array.isArray(recipe.drops)) { complete = false; continue; }
        const outputs = shoppingOutputs(recipe);
        if (!outputs.complete) complete = false;
        recipes.push({ outputs: outputs.ids, key: `${skillId}:${recipe.id}`, skillId, skillName: skill.name, recipe });
      }
    }
    const index = { recipes, complete, byItem: new Map(), craftableItems: new Set(), revision: ++discovery.revision,
      skills: runtime?.skillCatalog, actions: runtime?.actionCatalog, items: runtime?.catalog, conversions: runtime?.conversionCatalog };
    for (const entry of recipes) {
      if (Array.isArray(entry.recipe.materials)) {
        for (const id of shoppingOutputs({ drops: entry.recipe.drops }).ids) index.craftableItems.add(id);
      }
    }
    for (const entry of recipes) for (const id of entry.outputs) {
      if (!index.byItem.has(id)) index.byItem.set(id, []);
      index.byItem.get(id).push(entry);
    }
    if (runtime) discovery.cache.set(runtime, index);
    return index;
  }

  function shoppingOwned(runtime, id) {
    const inventory = runtime?.state.user?.inventory;
    return shoppingItem(runtime, id) && shoppingRecord(inventory)
      ? shoppingNumber(Object.hasOwn(inventory, id) ? inventory[id]?.amount : 0) : null;
  }

  function shoppingDirectCalculate(runtime, plan) {
    const catalog = shoppingRecipes(runtime), item = shoppingItem(runtime, plan.itemId);
    const balancesAvailable = !shoppingPending(runtime);
    const owned = balancesAvailable ? shoppingOwned(runtime, plan.itemId) : null;
    const shortfall = owned === null ? null : Math.max(0, plan.quantity - owned);
    const choices = catalog.byItem.get(plan.itemId) || [];
    const chosen = choices.find(entry => entry.key === plan.recipeKey);
    const result = { name: item?.name || `Unknown item (${plan.itemId})`, owned, shortfall, choices, chosen, rows: [], gaps: [], fixed: false, attempts: null, output: null };
    if (!chosen) {
      result.gaps.push(plan.recipeKey ? 'Saved recipe is no longer available. Edit and choose a current recipe.' : choices.length ? 'Choose a current recipe to calculate materials.' : catalog.complete && item ? 'No current main crafting recipe. Acquire this item.' : 'Recipe data unresolved; no complete crafting catalog.');
      return result;
    }
    const { recipe, skillId, skillName } = chosen;
    const drop = recipe.drops.find(drop => drop?.id === plan.itemId) || {};
    const direct = drop.id === plan.itemId;
    // Ironwood's main-action drop reader rolls 1..amount, unlike House's
    // fixed amount. Only the single, always, one-item base drop is fixed.
    const supported = direct && Object.keys(drop).every(key => ['id', 'chance', 'amount'].includes(key));
    const unit = supported && (drop.amount === undefined || drop.amount === 1);
    result.yieldText = !supported || (drop.amount !== undefined && !shoppingQuantity(drop.amount)) ? 'Output quantity unresolved' : `${unit ? '1' : `1–${formatNumber(drop.amount)}`} ${item?.name || 'items'} per successful drop`;
    result.fixed = recipe.drops.length === 1 && drop.chance === 1000 && unit && !drop.drops && !recipe.failDrops;
    result.attempts = shortfall !== null && unit && recipe.drops.length === 1 && drop.chance === 1000 ? Math.ceil(shortfall) : null;
    result.output = result.attempts;
    if (!result.fixed) result.gaps.push('Uncertain output: per-attempt base costs; nominal totals do not guarantee the target.');
    if (owned === null) result.gaps.push('Owned finished quantity unknown.');
    const requirements = new Map();
    if (!Array.isArray(recipe.materials)) result.gaps.push('Recipe ingredients unavailable.');
    else for (const material of recipe.materials) {
      if (!quickId(material?.id)) { result.gaps.push('Unresolved ingredient or amount.'); continue; }
      const key = `item:${material.id}`, previous = requirements.get(key);
      if (!shoppingQuantity(material.amount)) result.gaps.push('Unresolved ingredient or amount.');
      requirements.set(key, { id: material.id, key, perAttempt: !shoppingQuantity(material.amount) || previous?.perAttempt === null ? null : shoppingNumber((previous?.perAttempt || 0) + material.amount) });
    }
    for (const [id, name] of Object.entries(SHOPPING_RESOURCES)) {
      if (!Object.hasOwn(recipe, id)) continue;
      const perAttempt = shoppingNumber(recipe[id]);
      if (perAttempt === 0) continue;
      requirements.set(`resource:${id}`, { id, key: `resource:${id}`, name, perAttempt, special: true });
    }
    for (const row of requirements.values()) {
      const nativeItem = shoppingItem(runtime, row.id);
      row.name = row.special ? row.name : nativeItem?.name || `Unknown item (${row.id})`;
      row.owned = !balancesAvailable ? null : row.special ? shoppingNumber(runtime.state.user[row.id]) : shoppingOwned(runtime, row.id);
      // Finished stock is already allocated toward the target; a self-input
      // cannot consume it a second time.
      if (!row.special && row.id === plan.itemId && row.owned !== null) row.owned = Math.max(0, row.owned - plan.quantity);
      row.required = result.attempts === null || row.perAttempt === null ? null : shoppingNumber(result.attempts * row.perAttempt);
      row.missing = row.owned === null || row.required === null ? null : Math.max(0, row.required - row.owned);
      row.intermediate = !row.special && catalog.byItem.has(row.id);
      result.rows.push(row);
    }
    if (result.rows.some(row => row.missing === null) || result.gaps.length) result.gaps.push('Incomplete evidence; known amounts are partial and cannot establish material coverage.');
    let level = null;
    try { const xp = shoppingNumber(runtime.state.user.skills?.[skillId]?.exp); if (xp !== null) level = runtime.skillLevel?.(xp); } catch {}
    result.eligibility = `Requires ${skillName} level ${recipe.level ?? 'unknown'}; current ${Number.isFinite(level) ? level : 'unknown'}. Native requirements still apply.`;
    if (recipe.uniqueCraft) result.eligibility += ' Unique craft; native ownership restrictions apply.';
    if (recipe.equipment) result.eligibility += ' Required equipment must be equipped on the native page.';
    return result;
  }

  function shoppingObservationKey(runtime, plan, index) {
    const graph = shoppingGraph(runtime, plan, index), user = runtime.state.user;
    return JSON.stringify([index.revision, plan,
      graph.order.map(node => node.special ? shoppingNumber(user[node.id]) : shoppingOwned(runtime, node.id)),
      SHOPPING_SKILLS.map(id => user.skills?.[id]?.exp), shoppingPending(runtime)]);
  }

  const SHOPPING_CONVERSIONS = ['potionMix', 'metalParts'];

  function shoppingConversionChoices(runtime, resource) {
    if (!SHOPPING_CONVERSIONS.includes(resource)) return [];
    return Object.entries(runtime?.conversionCatalog?.[resource] || {})
      .filter(([id, output]) => shoppingItem(runtime, id) && shoppingQuantity(output))
      .map(([id, output]) => ({ id, output, name: shoppingItem(runtime, id).name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function shoppingConversionDetail(runtime, node, missing) {
    const choices = shoppingConversionChoices(runtime, node.id);
    const conversion = choices.find(choice => choice.id === node.sourceId);
    const attempts = conversion && missing !== null ? Math.ceil(missing / conversion.output) : null;
    return { name: SHOPPING_RESOURCES[node.id], conversion, choices, rows: [],
      gaps: node.sourceId && !conversion ? ['Saved conversion input is unavailable. Choose a current input.'] : [],
      fixed: !node.sourceId || Boolean(conversion), attempts,
      output: attempts === null ? null : shoppingNumber(attempts * conversion.output) };
  }
