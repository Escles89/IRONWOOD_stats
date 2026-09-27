  function renderPlannedActionCard() {
    if (location.pathname !== '/status') return '';
    const ui = plannedObserve(), runtime = quickRuntime(), targets = plannedTargets(runtime), busy = quickBusy();
    const target = targets.find(target => quickSameAction(target, ui.plan));
    const draft = ui.draft, chosen = targets.find(target => quickSameAction(target, draft));
    const reason = busy ? 'Another action is in progress.' : plannedIdleReason(runtime) || plannedKnownReason(runtime, target) || ui.observation?.reason || '';
    const escape = escapeHtml;
    return `<section class="iw-card iw-planned-card" aria-label="Planned next action"><div class="iw-card-header"><span>Planned next action</span><button type="button" class="iw-small-button" data-planned-refresh ${busy || !ui.owner ? 'disabled' : ''}>Refresh</button></div><div class="iw-planned-body">
      ${ui.plan ? `<strong>${escape(target ? `${target.skillName} · ${target.name}` : 'Saved action unavailable — edit the plan')}</strong>${ui.plan.amount !== null ? `<p>Native quantity: ${formatNumber(ui.plan.amount)} · not guaranteed output</p>` : ''}
      <div class="iw-planned-actions"><button type="button" class="iw-small-button" data-planned-start aria-describedby="iw-planned-reason" ${reason || !target ? 'disabled' : ''}>Start</button><button type="button" class="iw-small-button" data-planned-edit ${busy ? 'disabled' : ''}>Edit</button><button type="button" class="iw-small-button" data-planned-clear ${busy ? 'disabled' : ''}>Clear</button></div><p id="iw-planned-reason">${escape(reason || 'Idle confirmed. Start when ready.')}</p>` : '<p>Choose what to do next. Starts only when you select Start from idle.</p>'}
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : ui.editing || !ui.plan ? `<form data-planned-form data-planned-owner="${escape(ui.owner)}">
      <label>Skill<select name="skill" data-planned-field="skillId" required><option value="">Choose a skill</option>${quickSkills(runtime).filter(skill => skill.id !== '15').map(skill => `<option value="${skill.id}" ${skill.id === draft.skillId ? 'selected' : ''}>${escape(skill.name)}</option>`).join('')}</select></label>
      <label>Filter actions<input type="search" data-planned-field="filter" value="${escape(ui.filter)}"></label>
      <label>Action<select name="action" data-planned-field="actionId" required><option value="">Choose an action</option>${targets.filter(target => target.skillId === draft.skillId && (target.actionId === draft.actionId || target.name.toLowerCase().includes(ui.filter.toLowerCase()))).map(target => `<option value="${target.actionId}" ${target.actionId === draft.actionId ? 'selected' : ''}>${escape(target.name)}</option>`).join('')}</select></label>
      ${chosen?.finite ? `<label>Native quantity (not guaranteed output)<input name="amount" data-planned-field="amount" type="number" inputmode="numeric" min="1" max="1000000" step="1" required value="${escape(draft.amount)}"></label>` : ''}
      ${chosen ? `<p>${escape([plannedRequirements(runtime, chosen), plannedKnownReason(runtime, chosen)].filter(Boolean).join(' '))}</p>` : ''}
      <button type="submit" class="iw-small-button" ${busy ? 'disabled' : ''}>Save plan</button></form>` : ''}
      ${target ? `<p class="iw-muted">${escape([plannedRequirements(runtime, target), plannedKnownReason(runtime, target)].filter(Boolean).join(' '))}</p>` : ''}
      ${ui.observation ? `<p class="iw-muted">Requirements checked ${Math.max(0, Math.floor((Date.now() - ui.observation.observedAt) / 60000))} min ago. ${escape(ui.observation.reason || 'Native start control available at that observation. Rechecked at Start.')}</p>` : ''}
      ${ui.message ? `<p role="status">${escape(ui.message)}</p>` : ''}</div></section>`;
  }
