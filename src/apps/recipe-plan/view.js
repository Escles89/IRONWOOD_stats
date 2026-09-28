  const recipeAmount = value => value === null || value === undefined ? 'Unknown' : formatNumber(value);

  function renderRecipeSummary() {
    const ui = plannedObserve(), plan = ui.plan;
    const snapshot = plan?.kind === 'recipe' ? recipeObservation(plan) : null;
    const target = snapshot?.next?.target || plannedTargets().find(target => quickSameAction(target, plan));
    const reason = snapshot ? recipeStartReason(snapshot) : !plan ? '' : plannedCurrentState().kind === 'completed' ? 'Collect completed work before starting next.' : plannedCurrentBlockReason() || plannedKnownReason(quickRuntime(), target);
    const pending = snapshot?.running ? shoppingNumber(quickRuntime()?.action?.actionLoot?.[snapshot.running.id]?.amount ?? (shoppingRecord(quickRuntime()?.action?.actionLoot) ? 0 : null)) : null;
    return `<section class="iw-recipe-summary" aria-label="Plan summary"><button type="button" class="iw-small-button" data-recipe-open aria-label="Open Recipe Calc and planner">Recipe Calc & planner</button>
      ${snapshot?.running ? `<p>In progress · ${escapeHtml(snapshot.running.target.skillName)} · ${escapeHtml(snapshot.running.target.name)} · Required acquisition: ${recipeAmount(snapshot.running.missing)} · Pending loot: <span data-recipe-pending="${snapshot.running.id}" data-recipe-owner="${escapeHtml(ui.owner)}">${recipeAmount(pending)}</span> (not owned)</p>` : ''}
      <p>${snapshot?.shortfall === 0 ? 'Target satisfied' : target ? `Next · ${escapeHtml(target.skillName)} · ${escapeHtml(target.name)}` : snapshot ? 'No ready action. Open planner for missing requirements.' : 'No active plan'}</p>
      ${target ? `<p>${target.finite ? `Native quantity: ${recipeAmount(snapshot ? snapshot.next.amount : plan.amount)} · not guaranteed output` : snapshot ? `Required acquisition: ${recipeAmount(snapshot.next.missing)} · continuous gathering` : 'Continuous action'}</p><button type="button" class="iw-small-button" ${snapshot ? `data-recipe-start="${escapeHtml(recipeStepToken(ui.owner, plan, snapshot.next))}"` : 'data-planned-start'} aria-label="Start next" ${reason || quickBusy() ? 'disabled' : ''}>Start next</button>` : ''}
      ${plan ? `<button type="button" class="iw-small-button" data-planned-clear ${quickBusy() ? 'disabled' : ''}>Clear active plan</button>` : ''}<button type="button" class="iw-small-button" data-recipe-refresh ${quickBusy() || !ui.owner ? 'disabled' : ''}>Refresh plan</button>
      ${reason ? `<p>${escapeHtml(reason)}</p>` : ''}${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}</section>`;
  }

  function renderRecipeSteps(plan, snapshot, active) {
    if (!snapshot) return '';
    return `<section class="iw-recipe-steps"><h3>${active ? 'Active recipe plan' : 'Preview recipe plan'}</h3><p>${escapeHtml(snapshot.name)} · Target owned quantity: ${recipeAmount(plan.target.quantity)}</p>
      ${snapshot.shortfall === 0 ? '<p>Target satisfied</p>' : `<ol>${snapshot.steps.map(step => `<li><strong>${recipeAmount(step.missing)} ${escapeHtml(step.name)}</strong><p>${step.target ? `${escapeHtml(step.target.skillName)} · ${escapeHtml(step.target.name)}` : 'Manual requirement'} · ${escapeHtml(step.reason || 'Ready')}</p>${step.edges.length ? `<p>Supplies: ${step.edges.map(edge => `${recipeAmount(edge.required)} ${escapeHtml(edge.name)}`).join(', ')}</p>` : ''}${renderRecipeChoices(step, active)}</li>`).join('')}</ol>`}
      ${active ? '' : `<button type="button" class="iw-small-button" data-recipe-use="${escapeHtml(JSON.stringify([plannedObserve().owner, plan]))}" ${snapshot.unavailable || quickBusy() || recipeHasDraft('preview') ? 'disabled' : ''}>Use as plan</button>`}</section>`;
  }

  function renderRecipePlanner() {
    shoppingObserve();
    const plan = plannedObserve().plan, preview = recipePreviewPlan();
    const current = plannedCurrentState(), collection = ['continuous', 'completed'].includes(current.kind);
    return `${renderShoppingCard(true)}${renderRecipeSummary()}${collection ? `<button type="button" class="iw-small-button" data-recipe-collect="${escapeHtml(recipeCollectionToken())}" aria-label="${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}" ${quickBusy() ? 'disabled' : ''}>${current.kind === 'continuous' ? 'Stop & collect' : 'Collect completed work'}</button><p>Collection does not start the next action.</p>` : ''}${plan?.kind === 'recipe' ? renderRecipeSteps(plan, recipeObservation(plan), true) : ''}${preview ? renderRecipeSteps(preview, recipeObservation(preview, 'preview'), false) : ''}${renderPlannedActionCard(true)}`;
  }

  function renderRecipeChoices(step, active) {
    const scope = active ? 'active' : 'preview';
    return `${!step.special && (step.choices?.length > 1 || step.recipeKey && !step.chosen) ? `<label>Choose a source for ${escapeHtml(step.name)}<select data-recipe-source data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} source for ${escapeHtml(step.name)}"><option value="">Choose a source</option>${step.choices.map(choice => `<option value="${choice.key}" ${choice.key === step.chosen?.key ? 'selected' : ''}>${escapeHtml(choice.skillName)} · ${escapeHtml(choice.recipe.name)}</option>`).join('')}</select></label>` : ''}
      ${step.special && SHOPPING_CONVERSIONS.includes(step.id) ? `<label>Conversion input for ${escapeHtml(step.name)}<select data-recipe-conversion data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} conversion input for ${escapeHtml(step.name)}"><option value="">Choose an input</option>${step.choices.map(choice => `<option value="${choice.id}" ${choice.id === step.sourceId ? 'selected' : ''}>${escapeHtml(choice.name)} · ${recipeAmount(choice.output)} each</option>`).join('')}</select></label>` : ''}
      ${step.special ? step.gaps.map(gap => `<p>${escapeHtml(gap)}</p>`).join('') : ''}
      ${step.target?.finite ? `<form data-recipe-quantity-form data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}"><label>Native quantity (not guaranteed output)<input name="amount" data-recipe-quantity data-recipe-scope="${scope}" data-recipe-owner="${escapeHtml(plannedObserve().owner)}" data-recipe-item="${step.id}" aria-label="${scope} quantity for ${escapeHtml(step.name)}" type="number" min="1" max="1000000" step="1" value="${escapeHtml(AppState.ui.recipePlan.quantityDrafts[recipeQuantityDraftKey(scope, step.id)] ?? step.amount ?? '')}" required></label><button type="submit" class="iw-small-button">Apply quantity</button></form><p>${step.fixed ? 'Base calculation' : 'Uncertain yield; actual output may differ'}</p>` : ''}
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
