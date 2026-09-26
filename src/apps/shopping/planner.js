  // Discover the selected recipe graph before allocating any stock. Reverse
  // postorder gathers every parent's demand before a shared input is processed.
  function shoppingGraph(runtime, plan, catalog = shoppingRecipes(runtime)) {
    const planKey = JSON.stringify(plan), cache = AppState.ui.shoppingCatalog;
    if (cache.graph?.catalog === catalog && cache.graph.planKey === planKey) return cache.graph;
    const nodes = new Map(), order = [], active = new Set();
    function visit(id, special = false) {
      const key = `${special ? 'resource' : 'item'}:${id}`;
      if (nodes.has(key)) return nodes.get(key);
      const choices = special ? [] : catalog.byItem.get(id) || [];
      const saved = id === plan.itemId ? plan.recipeKey : plan.recipes?.[id];
      const recipeKey = saved || (id !== plan.itemId && choices.length === 1 ? choices[0].key : '');
      const sourceId = special ? plan.conversions?.[id] : null;
      const node = { id, key, special, recipeKey, sourceId, edges: [] };
      nodes.set(key, node);
      active.add(key);
      const conversion = special && shoppingConversionChoices(runtime, id).find(choice => choice.id === sourceId);
      const inputs = special ? conversion ? [{ id: sourceId, key: `item:${sourceId}`, name: conversion.name, perAttempt: 1 }] : []
        : shoppingDirectCalculate(runtime, { itemId: id, quantity: 1, recipeKey }).rows;
      for (const row of inputs) {
        const cycle = active.has(row.key);
        node.edges.push({ ...row, cycle });
        if (!cycle) visit(row.id, row.special);
      }
      active.delete(key);
      order.push(node);
      return node;
    }
    visit(plan.itemId);
    cache.graph = { catalog, planKey, order: order.reverse() };
    return cache.graph;
  }

  function shoppingCalculate(runtime, plan) {
    const catalog = shoppingRecipes(runtime), graph = shoppingGraph(runtime, plan, catalog);
    const demand = new Map([[`item:${plan.itemId}`, plan.quantity]]), calculated = new Map();
    const cycles = [], knownDemand = new Map([[`item:${plan.itemId}`, plan.quantity]]);
    for (const node of graph.order) {
      const required = demand.get(node.key) ?? (demand.has(node.key) ? null : 0);
      const knownRequired = knownDemand.get(node.key) || 0;
      const owned = shoppingPending(runtime) ? null : node.special ? shoppingNumber(runtime.state.user[node.id]) : shoppingOwned(runtime, node.id);
      const missing = required === 0 ? 0 : owned === null || required === null ? null : Math.max(0, required - owned);
      const used = owned === null || required === null ? null : Math.min(owned, required);
      const detail = node.special ? shoppingConversionDetail(runtime, node, required === null && owned !== null ? Math.max(0, knownRequired - owned) : missing) :
        shoppingDirectCalculate(runtime, { itemId: node.id, quantity: required ?? knownRequired, recipeKey: node.recipeKey });
      const knownAttempts = detail.attempts;
      if (required === null) {
        detail.attempts = null;
        detail.output = null;
      }
      // A covered intermediate needs no recipe or production, even if its
      // available recipes are uncertain, missing or cyclic.
      if (missing === 0) { detail.attempts = 0; detail.output = 0; detail.gaps = []; detail.fixed = true; }
      const row = { ...detail, id: node.id, key: node.key, special: node.special, recipeKey: node.recipeKey, sourceId: node.sourceId, production: Boolean(detail.chosen || detail.conversion),
        image: node.special ? SHOPPING_RESOURCE_IMAGES[node.id] : shoppingItem(runtime, node.id)?.image,
        required, knownRequired, owned, used, missing, acquire: missing, edges: [], surplus: detail.output === null || missing === null ? null : Math.max(0, (detail.output || 0) - missing) };
      if (owned === null && required !== 0) row.gaps.push('Owned balance unknown.');
      if (required === null) row.gaps.push('Required quantity unknown; upstream costs are incomplete.');
      calculated.set(node.key, row);
      for (const edge of node.edges) {
        const amount = missing === 0 ? 0 : row.attempts === null || edge.perAttempt === null ? null : shoppingNumber(row.attempts * edge.perAttempt);
        row.edges.push({ ...edge, required: amount });
        if (edge.cycle) {
          if (amount !== 0) {
            row.gaps.push(`Recipe cycle to ${edge.name}; this branch stops without reusing stock.`);
            cycles.push({ ...edge, required: amount, missing: amount, owned: null, used: null });
          }
        } else {
          const previous = demand.has(edge.key) ? demand.get(edge.key) : 0;
          const knownAmount = amount ?? (knownAttempts === null || knownAttempts === undefined || edge.perAttempt === null ? 0 : shoppingNumber(knownAttempts * edge.perAttempt));
          knownDemand.set(edge.key, shoppingNumber((knownDemand.get(edge.key) || 0) + (knownAmount || 0)));
          demand.set(edge.key, previous === null || amount === null ? null : shoppingNumber(previous + amount));
        }
      }
    }
    shoppingApplyWood(runtime, calculated);
    const nodes = [...calculated.values()];
    // Uncertainty travels back to every parent depending on that production.
    for (const row of [...nodes].reverse()) {
      const uncertain = row.edges.some(edge => !edge.cycle && calculated.get(edge.key)?.uncertain);
      const verifiedLeaf = row.special && !row.sourceId || !row.recipeKey && !catalog.byItem.has(row.id) && catalog.complete && shoppingItem(runtime, row.id);
      row.unresolved = !row.production && !verifiedLeaf;
      row.uncertain = row.missing !== 0 && (row.required === null || row.owned === null || uncertain
        || row.woodUncertain || (row.production ? !row.fixed || row.gaps.length > 0 : !verifiedLeaf));
      if (uncertain && row.missing !== 0) row.gaps.push('Uncertain recipe chain: intermediate requirements do not guarantee the target.');
      if (row.uncertain) row.fixed = false;
      const remaining = row.acquire;
      const insufficient = (!row.production && !row.unresolved && (remaining > 0 || row.required === null && row.owned !== null && row.knownRequired > row.owned))
        || row.edges.some(edge => !edge.cycle && edge.required !== 0 && calculated.get(edge.key)?.supply === 'insufficient');
      row.supply = row.missing === 0 ? 'covered' : insufficient ? 'insufficient' : row.uncertain ? 'unknown' : 'covered';
    }
    const root = calculated.get(`item:${plan.itemId}`);
    const leaves = nodes.filter(row => !row.production);
    const gaps = nodes.filter(row => row.missing !== 0 && row.uncertain);
    const result = { ...root, shortfall: root.missing, nodes, leaves, cycles, unresolved: gaps, incomplete: gaps.length > 0 || cycles.length > 0 };
    if (result.incomplete && !result.gaps.some(gap => gap.startsWith('Incomplete evidence'))) result.gaps = [...result.gaps, 'Incomplete evidence; known amounts are partial and cannot establish material coverage.'];
    return result;
  }

  // Reserve every recipe's stock before considering wood for conversion. Only
  // owned, unallocated logs contribute; projected crafted output never does.
  function shoppingApplyWood(runtime, calculated) {
    const charcoal = calculated.get('resource:charcoal');
    if (!charcoal) return;
    const choices = shoppingConversionChoices(runtime, 'charcoal').sort((a, b) => b.output - a.output || a.id.localeCompare(b.id));
    if (!choices.length) return;
    let remaining = charcoal.missing, output = 0, unknown = false;
    charcoal.wood = [];
    for (const choice of choices) {
      const key = `item:${choice.id}`, existing = calculated.get(key);
      const owned = shoppingPending(runtime) ? null : shoppingOwned(runtime, choice.id);
      const reserved = existing ? existing.required : 0;
      const available = owned === null || reserved === null || existing?.edges.length ? null : Math.max(0, Math.floor(owned - reserved));
      const used = remaining === null || available === null ? 0 : Math.min(available, Math.ceil(remaining / choice.output));
      const produced = shoppingNumber(used * choice.output);
      unknown ||= available === null || produced === null;
      charcoal.wood.push({ ...choice, owned, reserved, available, used, produced });
      if (!used || produced === null) continue;
      output = shoppingNumber(output + produced);
      if (output === null) { unknown = true; break; }
      remaining = Math.max(0, remaining - produced);
      charcoal.edges.push({ id: choice.id, key, name: choice.name, required: used, perAttempt: 1, wood: true });
      const row = existing || { id: choice.id, key, name: choice.name, image: shoppingItem(runtime, choice.id)?.image,
        special: false, recipeKey: '', choices: [], gaps: [], edges: [], required: 0, knownRequired: 0, owned, used: 0, missing: 0, acquire: 0, fixed: true };
      row.required += used;
      row.knownRequired += used;
      row.used += used;
      // Wood is a leaf. Process it before its new Charcoal parent in the
      // reverse supply pass, even when another recipe also consumes it.
      calculated.delete(key);
      calculated.set(key, row);
    }
    charcoal.woodOutput = output;
    charcoal.woodUncertain = remaining !== 0 && unknown;
    charcoal.acquire = charcoal.woodUncertain ? null : remaining;
    charcoal.surplus = output === null || charcoal.missing === null ? null : Math.max(0, output - charcoal.missing);
    if (charcoal.woodUncertain) charcoal.gaps.push('Some available wood balances are unknown; Charcoal coverage is incomplete.');
  }
