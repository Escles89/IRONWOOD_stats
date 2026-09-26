  function renderMasteryModal() {
    const ui = AppState.ui.mastery, runtime = quickRuntime();
    const selectedComplete = ui.snapshot?.complete === true;
    const snapshot = selectedComplete ? null : ui.snapshot;
    const catalog = runtime?.mastery?.catalog;
    const order = runtime?.skillOrder || QUICK_SKILL_ORDER;
    const choices = Object.values(catalog || {}).filter(item => quickId(item?.id) && typeof item.name === 'string')
      .sort((left, right) => (order.includes(left.id) ? order.indexOf(left.id) : Infinity) - (order.includes(right.id) ? order.indexOf(right.id) : Infinity));
    const completion = item => masteryCompletion(ui.owner ? runtime?.state.user?.masteries?.skills : null, item.id);
    const obtained = choices.filter(item => completion(item) === true).length;
    const allComplete = choices.length > 0 && obtained === choices.length;
    const countKnown = choices.length > 0 && choices.every(item => completion(item) !== null);
    const masteries = choices.filter(item => completion(item) !== true);
    const selected = catalog?.[ui.selected];
    const icon = item => masteryImage(`/assets/${runtime?.skillCatalog?.[item.id]?.image}`) || skillIcon(item.name);
    const amount = value => value === null ? 'Unknown' : formatNumber(value);
    const eligibility = (value, required) => value === null || required === null ? 'Unknown' : value >= required ? 'Covered' : 'Insufficient';
    const requirement = (label, value, required, image) => {
      const status = eligibility(value, required);
      const known = status !== 'Unknown';
      const percent = known ? required === 0 ? 100 : Math.min(100, value / required * 100) : null;
      const remaining = known ? Math.max(0, required - value) : null;
      return `<div data-requirement="${label}" class="iw-mastery-requirement${status === 'Covered' ? ' iw-mastery-covered' : ''}"><div class="iw-mastery-requirement-heading"><span><img src="${escapeHtml(image)}" alt="">${label}</span><small>${status === 'Covered' ? '✓ Covered' : remaining === null ? 'Unknown' : `${amount(remaining)} needed`}</small></div><div class="iw-mastery-requirement-amount"><strong>${amount(value)}</strong><span>/ ${amount(required)}</span></div><div class="iw-mastery-progress" role="progressbar" aria-label="${label} requirement" aria-valuemin="0" aria-valuemax="100" ${known ? `aria-valuenow="${percent}"` : ''} aria-valuetext="${amount(value)} of ${amount(required)} · ${status}"><span style="width:${percent ?? 0}%"></span></div></div>`;
    };
    return `<div class="iw-modal" data-modal-backdrop><section class="iw-modal-panel iw-mastery-panel" role="dialog" aria-modal="true" aria-labelledby="iw-mastery-title">
      <div class="iw-options-heading"><div class="iw-mastery-heading"><h2 id="iw-mastery-title"><img src="${escapeHtml(selected ? icon(selected) : '/assets/misc/mastery.png')}" alt=""><span><small>Skill mastery tracking</small><strong>${selected ? escapeHtml(selected.name) : 'Choose a skill'}</strong></span></h2>
      <div class="iw-mastery-achievements"><span class="iw-mastery-symbols" role="group" aria-label="Obtained masteries">${choices.filter(item => completion(item) === true).map(item => `<img class="is-obtained" title="${escapeHtml(item.name)} · Obtained" src="${escapeHtml(skillIcon(item.name).replace('/misc/', '/badges/'))}" alt="${escapeHtml(item.name)} mastery obtained">`).join('')}</span><small>${countKnown ? `${obtained} / ${choices.length} masteries obtained` : 'Mastery count unavailable'}</small></div></div>
      <div class="iw-options-header-actions"><button type="button" class="iw-small-button" data-mastery-refresh ${!ui.owner || ui.refreshing || quickBusy() || masteryCollectionPending(runtime) ? 'disabled' : ''}>${ui.refreshing ? 'Refreshing…' : 'Refresh'}</button><button type="button" class="iw-modal-close iw-mastery-settings" data-mastery-settings ${!ui.owner || !catalog || !masteries.length ? 'disabled' : ''} aria-label="Choose skill to follow" title="Choose skill to follow" aria-expanded="${Boolean(ui.choosing)}" aria-controls="iw-mastery-picker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-.6 2.5-2.2 1.3-2.5-.7-2 3.5 1.9 1.8v2.6l-1.9 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.6-2.5 2.2-1.3 2.5.7 2-3.5-1.9-1.8V11l1.9-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z"></path><circle cx="11" cy="12.5" r="3"></circle></svg></button><button type="button" class="iw-modal-close" data-modal-close aria-label="Close Skill Mastery"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg></button></div></div>
      <div class="iw-mastery-body"><div id="iw-mastery-picker" class="iw-mastery-picker" ${ui.choosing && ui.owner && masteries.length ? '' : 'hidden'}>${ui.choosing && ui.owner ? `<p>Choose a skill to follow</p><div>${masteries.map(item => `<button type="button" class="iw-mastery-choice" data-mastery-pick="${item.id}" aria-pressed="${ui.selected === item.id}"><img src="${escapeHtml(icon(item))}" alt=""><span>${escapeHtml(item.name)}</span>${ui.selected === item.id ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>` : ''}</div>
      ${!ui.owner ? '<p>Character identity unavailable.</p>' : !catalog ? '<p>Native mastery data unavailable in this game build.</p>' : ui.selected && !catalog[ui.selected] ? '<p>Selected mastery unavailable. Choose another mastery.</p>' : ''}
      ${snapshot ? `<div class="iw-mastery-requirements">${requirement('XP', snapshot.xp, snapshot.xpRequired, selected ? icon(selected) : '/assets/misc/mastery.png')}${requirement('Coins', snapshot.coins, snapshot.coinsRequired, '/assets/misc/coin.png')}</div><p class="iw-mastery-completion">${snapshot.complete === false ? 'Mastery not complete' : 'Mastery completion unknown'}</p>
      ${snapshot.needsReconcile ? '<p role="status">Contributions changed; inventory reconciliation is incomplete. Refresh to check both balances together.</p>' : ''}${renderMasteryMaterials(snapshot, amount)}
      ${snapshot.collectionPending ? '<p role="status">Collection or synchronization in progress; combined balances are incomplete.</p>' : ''}
      <p class="iw-mastery-age">Contributions observed ${Math.max(0, Math.floor((Date.now() - snapshot.contributionsAt) / 60000))} min ago; inventory observed ${Math.max(0, Math.floor((Date.now() - snapshot.inventoryAt) / 60000))} min ago. ${snapshot.loot?.observedAt ? `Current Loot observed ${Math.max(0, Math.floor((Date.now() - snapshot.loot.observedAt) / 60000))} min ago.` : 'Current Loot unavailable.'} ${!snapshot.loot?.complete || snapshot.rows?.some(row => [row.required, row.contributed, row.owned].includes(null)) ? 'Incomplete evidence; refresh to check.' : ''}</p>` : `<p>${allComplete ? 'All masteries are complete.' : selectedComplete ? 'Your selected mastery is complete. Choose an unfinished mastery.' : 'Choose one mastery to track its outstanding requirements.'}</p>`}
      <p class="iw-mastery-note">Missing after collection applies if you collect the current action's pending loot. Owned materials still need to be contributed. Materials alone do not complete mastery.</p>
      ${ui.message ? `<p role="status">${escapeHtml(ui.message)}</p>` : ''}<a href="/mastery" data-mastery-native>Open native mastery page</a></div><footer><button type="button" class="iw-small-button iw-options-done" data-modal-close>Done</button></footer></section></div>`;
  }

  function openMastery(trigger) {
    const ui = masteryObserve();
    AppState.ui.preferencesTrigger = trigger;
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = false;
    ui.open = true;
    ui.choosing = !ui.selected;
    render();
    const settings = document.querySelector('[data-mastery-settings]');
    (settings && !settings.disabled ? settings : document.querySelector('.iw-mastery-panel [data-modal-close]'))?.focus();
  }

  function toggleMasteryPicker() {
    const ui = AppState.ui.mastery;
    if (!ui.open || !ui.owner) return;
    ui.choosing = !ui.choosing;
    render();
    document.querySelector(ui.choosing ? '[data-mastery-pick]' : '[data-mastery-settings]')?.focus();
  }

  function renderMasteryMaterials(snapshot, amount) {
    if (!snapshot.rows?.length) return '<p>Material requirements unavailable.</p>';
    return `<table class="iw-mastery-table" aria-label="Mastery material requirements">
      <thead><tr><th scope="col">Item</th><th scope="col">Required</th><th scope="col">Contributed</th><th scope="col">Owned</th><th scope="col">Pending loot</th><th scope="col">Missing now</th><th scope="col">Missing after collection</th></tr></thead>
      <tbody>${snapshot.rows.map(row => {
        const balancesUnknown = snapshot.needsReconcile || snapshot.collectionPending;
        const missing = balancesUnknown || [row.required, row.contributed, row.owned].includes(null)
          ? null : Math.max(0, row.required - row.contributed - row.owned);
        const pending = row.identityKnown !== true ? null : snapshot.loot?.items[row.id] ?? (snapshot.loot?.complete ? 0 : null);
        const after = missing === null || pending === null || !snapshot.loot?.complete ? null : Math.max(0, missing - pending);
        const coverage = after === null && missing !== null && pending !== null && !snapshot.loot?.retained
          ? ` <small>Known loot covers ${amount(Math.min(missing, pending))}; incomplete</small>` : '';
        return `<tr class="${missing === 0 ? 'iw-mastery-covered' : ''}"><th scope="row"><span class="iw-mastery-resource">${row.image ? `<img src="${escapeHtml(row.image)}" alt="">` : ''}<span>${escapeHtml(row.name)}</span></span></th><td data-label="Required">${amount(row.required)}</td><td data-label="Contributed">${amount(row.contributed)}</td><td data-label="Owned">${amount(balancesUnknown ? null : row.owned)}</td><td data-label="Pending loot">${amount(pending)}${pending !== null && snapshot.loot?.retained ? ' (last observed)' : ''}</td><td data-label="Missing now">${amount(missing)}</td><td data-label="Missing after collection">${amount(after)}${coverage}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
