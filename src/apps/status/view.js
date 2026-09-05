  function updateLiveValues(action, loot, consumables, materials, masteryProgress) {
    if (!AppState.ui.page) return;
    if (action?.isCombat && Number.isFinite(action.progress)) {
      AppState.ui.page.querySelector('.iw-combat-card')?.style.setProperty('--combat-progress', `${action.progress}%`);
      action.combatants?.forEach((fighter) => {
        const element = AppState.ui.page.querySelector(`.iw-fighter-${fighter.side}`);
        const fill = element?.querySelector('.iw-hp-fill');
        if (element && fighter.hit) element.style.setProperty('--iw-hit-delay', '0ms');
        if (element) element.classList.toggle('iw-hit', Boolean(fighter.hit));
        if (element) element.classList.toggle('iw-fighter-dead', Boolean(fighter.dead));
        if (element) element.classList.toggle('iw-spawn', Boolean(fighter.spawn));
        if (fill && Number.isFinite(fighter.hpPercent)) fill.style.width = `${fighter.hpPercent}%`;
        if (element && Number.isFinite(fighter.meterPercent)) element.style.setProperty('--fighter-progress', `${fighter.meterPercent}%`);
        const track = element?.querySelector('.iw-hp-track');
        if (track && fighter.hit && Number.isFinite(fighter.lostPercent) && Number.isFinite(fighter.hpPercent)) {
          const eventKey = `${fighter.hpPercent}:${fighter.lostPercent}`;
          const existing = track.querySelector('.iw-hp-damage');
          if (!existing || existing.dataset.eventKey !== eventKey) {
            existing?.remove();
            const damage = document.createElement('span');
            damage.className = 'iw-hp-damage';
            damage.dataset.eventKey = eventKey;
            damage.style.left = `${fighter.hpPercent}%`;
            damage.style.width = `${Math.max(0, fighter.lostPercent - fighter.hpPercent)}%`;
            track.appendChild(damage);
          }
        }
      });
    }
    const text = (selector, value) => { const element = AppState.ui.page.querySelector(selector); if (element && element.textContent !== String(value)) element.textContent = value; };
    if (action) {
      const actionFill = AppState.ui.page.querySelector('[data-live-progress]');
      if (actionFill) actionFill.style.width = `${action.progress ?? 0}%`;
      const skillFill = AppState.ui.page.querySelector('[data-live-skill-progress]');
      if (skillFill) skillFill.style.width = `${action.skillProgress ?? 0}%`;
      text('[data-live-level-remaining]', Number.isFinite(action.levelRemaining) ? `${action.levelRemaining}% remaining` : '—');
      text('[data-live-xp-hour]', action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—');
      const reviveElement = AppState.ui.page.querySelector('[data-live-revive]');
      if (reviveElement) {
        const remaining = Number(action.reviveRemainingMs) || 0;
        reviveElement.textContent = remaining > 0 ? `Revive in ${formatReviveTime(remaining)}` : '';
        reviveElement.hidden = remaining <= 0;
      }
    }
    text('[data-live-loot-total]', `${formatNumber(loot.reduce((sum, item) => sum + item.amount, 0))} items waiting`);
    text('[data-live-queue-loot]', formatCompact(loot.reduce((sum, item) => sum + item.amount, 0)));
    loot.forEach((item, index) => text(`[data-live-loot="${index}"]`, formatNumber(item.amount)));
    consumables.forEach((item, index) => {
      const storedOnly = /stardust|mastery contract/i.test(item.name);
      text(`[data-live-consumable-${storedOnly ? 'stored' : 'equipped'}="${index}"]`, formatNumber(parseCompact(item.amount)));
    });
    const liveMasteryContract = consumables.find((item) => /mastery contract/i.test(item.name));
    if (liveMasteryContract) text('[data-live-mastery-contract]', formatNumber(parseCompact(liveMasteryContract.amount)));
    materials.forEach((item, index) => {
      text(`[data-live-material-available="${index}"]`, formatNumber(item.available));
    });
    text('[data-live-mastery-progress]', masteryProgress.cap ? `${formatCompact(masteryProgress.current)} / ${formatCompact(masteryProgress.cap)}` : '—');
    const automationCache = getCache().automations;
    (automationCache?.structures || []).forEach((item, index) => {
      const projected = projectedAutomation(item, automationCache.checkedAt);
      text(`[data-live-automation-loot="${index}"]`, projected.lootAmount ? formatNumber(projected.lootAmount) : '0');
      text(`[data-live-automation-queue="${index}"]`, projected.queuedTotal ? formatNumber(Math.max(0, projected.queuedTotal - projected.queuedDone)) : '0');
    });
    text('[data-live-guild-event-detail]', guildEventDetail(getCache().guildEvent));
    text('[data-live-adventure-detail]', adventureDetail(getCache().adventure));
    text('[data-live-guild-trial-detail]', guildTrialDetail(getCache().guildTrial));
  }

  const StatusRenderer = {
    render(state) {
      if (state !== AppState) throw new Error('StatusRenderer requires the application state');
      return render();
    },
    updateLive(state) {
      const { action, loot, consumables, materials, masteryProgress } = state.live;
      return updateLiveValues(action, loot, consumables, materials, masteryProgress);
    }
  };
  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STATUS_STYLES;
    document.head.appendChild(style);
  }

  function renderStatusMarkup({ combatDeath, noticeNow, queueWarning, materialWarning, materialWarningText, cache, adventureActive, guildEventActionActive, guildTrialActive, prefs, automationOn, cacheLookupsOn, masteryAchieved, automationRows, questSkills, challengePrefs, dailyQuestComplete, taskIndicator, adventureIndicator, guildTrialIndicator, guildEventIndicator, attunementSkills, attunementDetails, challengeDetails, challengeIndicator, tamingDetails, tamingIndicator, adventureSupplement, showSuperPotions, consumableRows, displayedPotions, inventoryCounts, totalItems, compactCraftingLoot, craftedInventory, action, loot, consumables, materials, masteryProgress, finiteQueue, locationBadges, displayActionName }) {
    return `<div class="iw-stats-grid">
        ${action ? `
        <section class="iw-card iw-action-card ${action.isCombat ? `iw-combat-card${combatDeath ? ' iw-death' : ''}` : ''}" style="--combat-progress:${action.progress ?? 0}%">
          <div class="iw-card-header"><span>Current Action</span><span class="iw-action-badges">${action.isCombat ? '<span class="iw-combat-live"><i></i> LIVE</span>' : ''}
            <span class="iw-mastery-badge ${masteryAchieved ? 'achieved' : ''}" title="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'}" aria-label="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'}"><img src="/assets/misc/mastery.png" alt=""></span>
            ${adventureActive ? '<span class="iw-adventure-badge" title="Adventure in progress" aria-label="Adventure in progress"><img src="/assets/misc/adventure.png" alt=""></span>' : ''}
            ${guildEventActionActive ? `<span class="iw-guild-event-badge" title="${escapeHtml(cache.guildEvent.eventName)} contribution active" aria-label="${escapeHtml(cache.guildEvent.eventName)} contribution active"><img src="/assets/misc/combat.png" alt=""></span>` : ''}
            ${guildTrialActive ? '<span class="iw-guild-trial-badge" title="Guild trial in progress" aria-label="Guild trial in progress"><img src="/assets/misc/quests.png" alt=""></span>' : ''}
            ${locationBadges}
            <span class="iw-active-badge ${action.reviveRemainingMs > 0 ? 'revive-active' : ''}" title="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}" aria-label="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}"><svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg></span>
            ${materialWarning ? `<span class="iw-material-warning ${materialWarning}" title="${escapeHtml(materialWarningText)}" aria-label="${escapeHtml(materialWarningText)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg></span>` : ''}
            ${queueWarning ? `<span class="iw-queue-warning ${queueWarning}" title="Queue finishes in ${escapeHtml(finiteQueue.time)}" aria-label="Queue finishes in ${escapeHtml(finiteQueue.time)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path></svg></span>` : ''}
            ${action.reviveRemainingMs > 0 ? '<span class="iw-revive-badge" title="Character defeated" aria-label="Character defeated">☠</span>' : ''}
          </span></div>
          <div class="iw-action-body">
            <div class="iw-action-image">${action.image ? `<img src="${escapeHtml(action.image)}" alt="">` : ''}</div>
            <div class="iw-action-name"><span class="iw-action-title"><strong>${escapeHtml(displayActionName)}</strong>${action.level ? `<small>(${escapeHtml(action.level.replace(/^Lv\.\s*/i, 'lvl '))})</small>` : ''}</span><span class="iw-action-meta">${action.skillName || action.skillLevel ? `<span>${escapeHtml([action.skillName, action.skillLevel].filter(Boolean).join(' '))}</span>` : ''}<span data-live-xp-hour>${action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—'}</span><span data-live-level-remaining>${Number.isFinite(action.levelRemaining) ? `${action.levelRemaining}% remaining` : '—'}</span><span class="iw-revive-timer" data-live-revive ${action.reviveRemainingMs > 0 ? '' : 'hidden'}>${action.reviveRemainingMs > 0 ? `Revive in ${formatReviveTime(action.reviveRemainingMs)}` : ''}</span></span></div>
            ${finiteQueue ? `<div class="iw-queue-summary"><span>Finishes in</span><strong>${escapeHtml(finiteQueue.time)}</strong>${compactCraftingLoot ? `<small class="iw-queue-values"><span title="Current loot"><b data-live-queue-loot>${formatCompact(totalItems)}</b> <em>loot</em></span><span title="Total craft queue"><b>${formatCompact(finiteQueue.total)}</b> <em>queued</em></span><span title="Inventory"><b>${escapeHtml(craftedInventory?.amountText || '0')}</b> <em>owned</em></span></small>` : `<small>${formatNumber(finiteQueue.completed)} / ${formatNumber(finiteQueue.total)} actions</small>`}</div>` : ''}
          </div>
          ${renderCombatants(action)}
          ${action.isCombat ? '' : `<div class="iw-progress-stack">
            <div class="iw-progress iw-action-progress" title="Current action progress"><div data-live-progress style="width:${action.progress ?? 0}%"></div></div>
            <div class="iw-progress iw-skill-progress" title="${escapeHtml(action.skillName || 'Skill')} level progress"><div data-live-skill-progress style="width:${action.skillProgress ?? 0}%"></div></div>
          </div>`}
          ${materials.length ? `<div class="iw-subheader">Materials</div><div class="iw-materials"><div class="iw-material-head"><span></span><span>Material</span><span>Available</span></div>${materials.map((item, index) => `<div class="iw-material"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b data-live-material-available="${index}">${formatNumber(item.available)}</b></div>`).join('')}</div>` : ''}
          <div class="iw-subheader">Consumables</div>
          <div class="iw-consumables">${consumableRows.length ? `<div class="iw-consumable-head"><span></span><span>Consumable</span><span>Equipped</span><span>Stored</span></div>${consumableRows.map((item) => `<div class="iw-consumable"><img src="${escapeHtml(item.image)}" alt=""><span class="iw-consumable-name">${escapeHtml(item.name)}${item.masteryContract ? ` <small>· <span data-live-mastery-progress>${masteryProgress.cap ? `${formatCompact(masteryProgress.current)} / ${formatCompact(masteryProgress.cap)}` : '—'}</span></small>` : ''}</span>${item.storedOnly ? '<i></i>' : `<b data-live-consumable-equipped="${item.liveIndex}">${formatNumber(item.equipped || 0)}</b>`}<b class="${item.stored ? '' : 'iw-zero'}" ${item.masteryContract ? 'data-live-mastery-contract' : item.liveIndex === null ? '' : `data-live-consumable-stored="${item.liveIndex}"`}>${formatNumber(item.stored || 0)}</b></div>`).join('')}` : '<div class="iw-muted">No consumables equipped.</div>'}</div>
        </section>` : `
        <section class="iw-card iw-empty iw-action-card"><strong>No action in progress</strong><span>Start an action and its live stats will appear here.</span></section>`}
        ${compactCraftingLoot ? '' : `<section class="iw-card iw-loot-card">
          <div class="iw-card-header"><span>Current Loot</span><div class="iw-summary"><span data-live-loot-total>${formatNumber(totalItems)} items waiting</span>${action && loot.length ? `<button class="iw-collect-button" data-collect-loot ${automationOn ? '' : 'disabled'} title="${automationOn ? 'Claim loot and continue' : 'Automation is disabled'}">Claim</button>` : ''}</div></div>
          ${loot.length ? `<div class="iw-data-table iw-loot-table">
            <div class="iw-table-head"><span>Item</span><span>Loot</span><span>Inventory</span></div>${loot.map((item) => `
            <div class="iw-table-row ${isHighValueDrop(item) ? 'iw-rare-drop' : ''}">
              <div class="iw-table-item"><span class="iw-item-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}</span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number" data-live-loot="${loot.indexOf(item)}" data-value-icon="${escapeHtml(item.image)}" data-value-delta="${AppState.ui.lootDeltaNotices.get(item.image || item.name)?.delta ? `${AppState.ui.lootDeltaNotices.get(item.image || item.name).delta > 0 ? '+' : ''}${formatNumber(AppState.ui.lootDeltaNotices.get(item.image || item.name).delta)}` : ''}" style="--iw-value-delta-delay:-${Math.min(4000, Math.max(0, noticeNow - (AppState.ui.lootDeltaNotices.get(item.image || item.name)?.started || noticeNow)))}ms">${formatNumber(item.amount)}</div>
              ${item.name === 'Coins' ? '<div class="iw-table-number iw-coin-inventory" aria-label="Not applicable"></div>' : `<div class="iw-table-number ${inventoryCounts.get(item.image.split('/').pop()?.split('?')[0])?.amount ? '' : 'iw-zero'}">${escapeHtml(inventoryCounts.get(item.image.split('/').pop()?.split('?')[0])?.amountText || '0')}</div>`}
            </div>`).join('')}</div>` : '<div class="iw-empty-loot">No loot waiting to be collected.</div>'}
        </section>`}
        <section class="iw-card iw-activity-card">
          <div class="iw-card-header"><span>Status</span><button class="iw-icon-button iw-preferences-button" data-quest-modal title="Configure daily quests" aria-label="Configure daily quests"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"></path><circle cx="11" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="8" cy="18" r="2"></circle></svg></button></div>
          <div class="iw-status-list">
            <div class="iw-status-row iw-status-link" data-route="/challenges" role="link" tabindex="0"><img src="/assets/items/challenge-scroll.png"><span><b>Challenges</b><small>${escapeHtml(challengeDetails)}</small></span>${challengeIndicator}</div>
            <div class="iw-status-row"><img src="/assets/misc/quests.png"><span><b>Daily quests</b><small>${Math.min(cache.quests?.completed || 0, 5)} / 5 completed today${prefs.length === 5 ? ' · next selection ready' : ` · ${prefs.length}/5 selected for next run`}</small></span>${taskIndicator('quests', dailyQuestComplete, 'Pending')}</div>
            <div class="iw-status-row iw-status-link" data-route="/adventure" role="link" tabindex="0"><img src="/assets/misc/adventure.png"><span><b>Adventure</b><small><span data-live-adventure-detail>${escapeHtml(adventureDetail(cache.adventure))}</span>${adventureSupplement ? ` · ${escapeHtml(adventureSupplement)}` : ''}</small></span>${adventureIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/skill/15" role="link" tabindex="0"><img src="/assets/items/pet-snacks.png"><span><b>Taming</b><small>${escapeHtml(tamingDetails)}</small></span>${tamingIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/attunement" role="link" tabindex="0"><img src="/assets/misc/attunement.png"><span><b>Attunement</b><small>${escapeHtml(attunementDetails)}</small></span><button class="iw-small-button" data-collect-attunement ${automationOn && attunementSkills.length ? '' : 'disabled'} title="${automationOn ? 'Claim all Attunement loot' : 'Automation is disabled'}">Claim</button></div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/combat.png"><span><b>Guild event</b><small data-live-guild-event-detail>${escapeHtml(guildEventDetail(cache.guildEvent))}</small></span>${guildEventIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/quests.png"><span><b>Guild trials</b><small data-live-guild-trial-detail>${escapeHtml(guildTrialDetail(cache.guildTrial))}</small></span>${guildTrialIndicator}</div>
          </div>
        </section>
        ${renderPotionPanel(displayedPotions, showSuperPotions)}
        ${renderAutomationsPanel(automationRows, cache, automationOn)}
        <div class="iw-modal ${AppState.ui.questModalOpen ? '' : 'iw-modal-hidden'}" data-modal-backdrop>
          <section class="iw-modal-panel" role="dialog" aria-modal="true" aria-label="Automation preferences">
            <div class="iw-card-header"><span>Automation Preferences</span><button class="iw-modal-close" data-modal-close>×</button></div>
            <label class="iw-automation-toggle"><span><b>Enable automation</b><small>${automationOn ? 'Actions may run automatically or from Status buttons.' : 'No game-changing actions will be performed.'}</small></span><input type="checkbox" data-automation-toggle ${automationOn ? 'checked' : ''}><i aria-hidden="true"></i></label>
            <label class="iw-automation-toggle"><span><b>Enable cache lookups</b><small>${cacheLookupsOn ? 'Missing or expired data may be refreshed in background pages.' : 'Only live data and pages you open manually update cached information.'}</small></span><input type="checkbox" data-cache-lookups-toggle ${cacheLookupsOn ? 'checked' : ''}><i aria-hidden="true"></i></label>
            <div class="iw-modal-section-title">Interface</div>
            <label class="iw-automation-toggle"><span><b>Show Super potions</b><small>Include Super potions you have in inventory in the Potions table.</small></span><input type="checkbox" data-super-potions-toggle ${showSuperPotions ? 'checked' : ''}><i aria-hidden="true"></i></label>
            <div class="iw-interface-actions"><button class="iw-small-button" data-open-multiplayer>Multiplayer</button><small>Open Ironwood's multiplayer controls.</small></div>
            <div class="iw-modal-section-title">Daily quests</div>
            <div class="iw-quest-help">Choose exactly five skills. The matching daily action may change, but your skill preferences remain the same.</div>
            <div class="iw-quest-grid">${questSkills.map((skill) => { const checked = prefs.includes(skill.name); return `<label class="${skill.done ? 'done' : ''}"><input type="checkbox" data-quest="${escapeHtml(skill.name)}" ${checked ? 'checked' : ''} ${!checked && prefs.length >= 5 ? 'disabled' : ''}><img src="${escapeHtml(skill.image)}"><span>${escapeHtml(skill.name)}</span><b>${skill.done ? 'Done' : 'Pending'}</b></label>`; }).join('') || '<div class="iw-muted">Open quests once to load the available skills.</div>'}</div>
            <div class="iw-modal-section-title">Challenges</div>
            <div class="iw-challenge-config">
              <label><span>Region</span><select data-challenge-region>${Object.keys(CHALLENGE_SKILLS).map((region) => `<option ${region === challengePrefs.region ? 'selected' : ''}>${region}</option>`).join('')}</select></label>
              <label><span>Reward skill</span><select data-challenge-skill>${CHALLENGE_SKILLS[challengePrefs.region].map((skill) => `<option ${skill === challengePrefs.skill ? 'selected' : ''}>${skill}</option>`).join('')}</select></label>
              <small>Run uses one Challenge Scroll, selects ${escapeHtml(challengePrefs.region)}, auto-completes the challenge, and claims XP for ${escapeHtml(challengePrefs.skill)}.</small>
            </div>
            <footer><span>${prefs.length} / 5 quests selected</span><button class="iw-small-button" data-modal-close>Done</button></footer>
          </section>
        </div>
      </div>`;
  }
