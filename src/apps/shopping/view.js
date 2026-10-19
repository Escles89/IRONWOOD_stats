  function renderShoppingCard(inPlanner = false) {
    if (!inPlanner && location.pathname !== '/status') return '';
    const ui = AppState.ui.shopping, runtime = quickRuntime(), snapshot = ui.snapshot;
    const draft = ui.draft;
    const index = shoppingRecipes(runtime);
    const items = Object.values(runtime?.catalog || {}).filter(item => shoppingItem(runtime, item?.id) && index.craftableItems.has(item.id) && (item.id === draft.itemId || item.name.toLowerCase().includes(ui.filter.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
    const choices = (index.byItem.get(draft.itemId) || []);
    const invalidated = ui.plan?.itemId === draft.itemId && ui.plan.recipeKey && !choices.some(entry => entry.key === ui.plan.recipeKey);
    return `<section class="iw-card iw-shopping-card" aria-label="Recipe Calc"><div class="iw-card-header"><span class="iw-shopping-brand">Recipe Calc<sup>™</sup></span><div class="iw-shopping-actions">${!ui.editing ? '<button type="button" class="iw-shopping-tool" data-shopping-edit>Edit</button>' : ''}</div></div><div class="iw-shopping-body">
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : ui.editing && (inPlanner || !AppState.ui.recipePlan.open) ? `<form data-shopping-form data-shopping-owner="${escapeHtml(ui.owner)}">
        <label>Filter items<input type="search" data-shopping-filter value="${escapeHtml(ui.filter)}"></label><label>Finished item<select name="item" required data-shopping-item><option value="">Choose an item</option>${items.map(item => `<option value="${item.id}" ${item.id === draft.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
        <label>Target owned quantity<input name="quantity" data-shopping-quantity type="number" min="1" step="1" required value="${escapeHtml(draft.quantity)}"></label>
        ${choices.length > 1 || invalidated ? `<label>Crafting recipe<select name="recipe" data-shopping-recipe><option value="">Choose a recipe</option>${choices.map(entry => `<option value="${entry.key}" ${entry.key === draft.recipeKey ? 'selected' : ''}>${escapeHtml(entry.skillName)} · ${escapeHtml(entry.recipe.name)}</option>`).join('')}</select></label>` : choices.length === 1 ? `<span>Crafted with ${escapeHtml(choices[0].skillName)} · ${escapeHtml(choices[0].recipe.name)}</span>` : ''}<div class="iw-shopping-edit-actions"><button class="iw-small-button" type="submit">Save &amp; run plan</button><button type="button" class="iw-small-button" data-shopping-step-link="defaults" aria-haspopup="dialog">Inputs</button>${ui.plan ? '<button type="button" class="iw-small-button" data-shopping-cancel>Cancel</button><button type="button" class="iw-shopping-clear" data-shopping-clear>Clear target</button>' : ''}</div></form>` : ''}
      ${snapshot && (!inPlanner || !ui.editing) ? `${ui.unavailable ? '<p role="status">Showing last observation. Current balances unavailable.</p>' : ''}
        ${renderShoppingOverview(snapshot, ui)}<div class="iw-shopping-plan-layout"><div class="iw-shopping-calculation">${renderShoppingShortages(snapshot, ui)}${renderRecipeOverview()}</div><section class="iw-shopping-chain" aria-label="Recipe chain"><div class="iw-shopping-section-heading"><strong>Recipe chain</strong><span class="iw-shopping-legend"><span data-kind="owned">Owned</span><span data-kind="craftable">Craftable</span></span></div><div class="iw-shopping-tree-scroll">${renderShoppingTree(snapshot)}</div></section></div>
        <p class="iw-muted iw-shopping-age">Observed ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60000))} min ago.</p>` : ''}
      ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</div></section>`;
  }

  function renderShoppingModal() {
    if (!AppState.ui.recipePlan.open && (location.pathname !== '/status' || AppState.ui.page?.hidden)) { AppState.ui.shopping.selectedStep = null; return ''; }
    const ui = shoppingObserve(), snapshot = ui.snapshot;
    const defaults = ui.selectedStep === 'defaults';
    const node = defaults ? { name: 'Default inputs' } : snapshot?.nodes.find(row => row.key === ui.selectedStep);
    if (!node) { ui.selectedStep = null; return ''; }
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-shopping-modal" role="dialog" aria-modal="true" aria-labelledby="iw-shopping-step-title">
      <div class="iw-options-heading">${defaults ? '' : renderShoppingIcon(node)}<div><h2 id="iw-shopping-step-title">${escapeHtml(node.name)}</h2><small>${defaults ? 'Saved for this character and game mode' : `${node.special ? 'Resource balance' : 'Inventory'} · ${shoppingSupplyLabel(node)}`}</small></div><button type="button" class="iw-modal-close" data-modal-close aria-label="Close item details">×</button></div>
      <div class="iw-shopping-body">${ui.unavailable ? '<p role="status">Showing last observation. Current balances unavailable.</p>' : ''}${defaults ? SHOPPING_CONVERSIONS.map(id => renderShoppingConversion(id, ui)).join('') : renderShoppingStep(node, snapshot, ui)}
        ${!defaults ? `<p class="iw-muted iw-shopping-footnote">Excludes pending loot and bonus output · Observed ${Math.max(0, Math.floor((Date.now() - snapshot.observedAt) / 60000))} min ago.</p>` : ''}
        ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</div>
    </section></div>`;
  }

  function renderShoppingStep(node, snapshot, ui) {
    const amount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);
    const escape = escapeHtml;
    const columns = node.edges.length ? ['Per attempt', 'Required', 'Owned', 'Missing'] : ['Required', 'Owned', 'Stock used', 'Missing'];
    const tableRows = node.edges.length ? node.edges.map(edge => ({ ...edge, total: snapshot.nodes.find(row => row.key === edge.key) })) : [{ ...node, total: node }];
    return `<div class="iw-shopping-step-detail">
      ${node.production ? `<dl class="iw-shopping-metrics"><div><dt>Required</dt><dd>${amount(node.required)}</dd></div><div><dt>Owned</dt><dd>${amount(node.owned)}</dd></div><div><dt>To produce</dt><dd>${amount(node.missing)}</dd></div></dl><p class="iw-shopping-attempts">${node.attempts === null ? 'Attempt count unknown' : `${amount(node.attempts)} ${node.conversion ? 'conversions' : `${node.fixed ? 'base' : 'nominal'} attempts`}`}</p>` : ''}
      ${node.required === null ? `<p>Known required subtotal ${amount(node.knownRequired)}; complete requirement unknown.</p>` : ''}

      ${node.spareInputs ? renderShoppingSpareInputs(node) : ''}
      ${node.conversion ? `<p>1 ${escape(node.conversion.name)} → ${amount(node.conversion.output)} ${escape(node.name)}</p>` : ''}
      ${node.special && SHOPPING_CONVERSIONS.includes(node.id) ? renderShoppingConversion(node.id, ui) : ''}
      ${node.chosen ? `<div class="iw-shopping-recipe-bar"><span>${escape(node.chosen.skillName)} · Level ${escape(node.chosen.recipe.level ?? 'unknown')}</span><a data-shopping-native-recipe="${node.chosen.key}" data-shopping-owner="${escape(ui.owner)}" href="/skill/${node.chosen.skillId}/action/${node.chosen.recipe.id}">Open recipe ↗</a></div>` : ''}
      ${node.production ? `<details class="iw-shopping-recipe-details" data-shopping-recipe-details data-shopping-owner="${escape(ui.owner)}" data-shopping-step="${escape(node.key)}" ${ui.expandedStep === node.key ? 'open' : ''}><summary>Recipe details</summary>${node.chosen ? `<p>${escape(node.yieldText)}.</p><p>${escape(node.eligibility)}</p>` : ''}<div class="iw-shopping-extra"><span>Stock used ${amount(node.used)}</span><span>Required output ${amount(node.missing)}</span><span>Projected surplus ${amount(node.surplus)} (not owned inventory)</span></div></details>` : ''}
      ${!node.special && (node.choices.length > 1 || node.recipeKey && !node.chosen) ? `<label>Recipe for ${escape(node.name)}<select data-shopping-chain-recipe data-shopping-owner="${escape(ui.owner)}" data-shopping-recipe-item="${node.id}" ${ui.unavailable ? 'disabled' : ''}><option value="">Choose a current recipe</option>${node.choices.map(entry => `<option value="${entry.key}" ${entry.key === node.recipeKey ? 'selected' : ''}>${escape(entry.skillName)} · ${escape(entry.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${node.gaps.map(gap => `<p>${escape(gap)}</p>`).join('')}
      ${node.spareInputs ? '' : `<table><caption>${node.edges.length ? 'Ingredients · balances shared across the plan' : 'Combined requirement'}</caption><thead><tr><th>Ingredient</th>${columns.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${tableRows.map(row => `<tr><th>${escape(row.name)}<small>${row.special ? 'Resource balance' : 'Inventory'}</small>${row.cycle ? '<small>Cycle: branch stopped</small>' : ''}</th>${[['Per attempt', row.perAttempt], ['Required', row.required], ['Owned', row.total?.owned], ['Stock used', row.total?.used], ['Missing', row.cycle ? row.required : row.total?.missing]].filter(([label]) => columns.includes(label)).map(([label, value]) => `<td data-label="${label}">${amount(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
    </div>`;
  }

  function renderShoppingIcon(node) {
    const image = typeof node.image === 'string' && /^[a-zA-Z0-9/_\.-]+$/.test(node.image) && !node.image.includes('..') ? `/assets/${node.image}` : null;

    return `<span class="iw-shopping-icon" data-supply="${node.supply}">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span aria-hidden="true">?</span>`}${node.supply !== 'covered' ? `<b aria-hidden="true">${node.supply === 'insufficient' ? '!' : '?'}</b>` : ''}</span>`;
  }

  function shoppingSupplyLabel(node) {
    return node.supply === 'insufficient' ? 'Materials insufficient' : node.supply === 'unknown' ? 'Incomplete / uncertain' : node.missing === 0 ? 'Covered by owned stock' : 'Craftable from current materials';
  }

  function renderShoppingTree(snapshot) {
    const nodes = new Map(snapshot.nodes.map(node => [node.key, node])), seen = new Set();
    function branch(node, edge = null, inputConnection = null) {
      const reference = seen.has(node.key);
      seen.add(node.key);
      const note = edge?.cycle ? ' · Cycle stopped' : reference ? ' · Shared requirement' : '';
      const label = `${node.name} — ${shoppingSupplyLabel(node)}${note}${node.special ? ' · Resource balance' : ''}`;
      const content = `<button type="button" class="iw-shopping-node" data-shopping-step-link="${escapeHtml(node.key)}" aria-haspopup="dialog" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${renderShoppingIcon(node)}</button>`;
      // Allocated inputs are individually capped to owned stock. Their lines
      // must reflect the complete pool's shortfall, including hidden inputs.
      const poolConnection = node.spareInputs ? node.acquire === null ? 'unknown' : node.acquire > 0 ? 'craftable' : 'covered' : null;
      const connection = inputConnection || (poolConnection && poolConnection !== 'covered' ? poolConnection
        : node.supply === 'covered' && node.missing > 0 ? 'craftable' : node.supply);
      let spareShown = 0;
      // The allocator orders spare inputs by yield. Limit only their artwork;
      // keep all inputs in the snapshot, estimates and detailed breakdown.
      const visibleEdges = node.edges.filter(input => !input.spare || spareShown++ < 2);
      // Owned stock ends this branch; craftable supplies still need their
      // inputs shown. Keep the full calculation for totals and shared demand.
      const children = node.missing === 0 || reference || edge?.cycle ? [] : visibleEdges.map(input => {
        const child = nodes.get(input.key);
        return child ? branch(child, input, input.spare ? poolConnection : null) : null;
      }).filter(Boolean);
      const childWidth = children.reduce((sum, child) => sum + child.width, 0);
      const width = Math.max(edge ? 48 : 56, childWidth) + 24;
      const connections = children.length ? renderShoppingConnections(children, childWidth) : '';
      return { width, supply: connection, markup: `<li style="--iw-branch-width:${width}" data-shopping-node="${escapeHtml(node.key)}" data-supply="${node.supply}" data-connection="${connection}">${content}${children.length ? `<ul class="iw-shopping-branches" style="--iw-branch-width:${childWidth}">${connections}${children.map(child => child.markup).join('')}</ul>` : ''}</li>` };
    }
    const root = branch(snapshot.nodes[0]);
    return `<ul class="iw-shopping-tree" style="--iw-tree-unit:max(.55px,min(1px,calc(100cqw / ${root.width})))">${root.markup}</ul>`;
  }

  function renderShoppingConnections(children, width) {
    let left = 0;
    const paths = children.map(child => {
      const x = left + child.width / 2, center = width / 2;
      left += child.width;
      const direction = Math.sign(x - center), radius = Math.min(8, Math.abs(x - center) / 2);
      const d = direction === 0 ? `M ${center} 0 V 43`
        : `M ${center} 0 V ${20 - radius} Q ${center} 20 ${center + direction * radius} 20 H ${x - direction * radius} Q ${x} 20 ${x} ${20 + radius} V 43`;
      return { d, supply: child.supply };
    });
    // Shared sections inherit the most severe branch. Paint its continuous
    // path last so a covered sibling cannot make a shortage look covered.
    const severity = { covered: 0, craftable: 1, unknown: 2, insufficient: 3 };
    paths.sort((a, b) => severity[a.supply] - severity[b.supply]);
    return `<svg class="iw-shopping-connections" viewBox="0 0 ${width} 43" preserveAspectRatio="none" aria-hidden="true" focusable="false">${paths.map(path => `<path data-supply="${path.supply}" d="${path.d}"/>${path.supply === 'covered' ? `<path class="iw-shopping-flow" d="${path.d}"/>` : ''}`).join('')}</svg>`;
  }

  function renderShoppingConversion(resource, ui) {
    const runtime = quickRuntime(), selected = (ui.editing ? ui.draft.conversions || ui.conversions : ui.conversions)?.[resource] || '';
    return `<label>${resource === 'charcoal' ? 'Trees / wood for Charcoal' : `${escapeHtml(SHOPPING_RESOURCES[resource])} input`}<select class="iw-conversion-select" data-stock="${shoppingConversionStock(runtime, selected).status}" data-shopping-conversion data-shopping-resource="${resource}" data-shopping-owner="${escapeHtml(ui.owner)}" ${shoppingPending(runtime) ? 'disabled' : ''}>
      ${renderShoppingConversionOptions(runtime, resource, selected)}</select></label><p class="iw-muted iw-conversion-legend">Green: owned · Red: none owned · Amber: unknown. Excludes pending loot.</p>`;
  }

  function shoppingConversionStock(runtime, id) {
    const owned = shoppingPending(runtime) ? null : shoppingOwned(runtime, id);
    return { owned, status: !id || id === SHOPPING_BALANCE_ONLY ? 'default' : owned === null ? 'unknown' : owned > 0 ? 'owned' : 'empty' };
  }

  function renderShoppingConversionOptions(runtime, resource, selected = '') {
    const choices = shoppingConversionChoices(runtime, resource);
    const balanceChoice = Object.hasOwn(SHOPPING_SPARE_INPUTS, resource);
    const invalidated = selected && !(balanceChoice && selected === SHOPPING_BALANCE_ONLY) && !choices.some(choice => choice.id === selected);
    return `<option value="" ${!selected ? 'selected' : ''}>${SHOPPING_SPARE_INPUTS[resource] ? `Use spare owned ${SHOPPING_SPARE_INPUTS[resource].name} automatically` : 'Use resource balance only'}</option>
      ${balanceChoice ? `<option value="${SHOPPING_BALANCE_ONLY}" ${selected === SHOPPING_BALANCE_ONLY ? 'selected' : ''}>Use resource balance only</option>` : ''}
      ${invalidated ? `<option value="${escapeHtml(selected)}" data-stock="unknown" selected>Saved input unavailable</option>` : ''}
      ${choices.map(choice => {
        const stock = shoppingConversionStock(runtime, choice.id);
        // Native option menus can ignore CSS colors; retain a colored stock
        // marker as text, alongside the explicit quantity for accessibility.
        const marker = stock.status === 'owned' ? '🟢' : stock.status === 'empty' ? '🔴' : '🟡';
        return `<option value="${choice.id}" data-stock="${stock.status}" ${choice.id === selected ? 'selected' : ''}>${escapeHtml(choice.name)} · ${formatNumber(choice.output)} per item · ${marker} ${stock.owned === null ? 'Owned unknown' : `${formatNumber(stock.owned)} owned`}</option>`;
      }).join('')}${!choices.length ? '<option disabled>Conversion recipes unavailable</option>' : ''}`;
  }

  function renderShoppingSpareInputs(node) {
    const input = SHOPPING_SPARE_INPUTS[node.id], resource = escapeHtml(node.name);
    const perItem = `${resource} per ${input.unit}`, outputLabel = `${resource} output`;
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    return `<p>Required ${amount(node.required)} · Owned ${amount(node.owned)}</p>
      <p>${amount(node.spareOutput)} from ${input.name} · ${amount(node.acquire)} still to acquire · Projected surplus ${amount(node.surplus)}</p>
      <table><caption>Available ${input.name} after other recipe requirements. Higher-yield ${input.name} ${input.name === 'wood' ? 'is' : 'are'} allocated first.</caption><thead><tr><th>${input.label}</th><th>${perItem}</th><th>Available</th><th>To convert</th><th>${outputLabel}</th></tr></thead><tbody>
      ${node.spareInputs.map(row => `<tr><th>${escapeHtml(row.name)}</th><td data-label="${perItem}">${amount(row.output)}</td><td data-label="Available">${amount(row.available)}</td><td data-label="To convert">${amount(row.used)}</td><td data-label="${outputLabel}">${amount(row.produced)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderShoppingOverview(snapshot, ui) {
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const capacity = snapshot.capacity;
    const canMake = capacity.exact ? amount(capacity.amount) : capacity.amount ? `≥ ${amount(capacity.amount)}` : 'Unknown';
    const remainder = snapshot.shortfall === null ? null : Math.max(0, snapshot.shortfall - capacity.amount);
    const cannotMake = capacity.exact || remainder === 0 ? remainder : null;
    const ownedPercent = snapshot.owned === null ? 0 : Math.min(100, snapshot.owned / ui.plan.quantity * 100);
    const craftPercent = Math.min(100 - ownedPercent, capacity.amount / ui.plan.quantity * 100);
    const coveragePercent = Math.floor((ownedPercent + craftPercent) * 10) / 10;
    const coverageLabel = capacity.exact && snapshot.owned !== null ? `${coveragePercent}% covered` : coveragePercent > 0 ? `≥ ${coveragePercent}% covered` : 'Coverage unknown';
    return `<div class="iw-shopping-overview">
      <div class="iw-shopping-overview-heading"><button class="iw-shopping-target-icon" type="button" data-shopping-step-link="${escapeHtml(snapshot.key)}" aria-haspopup="dialog" aria-label="View ${escapeHtml(snapshot.name)} details">${renderShoppingIcon(snapshot)}</button><div><strong>${escapeHtml(snapshot.name)}</strong><span>${snapshot.shortfall === 0 ? 'Target satisfied' : `${amount(snapshot.shortfall)} to acquire`}</span></div></div>
      <dl class="iw-shopping-totals"><div><dt>Target</dt><dd>${amount(ui.plan.quantity)}</dd></div><div class="iw-shopping-owned"><dt>Owned</dt><dd>${amount(snapshot.owned)}</dd></div><div class="iw-shopping-capacity" data-exact="${capacity.exact}"><dt>Craftable</dt><dd>${canMake}</dd></div><div class="iw-shopping-uncovered" data-state="${cannotMake === null ? 'unknown' : cannotMake > 0 ? 'shortage' : 'covered'}"><dt>Still needed</dt><dd>${amount(cannotMake)}</dd></div></dl>
      <div class="iw-progress-bar iw-shopping-coverage" role="img" aria-label="Target coverage: ${amount(snapshot.owned)} owned; ${canMake} additional from materials"><span class="iw-shopping-coverage-fill"><span style="width:${ownedPercent}%"></span><span style="width:${craftPercent}%"></span></span><span>${coverageLabel}</span></div>
      <div class="iw-shopping-overview-note"><span>From owned materials · excludes bonuses</span>${!capacity.exact ? '<span>Exact capacity unknown</span>' : ''}</div>
    </div>`;
  }

  function renderShoppingShortages(snapshot, ui) {
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const shortages = snapshot.leaves.filter(row => !row.unresolved && row.acquire !== 0);
    return `${shortages.length ? `<div class="iw-shopping-shortages"><div class="iw-shopping-section-heading"><strong>Still needed</strong></div><div>${shortages.map(row => `<button type="button" data-shopping-step-link="${escapeHtml(row.key)}" aria-haspopup="dialog" aria-label="${amount(row.acquire)} ${escapeHtml(row.name)}">${renderShoppingIcon({ ...row, supply: 'covered' })}<span class="iw-shopping-material-name">${escapeHtml(row.name)}</span><span class="iw-shopping-material-amount">${amount(row.acquire)}</span></button>`).join('')}</div></div>` : snapshot.incomplete || ui.unavailable ? '<p>Some requirements are unknown.</p>' : snapshot.shortfall === 0 ? '' : '<p class="iw-shopping-covered">Materials covered.</p>'}
    ${snapshot.incomplete ? '<p class="iw-shopping-plan-warning">Incomplete plan — inspect warning icons.</p>' : ''}`;
  }
