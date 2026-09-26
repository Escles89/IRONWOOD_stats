  function renderMasteryModal() {
    const ui = AppState.ui.mastery, runtime = quickRuntime();
    const selectedComplete = ui.snapshot?.complete === true;
    const snapshot = selectedComplete ? null : ui.snapshot;
    const catalog = runtime?.mastery?.catalog;
    const order = runtime?.skillOrder || QUICK_SKILL_ORDER;
    const choices = Object.values(catalog || {}).filter(item => quickId(item?.id) && typeof item.name === 'string');
    const allComplete = !!ui.owner && choices.length > 0 && choices.every(item => runtime?.state.user?.masteries?.skills?.[item.id]?.complete === true);
    const masteries = choices.filter(item => runtime?.state.user?.masteries?.skills?.[item.id]?.complete !== true)
      .sort((left, right) => (order.includes(left.id) ? order.indexOf(left.id) : Infinity) - (order.includes(right.id) ? order.indexOf(right.id) : Infinity));
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const eligibility = (value, required) => value === null || required === null ? 'Unknown' : value >= required ? 'Covered' : 'Insufficient';
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-mastery-panel" role="dialog" aria-modal="true" aria-labelledby="iw-mastery-title">
      <div class="iw-options-heading"><h2 id="iw-mastery-title">Skill Mastery</h2><div class="iw-options-header-actions"><button type="button" class="iw-small-button" data-mastery-refresh ${!ui.owner || ui.refreshing || quickBusy() ? 'disabled' : ''}>${ui.refreshing ? 'Refreshing…' : 'Refresh'}</button><button type="button" class="iw-modal-close" data-modal-close aria-label="Close Skill Mastery"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg></button></div></div>
      <div class="iw-mastery-body"><div class="iw-mastery-selection"><label for="iw-mastery-select">Skill Mastery</label>
      <select id="iw-mastery-select" data-mastery-select ${!ui.owner || !catalog || !masteries.length ? 'disabled' : ''}><option value="">Choose a mastery</option>${masteries.map(item => `<option value="${item.id}" ${ui.selected === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : !catalog ? '<p>Native mastery data unavailable in this game build.</p>' : ui.selected && !catalog[ui.selected] ? '<p>Selected mastery unavailable. Choose another mastery.</p>' : ''}
      ${snapshot ? `<div class="iw-mastery-summary"><h3>${escapeHtml(snapshot.name)}</h3><p>${snapshot.complete === true ? 'Mastery complete' : snapshot.complete === false ? 'Mastery not complete' : 'Mastery completion unknown'}</p></div>
      <p>XP: ${amount(snapshot.xp)} / ${amount(snapshot.xpRequired)} · ${eligibility(snapshot.xp, snapshot.xpRequired)}<br>Coins: ${amount(snapshot.coins)} / ${amount(snapshot.coinsRequired)} · ${eligibility(snapshot.coins, snapshot.coinsRequired)}</p>
      ${snapshot.needsReconcile ? '<p role="status">Contributions changed; inventory reconciliation is incomplete. Refresh to check both balances together.</p>' : ''}${renderMasteryMaterials(snapshot, amount)}
      <p class="iw-mastery-age">Contributions observed ${Math.max(0, Math.floor((Date.now() - snapshot.contributionsAt) / 60000))} min ago; inventory observed ${Math.max(0, Math.floor((Date.now() - snapshot.inventoryAt) / 60000))} min ago. ${snapshot.rows?.some(row => [row.required, row.contributed, row.owned].includes(null)) ? 'Incomplete evidence; refresh to check.' : ''}</p>` : `<p>${allComplete ? 'All masteries are complete.' : selectedComplete ? 'Your selected mastery is complete. Choose an unfinished mastery.' : 'Choose one mastery to track its outstanding requirements.'}</p>`}
      <p class="iw-mastery-note">Pending loot: unavailable in this version. Missing after collection: unavailable.<br>Owned materials still need to be contributed. Materials alone do not complete mastery.</p>
      ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}<a href="/mastery" data-mastery-native>Open native mastery page</a></div><footer><button type="button" class="iw-small-button iw-options-done" data-modal-close>Done</button></footer></section></div>`;
  }

  function openMastery(trigger) {
    AppState.ui.preferencesTrigger = trigger;
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = false;
    AppState.ui.mastery.open = true;
    render();
    const selector = document.querySelector('#iw-mastery-select');
    (selector && !selector.disabled ? selector : document.querySelector('.iw-mastery-panel [data-modal-close]'))?.focus();
  }

  function renderMasteryMaterials(snapshot, amount) {
    if (!snapshot.rows?.length) return '<p>Material requirements unavailable.</p>';
    return `<table class="iw-mastery-table" aria-label="Mastery material requirements">
      <thead><tr><th scope="col">Item</th><th scope="col">Required</th><th scope="col">Contributed</th><th scope="col">Owned</th><th scope="col">Missing now</th></tr></thead>
      <tbody>${snapshot.rows.map(row => {
        const missing = snapshot.needsReconcile || [row.required, row.contributed, row.owned].includes(null)
          ? null : Math.max(0, row.required - row.contributed - row.owned);
        return `<tr><th scope="row"><span class="iw-mastery-resource">${row.image ? `<img src="${escapeHtml(row.image)}" alt="">` : ''}<span>${escapeHtml(row.name)}</span></span></th><td data-label="Required">${amount(row.required)}</td><td data-label="Contributed">${amount(row.contributed)}</td><td data-label="Owned">${amount(snapshot.needsReconcile ? null : row.owned)}</td><td data-label="Missing now">${amount(missing)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
