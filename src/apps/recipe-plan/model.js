  const RECIPE_GATHERING_SKILLS = ['1', '2', '13', '9', '5', '17'];

  function recipeValidPlan(plan) {
    return plan?.kind === 'recipe' && quickId(plan.target?.itemId) && shoppingQuantity(plan.target.quantity)
      && typeof plan.target.recipeKey === 'string' && /^(?:\d{1,10}:\d{1,10})?$/.test(plan.target.recipeKey)
      && shoppingValidRecipeChoices(plan.target.recipes) && shoppingRecord(plan.sources) && shoppingValidRecipeChoices(plan.sources)
      && shoppingRecord(plan.conversions) && Object.entries(plan.conversions).every(([id, source]) => SHOPPING_CONVERSIONS.includes(id) && quickId(source))
      && recipeValidQuantities(plan.quantities);
  }

  function recipeValidQuantities(quantities) {
    return shoppingRecord(quantities) && Object.entries(quantities).every(([key, amount]) => /^item:\d{1,10}$/.test(key) && quickAmount(amount));
  }

  function recipeCatalog(runtime) {
    const base = shoppingRecipes(runtime), cache = AppState.ui.recipePlan.catalogs;
    if (cache.has(base)) return cache.get(base);
    const recipes = [...base.recipes];
    for (const skillId of RECIPE_GATHERING_SKILLS) {
      const skill = runtime?.skillCatalog?.[skillId];
      for (const member of skill?.actions || []) {
        const recipe = runtime.actionCatalog?.[member.id];
        if (!quickId(recipe?.id) || recipe.id !== member.id || !Array.isArray(recipe.drops)) continue;
        recipes.push({ key: `${skillId}:${recipe.id}`, skillId, skillName: skill.name, recipe, gathering: true, outputs: shoppingOutputs({ drops: recipe.drops }).ids });
      }
    }
    const byItem = new Map();
    for (const entry of recipes) for (const id of entry.outputs) {
      if (!byItem.has(id)) byItem.set(id, []);
      byItem.get(id).push(entry);
    }
    const catalog = { ...base, recipes, byItem };
    cache.set(base, catalog);
    return catalog;
  }

  function recipeCalculate(runtime, plan) {
    const catalog = recipeCatalog(runtime);
    const target = { ...plan.target, conversions: plan.conversions, recipes: { ...plan.target.recipes, ...plan.sources } };
    // Calculation is pure with respect to activity locks. Callers separately
    // mark unavailable observations and guard every native mutation.
    const calculationRuntime = { ...runtime, recipePlanning: true };
    const snapshot = shoppingCalculate(calculationRuntime, target, catalog);
    const nodes = new Map(snapshot.nodes.map(node => [node.key, node]));
    const steps = [...snapshot.nodes].reverse().filter(node => node.missing !== 0).map(node => {
      const chosen = node.chosen;
      const target = chosen && { skillId: chosen.skillId, actionId: chosen.recipe.id, skillName: chosen.skillName, name: chosen.recipe.name, finite: !chosen.gathering && quickFiniteAction(chosen.skillId, chosen.recipe, runtime) };
      const supported = chosen?.recipe.drops?.[0]?.id === node.id && node.attempts !== null;
      const amount = target?.finite ? plan.quantities[node.key] ?? (supported ? Math.min(node.attempts, chosen.recipe.uniqueCraft ? 1 : 1000000) : null) : null;
      const blockers = node.edges.filter(edge => {
        if (edge.cycle) return true;
        const supply = nodes.get(edge.key);
        if (!target?.finite || !quickAmount(amount)) return edge.required !== 0 && (supply?.missing !== 0 || supply?.owned === null);
        const needed = edge.perAttempt === null ? null : shoppingNumber(edge.perAttempt * amount);
        // Reserve shared known demand before offering a partial native batch.
        // An unsupported yield retains unknown chain totals; a player's native
        // quantity only establishes the supplies for this particular start.
        const reserved = edge.required === null ? supply?.knownRequired : supply?.required === null ? null : Math.max(0, supply.required - edge.required);
        return needed === null || reserved === null || supply?.owned === null || !supply || supply.owned - reserved < needed;
      });
      let reason = !target ? node.special ? 'Manual conversion or acquisition required.' : node.gaps[0] || 'Choose a source or acquire manually.'
        : node.missing === null ? 'Required quantity or owned balance unknown.'
        : target.finite && !quickAmount(amount) ? 'Choose a native quantity; yield is uncertain.'
        : target.finite && chosen.recipe.uniqueCraft && amount !== 1 ? 'Unique craft requires one native quantity.'
        : blockers.length ? `Requires ${blockers.map(edge => edge.name).join(', ')} in owned inventory${blockers.some(edge => edge.cycle) ? ' · circular dependency' : ''}.`
        : plannedKnownReason(runtime, target);
      if (!reason && target?.finite) {
        let limit = null;
        try { limit = runtime.craftLimit?.(runtime.state.user, chosen.recipe); } catch {}
        if (!Number.isFinite(limit)) reason = 'Native material limit unknown.';
        else if (amount > limit) reason = 'Native quantity exceeds current supplies. Adjust the quantity.';
      }
      return { ...node, target, amount, ready: !!target && !reason, reason };
    });
    const running = steps.find(step => quickSameAction(step.target, runtime.state.user.action));
    const ready = steps.filter(step => step.ready && !quickSameAction(step.target, runtime.state.user.action));
    const next = ready.find(step => step.key === plan.selected) || ready[0] || (running ? steps.find(step => step.target && step !== running) : null) || null;
    return { ...snapshot, steps, running, next };
  }
