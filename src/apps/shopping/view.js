  function renderShoppingCard() {
    if (location.pathname !== '/status') return '';
    const ui = AppState.ui.shopping, runtime = quickRuntime(), snapshot = ui.snapshot;
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const draft = ui.draft;
    const index = shoppingRecipes(runtime);
    const items = Object.values(runtime?.catalog || {}).filter(item => shoppingItem(runtime, item?.id) && index.craftableItems.has(item.id) && (item.id === draft.itemId || item.name.toLowerCase().includes(ui.filter.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
    const choices = (index.byItem.get(draft.itemId) || []);
    const invalidated = ui.plan?.itemId === draft.itemId && ui.plan.recipeKey && !choices.some(entry => entry.key === ui.plan.recipeKey);
    return `<section class="iw-card iw-shopping-card" aria-label="Finished-item shopping list"><div class="iw-card-header"><span>Shopping list</span><div class="iw-shopping-actions"><button type="button" class="iw-small-button" data-shopping-step-link="defaults" aria-haspopup="dialog" ${!ui.owner ? 'disabled' : ''}>Inputs</button><button type="button" class="iw-small-button" data-shopping-refresh ${!ui.owner || ui.refreshing || quickBusy() || shoppingPending(runtime) ? 'disabled' : ''}>${ui.refreshing ? 'Refreshing…' : 'Refresh'}</button>${ui.plan ? '<button type="button" class="iw-small-button" data-shopping-edit>Edit</button><button type="button" class="iw-small-button" data-shopping-clear>Clear</button>' : ''}</div></div><div class="iw-shopping-body">
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : ui.editing ? `<form data-shopping-form data-shopping-owner="${escapeHtml(ui.owner)}">
        <label>Filter items<input type="search" data-shopping-filter value="${escapeHtml(ui.filter)}"></label><label>Finished item<select name="item" required data-shopping-item><option value="">Choose an item</option>${items.map(item => `<option value="${item.id}" ${item.id === draft.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
        <label>Target owned quantity<input name="quantity" data-shopping-quantity type="number" min="1" step="1" required value="${escapeHtml(draft.quantity)}"></label>
        ${choices.length > 1 || invalidated ? `<label>Crafting recipe<select name="recipe" data-shopping-recipe><option value="">Choose a recipe</option>${choices.map(entry => `<option value="${entry.key}" ${entry.key === draft.recipeKey ? 'selected' : ''}>${escapeHtml(entry.skillName)} · ${escapeHtml(entry.recipe.name)}</option>`).join('')}</select></label>` : choices.length === 1 ? `<span>Crafted with ${escapeHtml(choices[0].skillName)} · ${escapeHtml(choices[0].recipe.name)}</span>` : ''}<button class="iw-small-button" type="submit">Save target</button>${ui.plan ? '<button type="button" class="iw-small-button" data-shopping-cancel>Cancel</button>' : ''}</form>` : ''}
      ${snapshot ? `${ui.unavailable ? '<p role="status">Showing last observation. Current balances unavailable.</p>' : ''}
        <p class="iw-shopping-target"><strong>${escapeHtml(snapshot.name)}</strong><span>Target ${amount(ui.plan.quantity)} · Owned ${amount(snapshot.owned)} · ${snapshot.shortfall === 0 ? 'Target satisfied' : `${amount(snapshot.shortfall)} to acquire`}</span></p>
        <p class="iw-shopping-shortage">${snapshot.leaves.filter(row => !row.unresolved && row.missing !== 0).map(row => `${amount(row.missing)} ${escapeHtml(row.name)}`).join(' · ') || (snapshot.incomplete || ui.unavailable ? 'Some requirements are unknown.' : snapshot.shortfall === 0 ? '' : 'Materials covered.')}${snapshot.incomplete ? ' · Incomplete plan — inspect warning icons.' : ''}</p>
        <div class="iw-shopping-tree-scroll" aria-label="Recipe chain">${renderShoppingTree(snapshot)}</div>
        <p class="iw-muted iw-shopping-age">Observed ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60000))} min ago.</p>` : ''}
      ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</div></section>`;
  }

  function renderShoppingModal() {
    if (location.pathname !== '/status' || AppState.ui.page?.hidden) { AppState.ui.shopping.selectedStep = null; return ''; }
    const ui = shoppingObserve(), snapshot = ui.snapshot;
    const defaults = ui.selectedStep === 'defaults';
    const node = defaults ? { name: 'Default inputs' } : snapshot?.nodes.find(row => row.key === ui.selectedStep);
    if (location.pathname !== '/status' || !node) { ui.selectedStep = null; return ''; }
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-shopping-modal" role="dialog" aria-modal="true" aria-labelledby="iw-shopping-step-title">
      <div class="iw-options-heading">${defaults ? '' : renderShoppingIcon(node)}<div><h2 id="iw-shopping-step-title">${escapeHtml(node.name)}</h2><small>${defaults ? 'Saved for this character and game mode' : `${node.special ? 'Resource balance' : 'Inventory'} · ${shoppingSupplyLabel(node)}`}</small></div><button type="button" class="iw-modal-close" data-modal-close aria-label="Close item details">×</button></div>
      <div class="iw-shopping-body">${ui.unavailable ? '<p role="status">Showing last observation. Current balances unavailable.</p>' : ''}${defaults ? SHOPPING_CONVERSIONS.map(id => renderShoppingConversion(id, ui)).join('') : renderShoppingStep(node, snapshot, ui)}
        ${!defaults ? `<p class="iw-muted">Owned stock only. Pending loot and bonus output are excluded. Observed ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60000))} min ago.</p>` : ''}
        ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</div>
    </section></div>`;
  }

  function renderShoppingStep(node, snapshot, ui) {
    const amount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);
    const escape = escapeHtml;
    const columns = node.edges.length ? ['Per attempt', 'Required', 'Owned', 'Missing'] : ['Required', 'Owned', 'Stock used', 'Missing'];
    const tableRows = node.edges.length ? node.edges.map(edge => ({ ...edge, total: snapshot.nodes.find(row => row.key === edge.key) })) : [{ ...node, total: node }];
    return `<div class="iw-shopping-step-detail">
      ${node.production ? `<p>Required ${amount(node.required)} · Owned ${amount(node.owned)} · ${amount(node.missing)} to produce</p>` : ''}
      ${node.required === null ? `<p>Known required subtotal ${amount(node.knownRequired)}; complete requirement unknown.</p>` : ''}
      ${node.production ? `<p>Stock used ${amount(node.used)} · Required output ${amount(node.missing)} · ${node.attempts === null ? 'Attempt count unknown' : `${amount(node.attempts)} ${node.conversion ? 'conversions' : `${node.fixed ? 'base' : 'nominal'} attempts`}`} · Projected surplus ${amount(node.surplus)} (not owned inventory)</p>` : ''}
      ${node.conversion ? `<p>1 ${escape(node.conversion.name)} → ${amount(node.conversion.output)} ${escape(node.name)}</p>` : ''}
      ${node.special && SHOPPING_CONVERSIONS.includes(node.id) ? renderShoppingConversion(node.id, ui) : ''}
      ${node.chosen ? `<p>${escape(node.chosen.skillName)} · ${escape(node.chosen.recipe.name)}. ${escape(node.yieldText)}.</p><p>${escape(node.eligibility)}</p><a data-shopping-native-recipe="${node.chosen.key}" data-shopping-owner="${escape(ui.owner)}" href="/skill/${node.chosen.skillId}/action/${node.chosen.recipe.id}">Open native recipe</a>` : ''}
      ${!node.special && (node.choices.length > 1 || node.recipeKey && !node.chosen) ? `<label>Recipe for ${escape(node.name)}<select data-shopping-chain-recipe data-shopping-owner="${escape(ui.owner)}" data-shopping-recipe-item="${node.id}" ${ui.unavailable ? 'disabled' : ''}><option value="">Choose a current recipe</option>${node.choices.map(entry => `<option value="${entry.key}" ${entry.key === node.recipeKey ? 'selected' : ''}>${escape(entry.skillName)} · ${escape(entry.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${node.gaps.map(gap => `<p>${escape(gap)}</p>`).join('')}
      <table><caption>${node.edges.length ? 'Inputs for this step; Owned and Missing show the combined plan totals for each input.' : 'Combined requirement'}</caption><thead><tr><th>Ingredient</th>${columns.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${tableRows.map(row => `<tr><th>${escape(row.name)}<small>${row.special ? 'Resource balance' : 'Inventory'}</small>${row.cycle ? '<small>Cycle: branch stopped</small>' : ''}</th>${[['Per attempt', row.perAttempt], ['Required', row.required], ['Owned', row.total?.owned], ['Stock used', row.total?.used], ['Missing', row.cycle ? row.required : row.total?.missing]].filter(([label]) => columns.includes(label)).map(([label, value]) => `<td data-label="${label}">${amount(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>`;
  }

  function renderShoppingIcon(node) {
    const image = typeof node.image === 'string' && /^[a-zA-Z0-9/_\.-]+$/.test(node.image) && !node.image.includes('..') ? `/assets/${node.image}` : null;

    return `<span class="iw-shopping-icon" data-supply="${node.supply}">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span aria-hidden="true">?</span>`}${node.supply !== 'covered' ? `<b aria-hidden="true">${node.supply === 'insufficient' ? '!' : '?'}</b>` : ''}</span>`;
  }

  function shoppingSupplyLabel(node) {
    return node.supply === 'insufficient' ? 'Materials insufficient' : node.supply === 'unknown' ? 'Incomplete / uncertain' : node.missing === 0 ? 'Covered by owned stock' : 'Base materials covered';
  }

  function renderShoppingTree(snapshot) {
    const nodes = new Map(snapshot.nodes.map(node => [node.key, node])), seen = new Set();
    function branch(node, edge = null) {
      const reference = seen.has(node.key);
      seen.add(node.key);
      const note = edge?.cycle ? ' · Cycle stopped' : reference ? ' · Shared requirement' : '';
      const label = `${node.name} — ${shoppingSupplyLabel(node)}${note}${node.special ? ' · Resource balance' : ''}`;
      const content = `<button type="button" class="iw-shopping-node" data-shopping-step-link="${escapeHtml(node.key)}" aria-haspopup="dialog" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${renderShoppingIcon(node)}</button>`;
      const children = reference ? '' : node.edges.map(input => {
        const child = nodes.get(input.key);
        return child ? branch(child, input) : '';
      }).join('');
      return `<li data-shopping-node="${escapeHtml(node.key)}" data-supply="${node.supply}">${content}${children ? `<ul class="iw-shopping-branches">${children}</ul>` : ''}</li>`;
    }
    return `<ul class="iw-shopping-tree">${branch(snapshot.nodes[0])}</ul>`;
  }

  function renderShoppingConversion(resource, ui) {
    const choices = shoppingConversionChoices(quickRuntime(), resource), selected = ui.conversions?.[resource] || '';
    const invalidated = selected && !choices.some(choice => choice.id === selected);
    return `<label>${escapeHtml(SHOPPING_RESOURCES[resource])} input<select data-shopping-conversion data-shopping-resource="${resource}" data-shopping-owner="${escapeHtml(ui.owner)}" ${shoppingPending(quickRuntime()) ? 'disabled' : ''}>
      <option value="" ${!selected ? 'selected' : ''}>Use resource balance only</option>
      ${invalidated ? `<option value="${selected}" selected>Saved input unavailable</option>` : ''}
      ${choices.map(choice => `<option value="${choice.id}" ${choice.id === selected ? 'selected' : ''}>${escapeHtml(choice.name)} · ${formatNumber(choice.output)} per item</option>`).join('')}</select></label>${!choices.length ? '<p>Conversion recipes unavailable.</p>' : ''}`;
  }
