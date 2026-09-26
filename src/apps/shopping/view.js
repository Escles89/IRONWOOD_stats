  function renderShoppingCard() {
    if (location.pathname !== '/status') return '';
    const ui = AppState.ui.shopping, runtime = quickRuntime(), snapshot = ui.snapshot;
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const draft = ui.draft;
    const index = shoppingRecipes(runtime);
    const items = Object.values(runtime?.catalog || {}).filter(item => shoppingItem(runtime, item?.id) && index.craftableItems.has(item.id) && (item.id === draft.itemId || item.name.toLowerCase().includes(ui.filter.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
    const choices = (index.byItem.get(draft.itemId) || []);
    const invalidated = ui.plan?.itemId === draft.itemId && ui.plan.recipeKey && !choices.some(entry => entry.key === ui.plan.recipeKey);
    return `<section class="iw-card iw-shopping-card" aria-label="Finished-item shopping list"><div class="iw-card-header"><span>Shopping list</span><div class="iw-shopping-actions"><button type="button" class="iw-small-button" data-shopping-refresh ${!ui.owner || ui.refreshing || quickBusy() || shoppingPending(runtime) ? 'disabled' : ''}>${ui.refreshing ? 'Refreshing…' : 'Refresh'}</button>${ui.plan ? '<button type="button" class="iw-small-button" data-shopping-edit>Edit</button><button type="button" class="iw-small-button" data-shopping-clear>Clear</button>' : ''}</div></div><div class="iw-shopping-body">
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : ui.editing ? `<form data-shopping-form data-shopping-owner="${escapeHtml(ui.owner)}">
        <label>Filter items<input type="search" data-shopping-filter value="${escapeHtml(ui.filter)}"></label><label>Finished item<select name="item" required data-shopping-item><option value="">Choose an item</option>${items.map(item => `<option value="${item.id}" ${item.id === draft.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
        <label>Target owned quantity<input name="quantity" data-shopping-quantity type="number" min="1" step="1" required value="${escapeHtml(draft.quantity)}"></label>
        ${choices.length > 1 || invalidated ? `<label>Crafting recipe<select name="recipe" data-shopping-recipe><option value="">Choose a recipe</option>${choices.map(entry => `<option value="${entry.key}" ${entry.key === draft.recipeKey ? 'selected' : ''}>${escapeHtml(entry.skillName)} · ${escapeHtml(entry.recipe.name)}</option>`).join('')}</select></label>` : choices.length === 1 ? `<span>Crafted with ${escapeHtml(choices[0].skillName)} · ${escapeHtml(choices[0].recipe.name)}</span>` : ''}<button class="iw-small-button" type="submit">Save target</button>${ui.plan ? '<button type="button" class="iw-small-button" data-shopping-cancel>Cancel</button>' : ''}</form>` : ''}
      ${snapshot ? `${ui.unavailable ? '<p role="status">Last observation; current balances unavailable. Refresh when synchronization or collection finishes.</p>' : ''}<p><strong>${escapeHtml(snapshot.name)}</strong> · Target owned quantity ${amount(ui.plan.quantity)} · Owned ${amount(snapshot.owned)} · <strong>${snapshot.shortfall === 0 ? 'Target satisfied' : `${amount(snapshot.shortfall)} to acquire`}</strong></p>
        ${snapshot.gaps.map(gap => `<p>${escapeHtml(gap)}</p>`).join('')}
        ${snapshot.chosen ? `
        <p>${snapshot.leaves.filter(row => !row.unresolved).filter(row => row.missing !== 0).map(row => `${amount(row.missing)} ${escapeHtml(row.name)}${row.special ? ' (native balance)' : ''}`).join(' · ') || (!snapshot.incomplete && !ui.unavailable ? 'Base materials covered; finished items have not been crafted.' : 'Known inputs covered; complete material coverage is unconfirmed.')}</p>` : ''}
        ${snapshot.incomplete ? `<p><strong>Unresolved branches / uncertain production:</strong> ${[...snapshot.unresolved.map(row => `${escapeHtml(row.name)} — ${escapeHtml(row.gaps[0] || 'Uncertain recipe chain')}`), ...snapshot.cycles.map(row => `${amount(row.missing)} ${escapeHtml(row.name)} — recipe cycle; branch stopped`)].join(' · ')}</p>` : ''}
        <details data-shopping-details ${ui.expanded ? 'open' : ''}><summary>Full recipe chain</summary><p>Shared requirements are combined below. Owned stock is used once across this plan.</p>
          <p class="iw-muted">Click an item for step details. Red: materials insufficient · Amber: unknown or uncertain · Green: base materials covered.</p>
          ${renderShoppingTree(snapshot, ui)}
        </details>

        <p class="iw-muted">Observed ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60000))} min ago.</p>` : ''}
      <p class="iw-muted">Owned stock only, available to this single plan without reservations; excludes pending loot, queues, preservation savings and bonus output.</p>${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</div></section>`;
  }

  function renderShoppingStep(node, snapshot, ui) {
    const amount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);
    const escape = escapeHtml;
    const tableRows = node.edges.length ? node.edges.map(edge => ({ ...edge, total: snapshot.nodes.find(row => row.key === edge.key) })) : [{ ...node, total: node }];
    return `<details class="iw-shopping-step" id="iw-shopping-${escape(node.key.replace(':', '-'))}" data-shopping-step="${escape(node.key)}" ${ui.openSteps?.[node.key] ? 'open' : ''}>
      <summary>${renderShoppingIcon(node)}<span class="iw-shopping-node-label"><strong>${escape(node.name)}${node.special ? ' (native balance)' : ''}</strong><span>Required ${amount(node.required)} · ${amount(node.missing)} ${node.chosen ? 'to produce' : node.unresolved ? 'unresolved' : 'to acquire'}</span><small>${node.supply === 'insufficient' ? 'Materials insufficient' : node.supply === 'unknown' ? 'Incomplete / uncertain' : node.missing === 0 ? 'Covered by owned stock' : 'Base materials covered'}</small></span><span class="iw-shopping-disclosure" aria-hidden="true">›</span></summary>
      <div class="iw-shopping-step-detail">
      ${node.required === null ? `<p>Known required subtotal ${amount(node.knownRequired)}; complete requirement unknown.</p>` : ''}
      <p>Stock used ${amount(node.used)} · Required output ${amount(node.missing)}${node.chosen ? ` · ${node.attempts === null ? 'Attempt count unknown' : `${amount(node.attempts)} ${node.fixed ? 'base' : 'nominal'} attempts`} · Projected surplus ${amount(node.surplus)} (not owned inventory)` : ''}</p>
      ${node.chosen ? `<p>${escape(node.chosen.skillName)} · ${escape(node.chosen.recipe.name)}. ${escape(node.yieldText)}.</p><p>${escape(node.eligibility)}</p><a data-shopping-native-recipe="${node.chosen.key}" data-shopping-owner="${escape(ui.owner)}" href="/skill/${node.chosen.skillId}/action/${node.chosen.recipe.id}">Open native recipe</a>` : ''}
      ${!node.special && (node.choices.length > 1 || node.recipeKey && !node.chosen) ? `<label>Recipe for ${escape(node.name)}<select data-shopping-chain-recipe data-shopping-owner="${escape(ui.owner)}" data-shopping-recipe-item="${node.id}" ${ui.unavailable ? 'disabled' : ''}><option value="">Choose a current recipe</option>${node.choices.map(entry => `<option value="${entry.key}" ${entry.key === node.recipeKey ? 'selected' : ''}>${escape(entry.skillName)} · ${escape(entry.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${node.gaps.map(gap => `<p>${escape(gap)}</p>`).join('')}
      <table><caption>${node.edges.length ? 'Inputs for this step; Owned and Missing show the combined plan totals for each input.' : 'Combined requirement'}</caption><thead><tr><th>Ingredient</th><th>Per attempt</th><th>Required</th><th>Owned</th><th>Missing</th></tr></thead><tbody>${tableRows.map(row => `<tr><th>${escape(row.name)}${row.special ? '<small>Native balance</small>' : ''}${row.cycle ? '<small>Cycle: branch stopped</small>' : ''}</th>${[['Per attempt', row.perAttempt], ['Required', row.required], ['Owned', row.total?.owned], ['Missing', row.cycle ? row.required : row.total?.missing]].map(([label, value]) => `<td data-label="${label}">${amount(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
    </details>`;
  }

  function renderShoppingIcon(node) {
    const image = typeof node.image === 'string' && /^[a-zA-Z0-9/_\.-]+$/.test(node.image) && !node.image.includes('..') ? `/assets/${node.image}` : null;
    const initials = node.name.split(' ').slice(0, 2).map(word => word[0]).join('');
    return `<span class="iw-shopping-icon" data-supply="${node.supply}">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span aria-hidden="true">${escapeHtml(initials)}</span>`}<b aria-hidden="true">${node.supply === 'insufficient' ? '!' : node.supply === 'unknown' ? '?' : '✓'}</b></span>`;
  }

  function renderShoppingTree(snapshot, ui) {
    const nodes = new Map(snapshot.nodes.map(node => [node.key, node])), seen = new Set();
    function branch(node, edge = null) {
      const reference = seen.has(node.key);
      seen.add(node.key);
      const content = reference ? `<a class="iw-shopping-reference" href="#iw-shopping-${escapeHtml(node.key.replace(':', '-'))}" data-shopping-step-link="${escapeHtml(node.key)}">${renderShoppingIcon(node)}<span>${escapeHtml(node.name)}<small>${edge?.cycle ? 'Cycle stopped — inspect step' : 'Shared requirement — inspect combined step'}</small></span></a>` : renderShoppingStep(node, snapshot, ui);
      const children = reference ? '' : node.edges.map(input => {
        const child = nodes.get(input.key);
        return child ? branch(child, input) : '';
      }).join('');
      return `<li data-shopping-node="${escapeHtml(node.key)}" data-supply="${node.supply}">${content}${children ? `<ul class="iw-shopping-branches">${children}</ul>` : ''}</li>`;
    }
    return `<ul class="iw-shopping-tree">${branch(snapshot.nodes[0])}</ul>`;
  }
