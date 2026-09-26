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
      const node = { id, key, special, recipeKey, edges: [] };
      nodes.set(key, node);
      active.add(key);
      if (!special) {
        const direct = shoppingDirectCalculate(runtime, { itemId: id, quantity: 1, recipeKey });
        for (const row of direct.rows) {
          const cycle = active.has(row.key);
          node.edges.push({ ...row, cycle });
          if (!cycle) visit(row.id, row.special);
        }
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
      const detail = node.special ? { name: SHOPPING_RESOURCES[node.id], rows: [], gaps: [], fixed: true } :
        shoppingDirectCalculate(runtime, { itemId: node.id, quantity: required ?? knownRequired, recipeKey: node.recipeKey });
      const knownAttempts = detail.attempts;
      if (!node.special && required === null) {
        detail.attempts = null;
        detail.output = null;
      }
      // A covered intermediate needs no recipe or production, even if its
      // available recipes are uncertain, missing or cyclic.
      if (missing === 0) { detail.attempts = 0; detail.output = 0; detail.gaps = []; detail.fixed = true; }
      const row = { ...detail, id: node.id, key: node.key, special: node.special, recipeKey: node.recipeKey,
        image: node.special ? null : shoppingItem(runtime, node.id)?.image,
        required, knownRequired, owned, used, missing, edges: [], surplus: detail.output === null || missing === null ? null : Math.max(0, (detail.output || 0) - missing) };
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
    const nodes = [...calculated.values()];
    // Uncertainty travels back to every parent depending on that production.
    for (const row of [...nodes].reverse()) {
      const uncertain = row.edges.some(edge => !edge.cycle && calculated.get(edge.key)?.uncertain);
      const verifiedLeaf = row.special || !row.recipeKey && !catalog.byItem.has(row.id) && catalog.complete && shoppingItem(runtime, row.id);
      row.unresolved = !row.chosen && !verifiedLeaf;
      row.uncertain = row.missing !== 0 && (row.required === null || row.owned === null || uncertain
        || (row.chosen ? !row.fixed || row.gaps.length > 0 : !verifiedLeaf));
      if (uncertain && row.missing !== 0) row.gaps.push('Uncertain recipe chain: intermediate requirements do not guarantee the target.');
      if (row.uncertain) row.fixed = false;
      const insufficient = (!row.chosen && !row.unresolved && (row.missing > 0 || row.required === null && row.owned !== null && row.knownRequired > row.owned))
        || row.edges.some(edge => !edge.cycle && edge.required !== 0 && calculated.get(edge.key)?.supply === 'insufficient');
      row.supply = row.missing === 0 ? 'covered' : insufficient ? 'insufficient' : row.uncertain ? 'unknown' : 'covered';
    }
    const root = calculated.get(`item:${plan.itemId}`);
    const leaves = nodes.filter(row => row.special || !row.chosen);
    const gaps = nodes.filter(row => row.missing !== 0 && row.uncertain);
    const result = { ...root, shortfall: root.missing, nodes, leaves, cycles, unresolved: gaps, incomplete: gaps.length > 0 || cycles.length > 0 };
    if (result.incomplete && !result.gaps.some(gap => gap.startsWith('Incomplete evidence'))) result.gaps = [...result.gaps, 'Incomplete evidence; known amounts are partial and cannot establish material coverage.'];
    return result;
  }
