  const recipeAmount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);

  function recipeRunnerLabel(status) {
    return ({ waiting: 'Waiting', running: 'Running', starting: 'Starting', collecting: 'Collecting', paused: 'Paused', attention: 'Needs attention', complete: 'Complete' })[status] || 'Paused';
  }

  function renderRecipeRunnerBadge() {
    if (plannedObserve().plan?.kind !== 'recipe') return '';
    const info = recipeRunnerInfo(), label = `Recipe planner · ${recipeRunnerLabel(info.status)} · ${info.reason}`;
    const animated = info.enabled && ['waiting', 'running', 'starting', 'collecting'].includes(info.status);
    return `<button type="button" class="iw-recipe-runner-badge" data-recipe-open data-run-state="${info.status}" data-animated="${animated}" aria-haspopup="dialog" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="iw-plan-route" d="M5 18h7V6h7"/><rect class="iw-plan-step" x="2.5" y="15.5" width="5" height="5" rx="1"/><rect class="iw-plan-step" x="9.5" y="9.5" width="5" height="5" rx="1"/><rect class="iw-plan-step" x="16.5" y="3.5" width="5" height="5" rx="1"/></svg></button>`;
  }

  function renderRecipeRunnerControls() {
    const info = recipeRunnerInfo();
    return `<div class="iw-recipe-runner-controls" role="status"><strong>Automatic plan · ${recipeRunnerLabel(info.status)}</strong><p>${escapeHtml(info.reason)}</p><button type="button" class="iw-small-button" data-recipe-run-toggle ${!info.enabled && quickBusy() ? 'disabled' : ''}>${info.enabled ? 'Pause automatic plan' : 'Resume automatic plan'}</button></div>`;
  }

  function renderRecipeSummary(inPlanner = false, compact = false) {
    const ui = plannedObserve(), plan = ui.plan;
    const automatic = plan?.kind === 'recipe' && recipeRunnerInfo().enabled;
    const snapshot = plan?.kind === 'recipe' ? recipeObservation(plan) : null;
    const target = snapshot?.next?.target || plannedTargets().find(target => quickSameAction(target, plan));
    const reason = snapshot ? recipeStartReason(snapshot) : !plan ? '' : plannedCurrentState().kind === 'completed' ? 'Collect completed work before starting next.' : plannedCurrentBlockReason() || plannedKnownReason(quickRuntime(), target);
    const showReason = reason && !(automatic && reason === 'Stop continuous work manually before starting the plan.');
    const pending = snapshot?.running ? shoppingNumber(quickRuntime()?.action?.actionLoot?.[snapshot.running.id]?.amount ?? (shoppingRecord(quickRuntime()?.action?.actionLoot) ? 0 : null)) : null;
    if (compact) {
      const state = snapshot ? recipeRunnerLabel(recipeRunnerInfo().status) : plan ? 'Manual plan' : 'No active plan';
      const next = snapshot?.shortfall === 0 ? 'Target satisfied' : target ? `Next · ${target.skillName} · ${target.name}` : snapshot ? 'No ready action' : 'Choose a recipe or single action';
      return `<section class="iw-skills-plan-summary" aria-label="Compact plan summary"><div><span class="iw-skills-plan-state">Planner · ${escapeHtml(state)}</span><span class="iw-skills-plan-next">${escapeHtml(next)}</span>${showReason ? `<small title="${escapeHtml(reason)}">${escapeHtml(reason)}</small>` : ''}</div><div class="iw-skills-plan-actions">${target ? `<button type="button" class="iw-small-button" ${snapshot ? `data-recipe-start="${escapeHtml(recipeStepToken(ui.owner, plan, snapshot.next))}"` : 'data-planned-start'} aria-label="Start next" ${reason || quickBusy() ? 'disabled' : ''}>Start next</button>` : ''}<button type="button" class="iw-small-button" data-recipe-open aria-label="Open Recipe Calc and planner">Planner</button></div></section>`;
    }
    return `<section class="iw-recipe-summary" aria-label="Plan summary">
      ${!inPlanner ? '<button type="button" class="iw-small-button" data-recipe-open aria-label="Open Recipe Calc and planner">Recipe Calc & planner</button>' : '<span class="iw-recipe-eyebrow">Next action</span>'}
      ${snapshot ? renderRecipeRunnerControls() : ''}
      ${snapshot?.running ? `<p class="iw-recipe-progress">In progress · ${escapeHtml(snapshot.running.target.skillName)} · ${escapeHtml(snapshot.running.target.name)} · Required acquisition: ${recipeAmount(snapshot.running.missing)} · Pending loot: <span data-recipe-pending="${snapshot.running.id}" data-recipe-owner="${escapeHtml(ui.owner)}">${recipeAmount(pending)}</span> (not owned)</p>` : ''}
      <div class="iw-recipe-next"><div><p class="iw-recipe-next-name">${snapshot?.shortfall === 0 ? 'Target satisfied' : target ? `Next · ${escapeHtml(target.skillName)} · ${escapeHtml(target.name)}` : snapshot ? 'No ready action' : 'No active plan'}</p>
      ${target ? `<p class="iw-recipe-note">${target.finite ? `Native quantity: ${recipeAmount(snapshot ? snapshot.next.amount : plan.amount)} · not guaranteed output` : snapshot ? `Required acquisition: ${recipeAmount(snapshot.next.missing)} · continuous gathering` : 'Continuous action'}</p>` : ''}</div>
      ${target ? `<button type="button" class="iw-small-button iw-recipe-primary" ${snapshot ? `data-recipe-start="${escapeHtml(recipeStepToken(ui.owner, plan, snapshot.next))}"` : 'data-planned-start'} aria-label="Start next" ${reason || quickBusy() ? 'disabled' : ''}>Start next →</button>` : ''}</div>
      ${snapshot?.next?.capped ? '<p class="iw-recipe-note">Saved batch reduced to the remaining requirement.</p>' : ''}
      ${showReason ? `<p class="iw-recipe-note">${escapeHtml(reason)}</p>` : ''}${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}
      <div class="iw-recipe-tools"><button type="button" class="iw-small-button" data-recipe-refresh ${quickBusy() || !ui.owner ? 'disabled' : ''}>Refresh plan</button>${plan ? `<button type="button" class="iw-small-button" data-planned-clear ${quickBusy() ? 'disabled' : ''}>Clear active plan</button>` : ''}</div></section>`;
  }

  function renderSkillsPlannerPanel() {
    const plan = plannedObserve().plan;
    const snapshot = plan?.kind === 'recipe' ? recipeObservation(plan) : null;
    return `<section class="iw-card iw-skills-planner-panel" aria-label="Planner details"><div class="iw-card-header"><span>Recipe planner</span><button type="button" class="iw-small-button" data-recipe-open>${plan ? 'Edit plan' : 'Open planner'}</button></div>
      ${plan ? renderRecipeSummary(true) : '<p class="iw-muted">No active plan. Open the planner to choose a recipe or single action.</p>'}
      ${snapshot ? `<div class="iw-subheader">${escapeHtml(snapshot.name)} · Target ${recipeAmount(plan.target.quantity)}</div><p class="iw-skills-plan-totals">${recipeAmount(snapshot.shortfall)} still to acquire · ${snapshot.steps.length} remaining requirements</p><div class="iw-skills-plan-requirements">${snapshot.steps.map(step => {
        const state = snapshot.running?.key === step.key ? 'In progress' : !step.target ? 'Manual' : step.ready ? snapshot.next?.key === step.key ? 'Next' : 'Ready' : 'Blocked';
        return `<div class="iw-skills-plan-requirement">${renderShoppingIcon(step)}<div><strong>${escapeHtml(step.name)}</strong><small>${escapeHtml(step.target?.skillName || 'Manual acquisition')} · ${state}</small>${step.reason ? `<small>${escapeHtml(step.reason)}</small>` : ''}</div><div class="iw-skills-plan-amounts"><span>${recipeAmount(step.owned)} / ${recipeAmount(step.required)} owned</span><small>${recipeAmount(step.missing)} missing</small></div></div>`;
      }).join('')}</div>` : ''}</section>`;
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
    const plan = plannedObserve().plan, ui = AppState.ui.recipePlan;
    const view = ui.view || (plan ? 'plan' : 'calculator');
    const current = plannedCurrentState(), collection = ['continuous', 'completed'].includes(current.kind);
    return `<nav class="iw-recipe-nav" aria-label="Planner views">${[['plan', 'Active plan'], ['calculator', 'Calculator'], ['manual', 'Single action']].map(([key, label]) => `<button type="button" data-recipe-view="${key}" aria-label="${label} view" aria-pressed="${view === key}" aria-controls="iw-recipe-panel-${key}">${label}</button>`).join('')}</nav>
      <div id="iw-recipe-panel-plan" data-recipe-panel="plan" ${view === 'plan' ? '' : 'hidden'}>${renderRecipeSummary(true)}${collection ? `<div class="iw-recipe-collection"><button type="button" class="iw-small-button" data-recipe-collect="${escapeHtml(recipeCollectionToken())}" aria-label="${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}" ${quickBusy() ? 'disabled' : ''}>${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}</button><small>Collection does not start the next action.</small></div>` : ''}${plan?.kind === 'recipe' ? renderRecipeSteps(plan, recipeObservation(plan), true) : '<p class="iw-recipe-note">Use the Calculator to build a recipe plan, or choose a Single action.</p>'}</div>
      <div id="iw-recipe-panel-calculator" data-recipe-panel="calculator" ${view === 'calculator' ? '' : 'hidden'}>${renderShoppingCard(true)}</div>
      <div id="iw-recipe-panel-manual" data-recipe-panel="manual" ${view === 'manual' ? '' : 'hidden'}><p class="iw-recipe-note">Save one action to replace the active plan.</p>${renderPlannedActionCard(true)}</div>`;
  }

  function renderRecipeChoices(step, active) {
    const scope = active ? 'active' : 'preview';
    return `${!step.special && (step.choices?.length > 1 || step.recipeKey && !step.chosen) ? `<label>Choose a source for ${escapeHtml(step.name)}<select data-recipe-source data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} source for ${escapeHtml(step.name)}"><option value="">Choose a source</option>${step.choices.map(choice => `<option value="${choice.key}" ${choice.key === step.chosen?.key ? 'selected' : ''}>${escapeHtml(choice.skillName)} · ${escapeHtml(choice.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${step.special && SHOPPING_CONVERSIONS.includes(step.id) ? `<label>Conversion input for ${escapeHtml(step.name)}<select class="iw-conversion-select" data-stock="${shoppingConversionStock(quickRuntime(), step.sourceId).status}" data-recipe-conversion data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} conversion input for ${escapeHtml(step.name)}">${renderShoppingConversionOptions(quickRuntime(), step.id, step.sourceId)}</select></label>` : ''}
      ${step.special ? step.gaps.map(gap => `<p>${escapeHtml(gap)}</p>`).join('') : ''}
      ${step.target?.finite ? `<form data-recipe-quantity-form data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}"><label>Native quantity (not guaranteed output)<input name="amount" data-recipe-quantity data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} quantity for ${escapeHtml(step.name)}" type="number" min="1" max="1000000" step="1" value="${escapeHtml(AppState.ui.recipePlan.quantityDrafts[recipeQuantityDraftKey(scope, step.id)] ?? step.amount ?? '')}" required></label><button type="submit" class="iw-small-button">Apply quantity</button></form><p class="iw-recipe-note">${step.capped ? 'Saved batch reduced to the remaining requirement. ' : ''}${step.fixed ? 'Base calculation' : 'Uncertain yield; actual output may differ'}</p>` : ''}
      ${active && step.ready ? `<button type="button" class="iw-small-button" data-recipe-select data-recipe-scope="active" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}">Choose ${escapeHtml(step.name)} next</button>` : ''}
      ${step.conversion ? `<p>Manual conversion: ${recipeAmount(step.attempts)} ${escapeHtml(step.conversion.name)} → ${recipeAmount(step.output)} ${escapeHtml(step.name)} (projected, not owned).</p>` : ''}
      ${step.spareInputs ? `<p>Spare owned ${SHOPPING_SPARE_INPUTS[step.id].name} can supply ${recipeAmount(step.spareOutput)} ${escapeHtml(step.name)} through manual conversion; ${recipeAmount(step.acquire)} still to acquire.</p>` : ''}
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

  function renderRecipeOverview() {
    const plan = plannedObserve().plan;
    if (plan?.kind !== 'recipe') return '';
    const snapshot = recipeObservation(plan);
    if (!snapshot) return '';
    const next = snapshot.next, steps = next ? [next, ...snapshot.steps.filter(step => step !== next)] : snapshot.steps;
    return `<aside class="iw-shopping-planned" aria-label="Planned overview"><div class="iw-shopping-planned-heading iw-shopping-section-heading"><strong>Planned</strong><span>${snapshot.steps.length} remaining requirements</span></div>
      ${plan.target.itemId !== AppState.ui.shopping.plan?.itemId || plan.target.quantity !== AppState.ui.shopping.plan?.quantity ? `<p>${escapeHtml(snapshot.name)} · Target ${recipeAmount(plan.target.quantity)}</p>` : ''}
      ${snapshot.shortfall === 0 ? '<p>Target satisfied</p>' : `<ol>${steps.slice(0, 3).map(step => `<li><span class="iw-shopping-planned-state">${snapshot.running?.key === step.key ? 'In progress' : step === next ? 'Next' : !step.target ? 'Manual' : step.ready ? 'Ready' : 'Waiting'}</span><span>${recipeAmount(step.missing)} ${escapeHtml(step.name)}</span></li>`).join('')}</ol>`}
      ${steps.length > 3 ? `<small>+${steps.length - 3} more in the Skills planner</small>` : ''}${snapshot.unavailable ? '<small>Last observation · balances unavailable</small>' : ''}</aside>`;
  }
