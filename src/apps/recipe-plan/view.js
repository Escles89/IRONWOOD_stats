  const recipeAmount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);

  function renderRecipeSummary(inPlanner = false) {
    const ui = plannedObserve(), plan = ui.plan;
    const snapshot = plan?.kind === 'recipe' ? recipeObservation(plan) : null;
    const target = snapshot?.next?.target || plannedTargets().find(target => quickSameAction(target, plan));
    const reason = snapshot ? recipeStartReason(snapshot) : !plan ? '' : plannedCurrentState().kind === 'completed' ? 'Collect completed work before starting next.' : plannedCurrentBlockReason() || plannedKnownReason(quickRuntime(), target);
    const pending = snapshot?.running ? shoppingNumber(quickRuntime()?.action?.actionLoot?.[snapshot.running.id]?.amount ?? (shoppingRecord(quickRuntime()?.action?.actionLoot) ? 0 : null)) : null;
    return `<section class="iw-recipe-summary" aria-label="Plan summary">
      ${!inPlanner ? '<button type="button" class="iw-small-button" data-recipe-open aria-label="Open Recipe Calc and planner">Recipe Calc & planner</button>' : '<span class="iw-recipe-eyebrow">Next action</span>'}
      ${snapshot?.running ? `<p class="iw-recipe-progress">In progress · ${escapeHtml(snapshot.running.target.skillName)} · ${escapeHtml(snapshot.running.target.name)} · Required acquisition: ${recipeAmount(snapshot.running.missing)} · Pending loot: <span data-recipe-pending="${snapshot.running.id}" data-recipe-owner="${escapeHtml(ui.owner)}">${recipeAmount(pending)}</span> (not owned)</p>` : ''}
      <div class="iw-recipe-next"><div><p class="iw-recipe-next-name">${snapshot?.shortfall === 0 ? 'Target satisfied' : target ? `Next · ${escapeHtml(target.skillName)} · ${escapeHtml(target.name)}` : snapshot ? 'No ready action' : 'No active plan'}</p>
      ${target ? `<p class="iw-recipe-note">${target.finite ? `Native quantity: ${recipeAmount(snapshot ? snapshot.next.amount : plan.amount)} · not guaranteed output` : snapshot ? `Required acquisition: ${recipeAmount(snapshot.next.missing)} · continuous gathering` : 'Continuous action'}</p>` : ''}</div>
      ${target ? `<button type="button" class="iw-small-button iw-recipe-primary" ${snapshot ? `data-recipe-start="${escapeHtml(recipeStepToken(ui.owner, plan, snapshot.next))}"` : 'data-planned-start'} aria-label="Start next" ${reason || quickBusy() ? 'disabled' : ''}>Start next →</button>` : ''}</div>
      ${snapshot?.next?.capped ? '<p class="iw-recipe-note">Saved batch reduced to the remaining requirement.</p>' : ''}
      ${reason ? `<p class="iw-recipe-note">${escapeHtml(reason)}</p>` : ''}${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}
      <div class="iw-recipe-tools"><button type="button" class="iw-small-button" data-recipe-refresh ${quickBusy() || !ui.owner ? 'disabled' : ''}>Refresh plan</button>${plan ? `<button type="button" class="iw-small-button" data-planned-clear ${quickBusy() ? 'disabled' : ''}>Clear active plan</button>` : ''}</div></section>`;
  }

  function renderRecipeSteps(plan, snapshot, active) {
    if (!snapshot) return '';
    return `<section class="iw-recipe-steps"><div class="iw-recipe-plan-heading"><div><h3>${active ? 'Active recipe plan' : 'Preview recipe plan'}</h3><strong>${escapeHtml(snapshot.name)}</strong><p class="iw-recipe-note">Target owned quantity: ${recipeAmount(plan.target.quantity)}</p></div><div class="iw-recipe-total"><strong>${recipeAmount(snapshot.shortfall)}</strong><span>still to acquire</span></div></div>
      ${snapshot.shortfall === 0 ? '<p>Target satisfied</p>' : `<div class="iw-recipe-list-heading"><span>${snapshot.steps.length} remaining requirements</span><span>Expand a row for details</span></div><ol>${snapshot.steps.map(step => renderRecipeStep(step, snapshot, active)).join('')}</ol>`}
      </section>`;
  }

  function renderRecipeStep(step, snapshot, active) {
    const scope = active ? 'active' : 'preview', expanded = AppState.ui.recipePlan.expandedStep === recipeQuantityDraftKey(scope, step.id);
    const next = active && snapshot.next?.key === step.key;
    const status = snapshot.running?.key === step.key ? 'In progress' : !step.target ? 'Manual' : step.ready ? next ? 'Next' : 'Ready' : 'Blocked';
    const detailId = `iw-recipe-detail-${scope}-${step.id}`;
    return `<li data-recipe-status="${status}"><button type="button" class="iw-recipe-row" data-recipe-details="${scope}:${step.id}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" aria-label="Details for ${scope} ${escapeHtml(step.name)}" aria-expanded="${expanded}" aria-controls="${detailId}">
      ${renderShoppingIcon(step)}<span class="iw-recipe-row-name"><strong>${recipeAmount(step.missing)} ${escapeHtml(step.name)}</strong><small>${step.target ? escapeHtml(step.target.skillName) : 'Manual requirement'}</small></span><span class="iw-recipe-badge">${status}</span><span class="iw-recipe-chevron" aria-hidden="true">${expanded ? '−' : '+'}</span></button>
      <div class="iw-recipe-detail" id="${detailId}" ${expanded ? '' : 'hidden'}><p class="iw-recipe-note">${escapeHtml(step.reason || 'Ready')}</p>
      <dl class="iw-recipe-balances"><div><dt>Required</dt><dd>${recipeAmount(step.required)}</dd></div><div><dt>Owned</dt><dd>${recipeAmount(step.owned)}</dd></div><div><dt>Missing now</dt><dd>${recipeAmount(step.missing)}</dd></div></dl>
      ${step.edges.length ? `<div class="iw-recipe-supplies"><span class="iw-recipe-eyebrow">${step.target?.finite && quickAmount(step.amount) ? 'Supplies for this batch' : 'Supplies for remaining requirement'}</span><ul>${step.edges.map(edge => `<li><span>${escapeHtml(edge.name)}</span><strong>${recipeAmount(step.target?.finite && quickAmount(step.amount) ? edge.perAttempt === null ? null : shoppingNumber(edge.perAttempt * step.amount) : edge.required)}</strong></li>`).join('')}</ul></div>` : ''}${renderRecipeChoices(step, active)}</div></li>`;
  }

  function renderRecipePlanner() {
    shoppingObserve();
    const plan = plannedObserve().plan, preview = recipePreviewPlan(), ui = AppState.ui.recipePlan;
    const view = ui.view || (plan ? 'plan' : 'calculator');
    const current = plannedCurrentState(), collection = ['continuous', 'completed'].includes(current.kind);
    return `<nav class="iw-recipe-nav" aria-label="Planner views">${[['plan', 'Active plan'], ['calculator', 'Calculator'], ['manual', 'Single action']].map(([key, label]) => `<button type="button" data-recipe-view="${key}" aria-label="${label} view" aria-pressed="${view === key}" aria-controls="iw-recipe-panel-${key}">${label}</button>`).join('')}</nav>
      <div id="iw-recipe-panel-plan" data-recipe-panel="plan" ${view === 'plan' ? '' : 'hidden'}>${renderRecipeSummary(true)}${collection ? `<div class="iw-recipe-collection"><button type="button" class="iw-small-button" data-recipe-collect="${escapeHtml(recipeCollectionToken())}" aria-label="${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}" ${quickBusy() ? 'disabled' : ''}>${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}</button><small>Collection does not start the next action.</small></div>` : ''}${plan?.kind === 'recipe' ? renderRecipeSteps(plan, recipeObservation(plan), true) : '<p class="iw-recipe-note">Use the Calculator to build a recipe plan, or choose a Single action.</p>'}</div>
      <div id="iw-recipe-panel-calculator" data-recipe-panel="calculator" ${view === 'calculator' ? '' : 'hidden'}>${renderShoppingCard(true)}${preview ? renderRecipeSteps(preview, recipeObservation(preview, 'preview'), false) : ''}</div>
      <div id="iw-recipe-panel-manual" data-recipe-panel="manual" ${view === 'manual' ? '' : 'hidden'}><p class="iw-recipe-note">Save one action to replace the active plan.</p>${renderPlannedActionCard(true)}</div>`;
  }

  function renderRecipeChoices(step, active) {
    const scope = active ? 'active' : 'preview';
    return `${!step.special && (step.choices?.length > 1 || step.recipeKey && !step.chosen) ? `<label>Choose a source for ${escapeHtml(step.name)}<select data-recipe-source data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} source for ${escapeHtml(step.name)}"><option value="">Choose a source</option>${step.choices.map(choice => `<option value="${choice.key}" ${choice.key === step.chosen?.key ? 'selected' : ''}>${escapeHtml(choice.skillName)} · ${escapeHtml(choice.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${step.special && SHOPPING_CONVERSIONS.includes(step.id) ? `<label>Conversion input for ${escapeHtml(step.name)}<select data-recipe-conversion data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} conversion input for ${escapeHtml(step.name)}"><option value="">Choose an input</option>${step.choices.map(choice => `<option value="${choice.id}" ${choice.id === step.sourceId ? 'selected' : ''}>${escapeHtml(choice.name)} · ${recipeAmount(choice.output)} each</option>`).join('')}</select></label>` : ''}
      ${step.special ? step.gaps.map(gap => `<p>${escapeHtml(gap)}</p>`).join('') : ''}
      ${step.target?.finite ? `<form data-recipe-quantity-form data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}"><label>Native quantity (not guaranteed output)<input name="amount" data-recipe-quantity data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} quantity for ${escapeHtml(step.name)}" type="number" min="1" max="1000000" step="1" value="${escapeHtml(AppState.ui.recipePlan.quantityDrafts[recipeQuantityDraftKey(scope, step.id)] ?? step.amount ?? '')}" required></label><button type="submit" class="iw-small-button">Apply quantity</button></form><p class="iw-recipe-note">${step.capped ? 'Saved batch reduced to the remaining requirement. ' : ''}${step.fixed ? 'Base calculation' : 'Uncertain yield; actual output may differ'}</p>` : ''}
      ${active && step.ready ? `<button type="button" class="iw-small-button" data-recipe-select data-recipe-scope="active" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}">Choose ${escapeHtml(step.name)} next</button>` : ''}
      ${step.conversion ? `<p>Manual conversion: ${recipeAmount(step.attempts)} ${escapeHtml(step.conversion.name)} → ${recipeAmount(step.output)} ${escapeHtml(step.name)} (projected, not owned).</p>` : ''}
      ${step.wood ? `<p>Spare owned wood can supply ${recipeAmount(step.woodOutput)} Charcoal through manual conversion; ${recipeAmount(step.acquire)} still to acquire.</p>` : ''}
      ${!step.target ? '<a href="/inventory">Open inventory for manual acquisition or conversion ↗</a>' : ''}`;
  }

  function recipeUpdateProgress() {
    const runtime = quickRuntime(), owner = quickOwner(runtime);
    for (const node of document.querySelectorAll('[data-recipe-pending]')) {
      if (node.dataset.recipeOwner !== owner) continue;
      const loot = runtime?.action?.actionLoot;
      const amount = shoppingNumber(loot?.[node.dataset.recipePending]?.amount ?? (shoppingRecord(loot) ? 0 : null));
      const text = recipeAmount(amount);
      if (node.textContent !== text) node.textContent = text;
    }
  }

  function renderRecipeSendButton() {
    const plan = recipePreviewPlan(), snapshot = recipeObservation(plan, 'preview');
    if (!plan) return '';
    return `<button type="button" class="iw-small-button iw-recipe-primary" data-recipe-use="${escapeHtml(JSON.stringify([plannedObserve().owner, plan]))}" ${!snapshot || snapshot.unavailable || quickBusy() || recipeHasDraft('preview') ? 'disabled' : ''}>Send to planner</button>`;
  }
