  const TRAIT_XP_FORMAT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  function traitTrainingLabel(model) {
    if (!model.available) return 'Progress is unavailable. Refresh or open Traits to check.';
    if (model.stale) return 'Updating from the game. Showing last observed progress.';
    if (!model.target) return 'Trait training complete — all traits reached level 130.';
    if (model.training === 'idle') return 'Trait training paused — no current action.';
    if (model.training === 'sigil') return 'Trait training paused — equip a Sigil with Trait XP Gain.';
    if (model.training === 'unknown') return 'Trait training status unavailable.';
    return `Training toward level ${model.target.level} across all regions.`;
  }

  function renderTraitsContent() {
    const ui = AppState.ui.traits, model = ui.model || buildTraitTracking(null);
    const disabled = quickBusy() || !traitControlsAvailable() || ui.needsRefresh || model.stale;
    const retry = ui.retry && model.available && model.target?.id === ui.retry.target ? ui.retry : null;
    const retryTrait = retry && quickRuntime()?.traits?.catalog[retry.to];
    return `<div class="iw-traits-body"><label class="iw-traits-preference">Region priority<select data-traits-region ${ui.busy || !ui.owner ? 'disabled' : ''} aria-label="Trait region priority">${[['', 'All regions'], ['Forest', 'Forest first'], ['Mountain', 'Mountain first'], ['Ocean', 'Ocean first']].map(([value, name]) => `<option value="${value}" ${ui.preference === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <p class="iw-traits-note">${escapeHtml(traitTrainingLabel(model))}</p>
      ${model.warning ? `<p class="iw-traits-warning" role="status">${escapeHtml(model.warning)}</p>` : ''}
      ${model.rows.map(row => `<div class="iw-traits-slot"><div class="iw-traits-name">${row.trait?.image ? `<img src="${escapeHtml(row.trait.image)}" alt="">` : ''}<span><strong>${escapeHtml(row.trait?.name || 'Empty training slot')}</strong><small>${row.trait ? `Level ${formatNumber(row.trait.level)}${model.target ? ` → ${model.target.level} · ${TRAIT_XP_FORMAT.format(Math.max(0, Math.ceil(model.target.xp - row.trait.xp)))} XP left` : ''}` : 'Equip a trait to train it.'}</small></span></div>
        ${row.percent !== null ? `<progress max="100" value="${row.percent}" aria-label="${escapeHtml(row.trait.name)} progress toward level ${model.target.level}"></progress>` : ''}
        ${row.replacement ? `<button type="button" class="iw-small-button iw-traits-switch" data-traits-from="${escapeHtml(row.trait?.id || '')}" data-traits-to="${escapeHtml(row.replacement.id)}" ${disabled ? 'disabled' : ''}>${row.trait ? 'Switch to' : 'Equip'} ${escapeHtml(row.replacement.name)} <small>· Level ${formatNumber(row.replacement.level)}</small></button>` : row.trait && model.target && row.trait.xp >= model.target.xp ? '<small class="iw-traits-note">Milestone reached — no unlocked replacement</small>' : ''}</div>`).join('')}
      ${model.locked ? `<p class="iw-traits-note">${model.locked} trait${model.locked === 1 ? ' still needs' : 's still need'} unlocking to complete this milestone.</p>` : ''}
      ${retryTrait ? `<button type="button" class="iw-small-button" data-traits-retry ${disabled ? 'disabled' : ''}>Retry equip: ${escapeHtml(retryTrait.name)}</button>` : ''}
      ${ui.message ? `<p class="iw-traits-message" role="status">${escapeHtml(ui.message)}</p>` : ''}
      ${model.available ? `<div class="iw-traits-sets" role="table" aria-label="Trait set progress"><div class="iw-traits-set-row" role="row"><span role="columnheader">Set</span>${[100, 115, 130].map(level => `<span role="columnheader">Lv. ${level}</span>`).join('')}</div>${['Forest', 'Mountain', 'Ocean', 'All'].map(region => `<div class="iw-traits-set-row" role="row"><strong role="rowheader">${region}</strong>${[100, 115, 130].map(level => {
        const set = model.sets.find(set => set.region === region && set.level === level);
        return `<span role="cell" class="${set.claimed ? 'iw-traits-claimed' : ''}" title="${escapeHtml(`${set.name}: ${set.description}`)}">${set.claimed ? '✓ Claimed' : set.ready ? `<button type="button" class="iw-small-button" data-traits-claim="${escapeHtml(set.id)}" aria-label="Claim ${escapeHtml(set.name)}" ${disabled ? 'disabled' : ''}>Claim</button><small>Ready to claim</small>` : `${set.reached}/${set.traitIds.length}`}</span>`;
      }).join('')}</div>`).join('')}</div>` : ''}
      <p class="iw-traits-note">Equipping changes training. Earned Trait bonuses stay active.</p></div>`;
  }

  function openTraits(trigger) {
    traitsObserve();
    AppState.ui.preferencesTrigger = trigger;
    AppState.ui.shopping.selectedStep = null;
    AppState.ui.mastery.open = false;
    AppState.ui.guideOpen = false;
    AppState.ui.questModalOpen = false;
    AppState.ui.traits.open = true;
    render();
    document.querySelector('.iw-traits-modal [data-modal-close]')?.focus();
  }

  function renderTraitsModal() {
    const ui = AppState.ui.traits;
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-traits-modal" role="dialog" aria-modal="true" aria-labelledby="iw-traits-title">
      <div class="iw-options-heading"><h2 id="iw-traits-title"><img src="/assets/misc/traits.png" alt="">Trait training</h2><div class="iw-traits-tools"><button type="button" class="iw-small-button" data-traits-refresh ${quickBusy() || !ui.owner ? 'disabled' : ''}>Refresh</button><button type="button" class="iw-small-button iw-traits-close" data-modal-close aria-label="Close Trait training">×</button></div></div>
      ${renderTraitsContent()}
      <footer><button type="button" class="iw-small-button" data-traits-native>Open Traits</button><button type="button" class="iw-small-button iw-options-done" data-modal-close>Done</button></footer>
    </section></div>`;
  }

  function renderTraitsSummaryContent() {
    const model = AppState.ui.traits.model || buildTraitTracking(null);
    const changes = model.recommendations.length;
    const claims = model.sets.filter(set => set.ready && !set.claimed).length;
    const actionable = model.available && !model.stale && (changes || claims);
    const status = !model.available ? 'Check progress' : model.stale ? 'Updating'
      : actionable ? [changes ? `Switch ${changes}` : '', claims ? `Claim ${claims}` : ''].filter(Boolean).join(' · ')
      : !model.target ? 'Complete' : ['idle', 'sigil'].includes(model.training) ? 'Paused' : model.training === 'unknown' ? 'Check training' : 'Training';
    const detail = model.target ? `Lv. ${model.target.level} · ${model.target.reached}/${model.target.traitIds.length}` : '';
    const bars = model.target ? `<span class="iw-traits-mini-bars" aria-hidden="true">${model.rows.map(row => `<span title="${escapeHtml(row.trait?.name || 'Empty slot')}"><i style="width:${row.percent ?? 0}%"></i></span>`).join('')}</span>` : '';
    return `<img src="/assets/misc/traits.png" alt=""><span class="iw-traits-summary-main"><span class="iw-traits-summary-heading"><b>Traits</b>${detail ? `<small>${detail}</small>` : ''}</span>${bars}</span><span class="iw-traits-state${actionable ? ' iw-traits-warning' : ''}" role="status">${status}</span><span class="iw-traits-chevron" aria-hidden="true">›</span>`;
  }

  function updateTraitsViews() {
    const host = AppState.ui.page?.querySelector('[data-traits-summary]');
    if (!host) return;
    const markup = renderTraitsSummaryContent();
    if (host._iwTraitsMarkup === markup) return;
    const next = host.cloneNode(false);
    next.innerHTML = markup;
    patchStatusSection(host, next);
    host._iwTraitsMarkup = markup;
  }
