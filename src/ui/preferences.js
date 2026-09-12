  function renderPreferences({ prefs, automationOn, cacheLookupsOn, potionTypes = getPotionTypes(), headerIcons, questSkills, challengePrefs }) {
    const toggle = (label, description, attribute, enabled) => `<label class="iw-automation-toggle"><span><b>${label}</b><small>${description}</small></span><input type="checkbox" ${attribute} ${enabled ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
    const warnings = getWarningPrefs();
    const warningInput = (label, key, unit) => `<label class="iw-warning-field"><span>${label}</span><div><input type="number" inputmode="numeric" min="0" max="1000000000" step="1" data-warning-pref="${key}" value="${warnings[key]}" aria-label="${label} (${unit})"><small>${unit}</small></div></label>`;
    return `<div class="iw-modal ${AppState.ui.questModalOpen ? '' : 'iw-modal-hidden'}" data-modal-backdrop>
      <section class="iw-modal-panel" role="dialog" aria-modal="true" aria-labelledby="iw-options-title">
        <div class="iw-options-heading"><div><h2 id="iw-options-title">Dashboard options</h2><small>Changes are saved automatically.</small></div><div class="iw-options-header-actions">${renderScriptUpdateButton()}<button class="iw-modal-close" data-modal-close aria-label="Close options"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg></button></div></div>
        <div class="iw-options-body">
          <section class="iw-options-section"><h3>Display</h3>
            ${toggle('Show multiplayer control', "Show Ironwood's default multiplayer menu in the sidebar.", 'data-multiplayer-toggle', multiplayerControlEnabled())}
          </section>
          <section class="iw-options-section"><h3>Automation &amp; data</h3>
            ${toggle('Enable automation', 'Allow automated actions and dashboard claim buttons.', 'data-automation-toggle', automationOn)}
            ${toggle('Allow fallback lookups', 'Read a background page only when usable data is missing.', 'data-cache-lookups-toggle', cacheLookupsOn)}
            ${toggle('Debug', 'Show tracked values, cache timestamps, and refresh triggers.', 'data-debug-toggle', debugEnabled())}
          </section>
          <section class="iw-options-section iw-options-wide"><h3>Warnings</h3>
            <p class="iw-options-help">Warn below these values. Zero disables a warning. Red thresholds cannot exceed amber thresholds.</p>
            <div class="iw-warning-grid">
              ${warningInput('Queue time · amber', 'queueMinutes', 'minutes')}
              ${warningInput('Queue time · red', 'queueUrgentMinutes', 'minutes')}
              ${warningInput('Automation queue · amber', 'automationHours', 'hours')}
              ${warningInput('Automation queue · red', 'automationUrgentHours', 'hours')}
              ${warningInput('Materials · amber', 'materials', 'per material')}
              ${warningInput('Materials · red', 'materialsUrgent', 'per material')}
              ${warningInput('Low Tribute · any region', 'tribute', 'per region')}
            </div>
            <p class="iw-options-help">Adventure RP: amber below nine map costs + 16,000 RP; red below 16,000 RP. Warnings use known cached balances.</p>
          </section>
          <section class="iw-options-section iw-options-wide"><h3>Potions</h3>
            <div class="iw-potion-options">
              <label for="iw-potion-type-select">Types shown</label>
              <select id="iw-potion-type-select" data-potion-type-add><option value="">Add a potion type…</option><option value="all">All types</option>${POTION_TYPES.filter(type => !potionTypes.includes(type)).map(type => `<option value="${type}">${type}</option>`).join('')}</select>
              <div class="iw-potion-type-chips">${potionTypes.map(type => `<button type="button" data-potion-type-remove="${type}" aria-label="Remove ${type} potions">${type}<span aria-hidden="true">×</span></button>`).join('') || '<small>No types selected.</small>'}</div>
              <small>Select types to add them; click a selected type to remove it. Counts use cached inventory and equipped potions.</small>
            </div>
          </section>
          <section class="iw-options-section iw-options-wide"><h3>Challenges</h3>
            <div class="iw-challenge-config">
              <label><span>Region</span><select data-challenge-region>${Object.keys(CHALLENGE_SKILLS).map(region => `<option ${region === challengePrefs.region ? 'selected' : ''}>${region}</option>`).join('')}</select></label>
              <label><span>XP reward skill</span><select data-challenge-skill>${CHALLENGE_SKILLS[challengePrefs.region].map(skill => `<option ${skill === challengePrefs.skill ? 'selected' : ''}>${skill}</option>`).join('')}</select></label>
              <small>Claim spends available scrolls and auto-completes, then collects XP for the selected skill.</small>
            </div>
            ${toggle('Cancel blocked challenges', 'Use the trashcan when a challenge cannot auto-complete, then continue. Spent scrolls or gold are not refunded. Off shows an orange warning.', 'data-challenge-cancel-toggle', challengePrefs.cancelBlocked)}
            ${toggle('Buy scroll entries', 'After usable scrolls run out, pay gold to start challenges. Prices double with each purchase and reset weekly.', 'data-challenge-buy-toggle', challengePrefs.buyScrolls)}
            <div class="iw-challenge-config">
              <label><span>Maximum purchase tier</span><select data-challenge-buy-price>${CHALLENGE_BUY_PRICES.map((price, index) => `<option value="${price}" ${price === challengePrefs.maxBuyPrice ? 'selected' : ''}>Tier ${index + 1} · ${price / 1000}K gold</option>`).join('')}</select></label>
              <small>Maximum price per entry, not total spend. Includes the selected tier; never buys above 320K. Requires an auto-complete remaining.</small>
            </div>
          </section>
          <details class="iw-options-section iw-options-wide" data-quest-options ${AppState.ui.questOptionsExpanded ? 'open' : ''}><summary>Daily quests <small>${prefs.length} / 5 selected</small></summary>
            <p class="iw-options-help">Choose five skills for automatic quest completion.</p>
            <div class="iw-quest-grid">${questSkills.map(skill => { const checked = prefs.some(preference => questMatchesPreference({ id: skill.name, skill: skill.name }, preference)); return `<label class="${skill.done ? 'done' : ''}"><input type="checkbox" data-quest="${escapeHtml(skill.name)}" ${checked ? 'checked' : ''} ${!checked && prefs.length >= 5 ? 'disabled' : ''}><img src="${escapeHtml(skill.image)}" alt=""><span>${escapeHtml(skill.name)}</span>${skill.done ? '<b title="Completed today">✓</b>' : '<b></b>'}</label>`; }).join('') || '<p class="iw-options-help">Open Quests to load the available skills.</p>'}</div>
          </details>
        </div>
        <footer><button class="iw-small-button iw-options-done" data-modal-close><span class="iw-dialog-button-label">Done</span></button></footer>
      </section>
    </div>`;
  }

  function openPreferences(trigger) {
    AppState.ui.preferencesTrigger = trigger;
    AppState.ui.guideOpen = false;
    AppState.ui.questModalOpen = true;
    AppState.ui.lastSignature = '';
    render();
    document.querySelector('.iw-modal:not(.iw-modal-hidden) [data-modal-close]')?.focus();
    checkSettingsUpdate();
  }
  function closePreferences() {
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = false;
    AppState.ui.lastSignature = '';
    render();
    AppState.ui.preferencesTrigger?.focus();
  }
  function handlePreferencesKey(event) {
    if (!AppState.ui.questModalOpen && !AppState.ui.guideOpen) return false;
    if (event.key === 'Escape') { event.preventDefault(); closePreferences(); return true; }
    if (event.key !== 'Tab') return false;
    const dialog = document.querySelector('.iw-modal:not(.iw-modal-hidden) .iw-modal-panel');
    const controls = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') || [])].filter(control => control.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return true;
  }

  // Dialogs live outside the route content so they work on every native page.
  function renderGlobalDialog() {
    let host = document.querySelector('#iw-global-dialogs');
    if (!AppState.ui.questModalOpen && !AppState.ui.guideOpen) { host?.remove(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'iw-global-dialogs';
      document.body.appendChild(host);
    }
    if (AppState.ui.guideOpen && host._iwGuide) return;
    const cache = getCache();
    const markup = AppState.ui.guideOpen ? renderGuide() : renderPreferences({
      prefs: getPrefs(), automationOn: automationEnabled(), cacheLookupsOn: cacheLookupsEnabled(),
      headerIcons: headerIconsEnabled(), challengePrefs: getChallengePrefs(),
      questSkills: [...new Map((cache.quests?.quests || []).filter(quest => quest.skill)
        .map(quest => [quest.skill, { name: quest.skill, image: skillIcon(quest.skill), done: quest.done }])).values()]
    });
    if (host._iwMarkup === markup) return;
    const template = document.createElement('template');
    template.innerHTML = markup;
    if (host.firstElementChild) patchStatusSection(host.firstElementChild, template.content.firstElementChild);
    else host.appendChild(template.content.firstElementChild);
    host._iwMarkup = markup;
    host._iwGuide = Boolean(AppState.ui.guideOpen);
  }

  function openGuide(trigger) {
    AppState.ui.preferencesTrigger = trigger;
    AppState.ui.questModalOpen = false;
    AppState.ui.guideOpen = true;
    renderGlobalDialog();
    document.querySelector('.iw-guide-panel [data-modal-close]')?.focus({ preventScroll: true });
    const body = document.querySelector('.iw-guide-body');
    if (body) body.scrollTop = 0;
  }
