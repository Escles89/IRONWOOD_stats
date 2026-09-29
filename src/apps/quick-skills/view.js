  function quickLootReason(runtime) {
    if (quickBusy()) return 'Another action is in progress';
    if (!automationEnabled()) return 'Enable automation to use Quick Loot';
    if (!quickOwner(runtime)) return 'Character identity unavailable';
    if (!quickRunningTarget(runtime)) return 'No current action';
    if (!Object.values(runtime.action?.actionLoot || {}).some(item => item?.amount > 0)) return 'Nothing to collect';
    return '';
  }

  function quickIcon(name) {
    const paths = {
      skills: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      resume: '<path d="m9 5 10 7-10 7V5Z"/><path d="M4 5v14"/>',
      page: '<path d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
      edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      check: '<path d="m5 12 4 4L19 6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.skills}</svg>`;
  }

  function quickNativeActionIsCurrent(runtime = quickRuntime()) {
    const target = quickRunningTarget(runtime);
    return !!quickOwner(runtime) && !!target && location.pathname === `/skill/${target.skillId}/action/${target.actionId}`;
  }

  function renderQuickControls(runtime = quickRuntime(), native = false) {
    const ui = AppState.ui.quickSkills, reason = quickLootReason(runtime);
    return `${!native || quickNativeActionIsCurrent(runtime) ? `<button type="button" class="iw-quick-icon-button iw-quick-loot" data-quick-loot ${reason ? 'disabled' : ''} title="${escapeHtml(reason || 'Quick Loot · collect and continue')}" aria-label="Quick Loot${reason ? `: ${escapeHtml(reason)}` : ''}" aria-busy="${AppState.ui.collectingLoot}">${AppState.ui.collectingLoot ? renderActionSpinner() : native ? 'Quick Loot' : '<img src="/assets/misc/inventory.png" alt="">'}</button>` : ''}<button type="button" class="iw-quick-icon-button iw-quick-skills" data-quick-skills aria-label="Skills" title="Skills · start a last action" aria-expanded="${ui.open}" aria-controls="iw-quick-skills-panel">${quickIcon('skills')}</button>`;
  }

  function quickModalHeading(title, subtitle, image, closeLabel) {
    return `<div class="iw-options-heading"><img class="iw-guide-brand" src="${escapeHtml(image)}" alt=""><div><h2 id="iw-quick-title">${escapeHtml(title)}</h2><small>${escapeHtml(subtitle)}</small></div><button type="button" class="iw-modal-close" data-quick-close aria-label="${escapeHtml(closeLabel)}">${quickIcon('close')}</button></div>`;
  }

  function renderQuickSkillProgress(progress, skill, target, current) {
    if (!progress) return '';
    const percent = Math.min(99.9, progress.percent).toFixed(1);
    const eta = progress.seconds == null ? '—' : progress.seconds >= 86400
      ? `${Math.floor(progress.seconds / 86400)}d ${formatDuration(progress.seconds % 86400)}` : formatDuration(progress.seconds);
    const explanation = progress.rate
      ? `${current ? 'Current action' : `If started: ${target.name}`} · ${formatNumber(progress.rate)} XP/h with current equipment and bonuses. Assumes continuous training.`
      : 'No XP rate available. Run an action in this skill to establish an estimate.';
    const xp = `${formatNumber(Math.floor(progress.earned))} / ${formatNumber(progress.needed)} XP`;
    return `<div class="iw-quick-xp"><div class="iw-quick-xp-track" role="progressbar" title="${xp}" aria-label="${escapeHtml(skill.name)} progress to level ${progress.level + 1}" aria-valuetext="${xp}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><span class="iw-quick-xp-count" title="${xp}">${percent}% XP</span><span class="iw-quick-xp-estimate" title="${escapeHtml(explanation)}">${progress.rate && !current ? 'If started · ' : ''}Lv. ${progress.level + 1} in ${progress.rate ? '~' : ''}${eta}</span></div>`;
  }

  function renderQuickPanel(runtime) {
    const ui = AppState.ui.quickSkills, busy = quickBusy(), prompt = ui.prompt;
    const shell = content => `<section class="iw-modal-panel iw-guide-panel iw-quick-panel${prompt ? ' iw-quick-amount-panel' : ''}" role="dialog" aria-modal="true" aria-labelledby="iw-quick-title">${content}</section>`;
    if (prompt) {
      const info = prompt.quantityInfo?.(Number(prompt.value)) || { owned: null, time: '—' };
      const valid = quickAmount(Number(prompt.value)) && Number(prompt.value) <= prompt.limit;
      const targetAmount = Number(prompt.value) - info.owned;
      const targetValid = Number.isFinite(info.owned) && quickAmount(targetAmount) && targetAmount <= prompt.limit;
      const skill = quickSkills(runtime).find(skill => skill.id === prompt.target.skillId);
      const metadata = runtime?.actionCatalog?.[prompt.target.actionId];
      const itemImage = metadata?.image || runtime?.catalog?.[metadata?.drops?.[0]?.id]?.image;
      const image = itemImage ? `/assets/${itemImage}` : skill ? skillIcon(skill.name) : '/assets/icon.png';
      return shell(`${quickModalHeading(prompt.edit ? 'Configured amount' : 'Start action', [skill?.name, prompt.target.name].filter(Boolean).join(' · '), image, 'Cancel amount')}
      <div class="iw-quick-amount-body"><div class="iw-quick-quantity-rows">
        <div><span>Owned</span><b data-quick-owned>${Number.isFinite(info.owned) ? formatNumber(info.owned) : '—'}</b></div>
        <div><span>Craftable</span><b>${formatNumber(prompt.limit)}</b></div>
        <div><span>Estimated Time</span><b data-quick-time>${escapeHtml(info.time)}</b></div>
      </div>
      ${prompt.shortage ? '<p class="iw-quick-shortage">Your configured amount exceeds the available supply. Choose an amount for this run.</p>' : ''}
      <form data-quick-amount-form><input id="iw-quick-amount" name="amount" type="number" min="1" step="1" inputmode="numeric" aria-label="${prompt.planned ? 'Native quantity (not guaranteed output)' : 'Quantity'}" placeholder="Quantity" required value="${escapeHtml(prompt.value)}">
        <div class="iw-quick-craft-buttons"><button type="submit" class="iw-small-button" data-quick-craft ${valid ? '' : 'disabled'}>${prompt.edit ? 'Save amount' : 'Craft'}</button><button type="button" class="iw-small-button iw-quick-craft-all" data-quick-amount-choice="all" ${prompt.limit < 1 ? 'disabled' : ''}>${prompt.edit ? 'Use max' : 'Craft All'}</button><button type="button" class="iw-small-button" data-quick-amount-choice="target" title="${prompt.edit ? 'Save the quantity needed' : 'Craft enough'} to reach the entered inventory total" ${targetValid ? '' : 'disabled'}>Target</button></div>
        <p data-quick-amount-error role="alert"></p>
        <div class="iw-quick-quantity-options">
          ${prompt.planned ? '<p>Native quantity, not guaranteed output. This choice applies to this start; the saved plan stays unchanged unless the start succeeds.</p><input type="checkbox" name="reuse" hidden>' : `<label class="iw-quick-check"><input type="checkbox" name="reuse" ${prompt.reuse ? 'checked' : ''}><span>Reuse this configured amount</span></label>
          ${prompt.shortage ? `<label class="iw-quick-check"><input type="checkbox" name="save" ${prompt.save ? 'checked' : ''}><span>Replace my configured amount</span></label>` : ''}
          <small>${prompt.edit ? 'Saving does not start the action.' : 'Reuse skips this prompt next time you start this recipe.'}</small>`}
        </div>
      </form></div>`);
    }
    if (AppState.ui.recipePlan.open) return shell(`${quickModalHeading('Recipe Calc & planner', 'Edit your target, then start each action manually.', '/assets/icon.png', 'Close planner')}<div class="iw-quick-body iw-recipe-planner">${renderRecipePlanner()}</div>`);
    return shell(`${quickModalHeading('Skills', 'Your last actions, ready when you are.', '/assets/icon.png', 'Close Skills')}
      <div class="iw-quick-body"><p class="iw-quick-message${ui.message ? ' has-message' : ''}" role="status">${escapeHtml(ui.message || 'Start a remembered action, or open a skill to choose something new.')}</p>
      ${renderRecipeSummary()}<ul class="iw-quick-grid">${quickSkills(runtime).map(skill => {
        const target = ui.data?.last[skill.id];
        const current = quickSameAction(runtime?.state.user?.action, target);
        const region = currentActionRegion({ skillName: skill.name }, runtime);
        const regions = region ? [region] : TRAIT_REGIONS.filter(item => item.skills.includes(skill.name)).map(item => item.name);
        const metadata = runtime?.actionCatalog?.[target?.actionId];
        const unavailable = !ui.owner ? 'Character unavailable' : !target ? skill.id === '15' ? 'Manage expeditions' : 'No last action yet' : !metadata ? 'Action unavailable' : '';
        const amount = target && ui.data.amounts[quickActionKey(target)];
        const progress = quickSkillProgress(runtime, skill, target);
        return `<li class="iw-quick-skill${current ? ' is-current' : ''}${target ? ' has-action' : ''}" data-quick-page="${escapeHtml(skill.id)}" aria-disabled="${busy || !skill.button}"><img class="iw-quick-skill-image" src="${escapeHtml(skillIcon(skill.name))}" alt=""><div class="iw-quick-label"><strong><a class="iw-quick-card-link" href="/skill/${escapeHtml(skill.id)}" aria-label="Open ${escapeHtml(skill.name)} page" ${busy || !skill.button ? 'tabindex="-1" aria-disabled="true"' : ''}>${escapeHtml(skill.name)}</a>${progress?.level || skill.level ? `<span class="iw-quick-level">Lv. ${escapeHtml(progress?.level || skill.level)}</span>` : ''}<span class="iw-quick-regions">${regions.map(region => renderRegionIcon(region)).join('')}</span></strong><small class="iw-quick-action-label">${target && metadata?.image ? `<img src="/assets/${escapeHtml(metadata.image)}" alt="">` : ''}<span>${escapeHtml(target?.name || unavailable)}</span></small>${amount ? `<small class="iw-quick-amount-note">${formatNumber(amount.amount)} configured${amount.reuse ? ' · reuse on' : ''}</small>` : ''}</div><div class="iw-quick-buttons">
          ${target && skill.id !== '15' ? `<button type="button" class="iw-small-button ${current ? 'iw-quick-current' : 'iw-quick-primary'}" data-quick-resume="${escapeHtml(skill.id)}" aria-label="${current ? 'Current' : 'Start'} ${escapeHtml(skill.name)}: ${escapeHtml(target.name)}" ${busy || current || unavailable ? 'disabled' : ''} title="${escapeHtml(unavailable || (current ? 'Already running' : `Start ${target.name}`))}">${quickIcon(current ? 'check' : 'resume')}${current ? 'Current' : 'Start'}</button>${target.finite ? `<button type="button" class="iw-small-button iw-quick-row-icon" data-quick-edit="${escapeHtml(skill.id)}" aria-label="Edit amount for ${escapeHtml(target.name)}" title="Edit amount" ${busy || !ui.owner || !metadata ? 'disabled' : ''}>${quickIcon('edit')}</button>` : ''}` : ''}
          </div>${renderQuickSkillProgress(progress, skill, target, current)}</li>`;
      }).join('')}</ul></div><footer><span class="iw-quick-footer-note">Click a skill card to choose a different action.</span><button type="button" class="iw-small-button iw-options-done" data-quick-close>Done</button></footer>`);
  }

  function quickControlsMount() {
    if (AppState.ui.page && !AppState.ui.page.hidden) {
      const slot = AppState.ui.page.querySelector('[data-quick-controls-slot]');
      if (slot) return { parent: slot };
    } else {
      const actionButton = document.querySelector('skill-page button.action-stop')
        || [...document.querySelectorAll('skill-page button.action-start, skill-page button.action-invalid')]
          .filter(button => !button.closest('modal-component')).at(-1);
      if (actionButton) {
        const group = actionButton.closest('.actions') || actionButton;
        return { parent: group.parentElement, after: group, button: actionButton, native: true };
      }
    }
    const action = document.querySelector('nav-component action-component, nav-component combat-component');
    const nav = document.querySelector('nav-component .nav');
    return nav ? { parent: nav, before: action } : null;
  }

  function syncQuickSkills() {
    const runtime = quickObserve(), ui = AppState.ui.quickSkills;
    if (!document.createElement) return;
    let controls = document.querySelector('#iw-quick-controls');
    const mount = quickControlsMount();
    if (!controls && mount) {
      controls = document.createElement('div');
      controls.id = 'iw-quick-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Quick activity controls');
    }
    if (controls && mount && (controls.parentElement !== mount.parent || (mount.after && mount.after.nextElementSibling !== controls))) {
      if (mount.after) mount.after.after(controls);
      else if (mount.before) mount.before.before(controls);
      else mount.parent.appendChild(controls);
    }
    if (controls) {
      controls.className = mount?.native ? `iw-quick-native${quickNativeActionIsCurrent(runtime) ? '' : ' iw-quick-native-idle'}` : '';
      if (mount?.native) controls.style.setProperty('--iw-native-action-color', getComputedStyle(mount.button).backgroundColor);
      const markup = renderQuickControls(runtime, mount?.native);
      if (controls._iwMarkup !== markup) {
        const focusSkills = controls.contains(document.activeElement) && document.activeElement.matches?.('[data-quick-skills]');
        controls.innerHTML = markup;
        controls._iwMarkup = markup;
        if (focusSkills) controls.querySelector('[data-quick-skills]')?.focus();
      }
    }
    let host = document.querySelector('#iw-quick-skills-panel');
    if (!ui.open && !ui.prompt) { host?.remove(); ui.signature = ''; return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'iw-quick-skills-panel';
      host.className = 'iw-modal';
      host.setAttribute('data-quick-backdrop', '');
      document.body.appendChild(host);
    }
    const markup = renderQuickPanel(runtime);
    if (ui.signature !== markup) {
      const focused = host.contains(document.activeElement) ? document.activeElement : null;
      const focusLabel = focused?.getAttribute('aria-label');
      const focusAttributes = ['data-shopping-filter', 'data-shopping-item', 'data-shopping-recipe', 'data-shopping-quantity', 'data-planned-field'];
      const focusAttribute = focusAttributes.find(name => focused?.hasAttribute?.(name));
      const focusValue = focusAttribute && focused.getAttribute(focusAttribute);
      const selection = focused && Number.isInteger(focused.selectionStart) ? [focused.selectionStart, focused.selectionEnd] : null;
      const scrollTop = host.querySelector('.iw-quick-body')?.scrollTop || 0;
      host.innerHTML = markup;
      const body = host.querySelector('.iw-quick-body');
      if (body) body.scrollTop = scrollTop;
      ui.signature = markup;
      if (focusAttribute) {
        const input = [...host.querySelectorAll(`[${focusAttribute}]`)].find(input => input.getAttribute(focusAttribute) === focusValue);
        input?.focus();
        if (selection) input?.setSelectionRange?.(...selection);
      } else if (focusLabel) {
        const button = [...host.querySelectorAll('[aria-label]')].find(button => button.getAttribute('aria-label') === focusLabel && !button.disabled);
        (button || host.querySelector('[data-quick-close]'))?.focus();
      }
    }
  }

  function quickOpen(trigger) {
    const ui = AppState.ui.quickSkills;
    if (ui.open) { quickClose(); return; }
    ui.trigger = trigger;
    ui.open = true;
    syncQuickSkills();
    document.querySelector('#iw-quick-skills-panel [data-quick-close]')?.focus();
  }

  function quickClose() {
    const ui = AppState.ui.quickSkills;
    if (ui.request && !ui.request.attempted) ui.request.cancelled = true;
    ui.prompt?.resolve(null);
    ui.prompt = null;
    ui.open = false;
    AppState.ui.recipePlan.open = false;
    syncQuickSkills();
    // The toolbar may have been refreshed while the request was running.
    (ui.trigger?.isConnected ? ui.trigger : document.querySelector('[data-quick-skills]'))?.focus();
  }

  function quickPromptAmount(target, preference, limit, { edit = false, shortage = false, quantityInfo, planned = false } = {}) {
    return new Promise(resolve => {
      const ui = AppState.ui.quickSkills;
      ui.open = true;
      ui.prompt = { resolve, target, limit, edit, shortage, quantityInfo, planned, value: preference?.amount || '', reuse: preference?.reuse !== false };
      syncQuickSkills();
      document.querySelector('#iw-quick-amount')?.focus();
    });
  }

  function quickUpdateQuantity(form) {
    const ui = AppState.ui.quickSkills, prompt = ui.prompt;
    if (!prompt) return;
    prompt.value = form.elements.amount.value;
    prompt.reuse = form.elements.reuse.checked;
    prompt.save = form.elements.save?.checked === true;
    const amount = Number(prompt.value), info = prompt.quantityInfo?.(amount) || { owned: null, time: '—' };
    form.closest('.iw-quick-amount-body').querySelector('[data-quick-time]').textContent = info.time;
    form.querySelector('[data-quick-craft]').disabled = !quickAmount(amount) || amount > prompt.limit;
    const target = amount - info.owned;
    form.querySelector('[data-quick-amount-choice="target"]').disabled = !Number.isFinite(info.owned) || !quickAmount(target) || target > prompt.limit;
    form.querySelector('[data-quick-amount-error]').textContent = '';
    // Keep periodic rendering from replacing the field while the player types.
    ui.signature = renderQuickPanel(quickRuntime());
  }

  function quickSubmitAmount(form, mode = 'craft') {
    const ui = AppState.ui.quickSkills, prompt = ui.prompt;
    if (!prompt) return;
    const entered = Number(form.elements.amount.value);
    const owned = prompt.quantityInfo?.(entered)?.owned;
    const amount = mode === 'all' ? prompt.limit : mode === 'target' && Number.isFinite(owned) ? entered - owned : mode === 'target' ? NaN : entered;
    if (!quickAmount(amount) || amount > prompt.limit) {
      form.querySelector('[data-quick-amount-error]').textContent = mode === 'target' ? `Enter an inventory target above what you own and within the craftable supply.` : `Enter a whole number between 1 and ${formatNumber(prompt.limit)}.`;
      return;
    }
    const result = { amount, reuse: form.elements.reuse.checked, save: !prompt.shortage || form.elements.save?.checked === true };
    ui.prompt = null;
    prompt.resolve(result);
    syncQuickSkills();
  }

  function handleQuickSkillKey(event) {
    if (!AppState.ui.quickSkills.open || AppState.ui.shopping.selectedStep) return false;
    if (event.key === 'Escape') { event.preventDefault(); quickClose(); return true; }
    if (event.key !== 'Tab') return false;
    const controls = [...(document.querySelector('#iw-quick-skills-panel')?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]:not([tabindex="-1"]), summary') || [])]
      .filter(control => !control.closest('[hidden]') && (control.tagName === 'SUMMARY' || !control.closest('details:not([open])')));
    const index = controls.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
    }
    return true;
  }
