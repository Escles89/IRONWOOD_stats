  function renderRegionIcon(region, decorative = false) {
    const paths = {
      Forest: 'M12 3 5 12h4l-5 6h7v3h2v-3h7l-5-6h4L12 3Z',
      Mountain: 'm2 20 8-16 5 10 3-6 4 12H2ZM7 10l3 2 3-2',
      Ocean: 'M2 8c4-6 6-6 10 0s6 6 10 0M2 16c4-6 6-6 10 0s6 6 10 0'
    };
    if (!Object.hasOwn(paths, region)) return '';
    return `<svg class="iw-region-icon" viewBox="0 0 24 24" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escapeHtml(region)}"`}><title>${escapeHtml(region)}</title><path d="${paths[region]}"></path></svg>`;
  }

  function renderGuildEventSummary(entry) {
    const state = guildEventState(entry);
    const detail = guildEventDetail(entry);
    const token = (paths, label, value = '') => `<span class="iw-event-detail-token" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>${value ? `<span aria-hidden="true">${escapeHtml(value)}</span>` : ''}</span>`;
    const clock = '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>';
    const types = {
      Gathering: '<path d="M20 3C9 2 3 7 5 14s15 7 15-11Z"></path><path d="M3 21 15 9"></path>',
      Crafting: '<path d="m14 3 7 7-3 3-3-3-9 11-3-3L14 9l-3-3 3-3Z"></path>',
      Combat: '<path d="m14 3 7 0 0 7-11 11-7-7L14 3Z" transform="translate(2 -1) scale(.85)"></path><path d="m4 14 6 6M3 21l4-4"></path>'
    };
    const eventType = (name, next = false) => {
      const type = Object.keys(types).find(type => new RegExp(type, 'i').test(name || ''));
      if (!type) return '';
      const label = `${next ? 'Next event' : 'Event'}: ${type}`;
      const arrow = next ? '<svg class="iw-event-next" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"></path></svg>' : '';
      return arrow + token(types[type], label);
    };
    if (state === 'Cooldown') {
      const remaining = Number(entry.expiresAt) - Date.now();
      return `${remaining > 0 ? token(clock, `Ready in ${formatDuration(remaining / 1000)}`, formatDuration(remaining / 1000)) : '<span>Ready to start</span>'}${eventType(nextGuildEventName(entry.eventName), true)}`;
    }
    if (state === 'Participating' || state === 'Completed') {
      const remaining = Number(state === 'Completed' ? entry.eventEndsAt : entry.stateEndsAt) - Date.now();
      const xp = `${formatNumber(entry.personalXp || 0)} XP`;
      return `${eventType(entry.eventName)}<span title="Contribution XP">${escapeHtml(xp)}</span>${remaining > 0 ? token(clock, `${state === 'Completed' ? 'Event ends' : 'Participation ends'} in ${formatDuration(remaining / 1000)}`, formatDuration(remaining / 1000)) : ''}`;
    }
    return `${eventType(entry?.eventName)}<span>${escapeHtml(detail)}</span>`;
  }

  function renderAttunementTributes(entry = {}) {
    const regions = ['Forest', 'Mountain', 'Ocean'];
    const threshold = getWarningPrefs().tribute;
    const pairs = (entry.selected || []).filter(slot => slot.skill).map(slot => {
      const matches = TRAIT_REGIONS.filter(region => region.skills.includes(slot.skill));
      const region = regions.includes(slot.tribute) ? slot.tribute : matches.length === 1 ? matches[0].name : null;
      return { skill: slot.skill, region };
    });
    // Keep balances visible for regions without a selected skill as well.
    regions.filter(region => !pairs.some(pair => pair.region === region)).forEach(region => pairs.push({ region }));
    return `<small class="iw-resource-line iw-tribute-balances">${pairs.map(({ skill, region }) => {
      const value = region ? entry.tributes?.[region] : null;
      const amount = resourceAmount(value);
      const low = Number.isFinite(value) && value >= 0 && value < threshold;
      const shards = skill ? readPendingAttunementShards(skill) : null;
      const shardLabel = `${skill} shards waiting in Attunement loot`;
      const label = `${region || 'Unconfirmed region'} Tribute: ${amount}${low ? ' (low)' : ''}`;
      return `<span class="iw-attunement-pair${low ? ' iw-low-tribute' : ''}" title="${escapeHtml(skill ? `${skill} · ${label}` : label)}">${region ? `<img src="/assets/items/tribute-${region.toLowerCase()}.png" alt="${region} Tribute">` : '<span aria-hidden="true"></span>'}<span class="iw-tribute-amount" role="img" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(amount)}</span></span><span class="iw-attunement-divider" aria-hidden="true"></span><span class="iw-attunement-skill">${skill ? renderStatusSkillIcon(skill) : ''}</span><span class="iw-attunement-divider" aria-hidden="true"></span>${skill ? `<span class="iw-pending-shards" title="${escapeHtml(shardLabel)}"><img src="/assets/items/attunement-shard.png" alt="${escapeHtml(shardLabel)}"><span>${shards === null ? '—' : formatNumber(shards)}</span></span>` : ''}</span>`;
    }).join('')}</small>`;
  }

  function renderStatusSkillIcon(skill) {
    return `<img class="iw-status-skill-icon" src="${escapeHtml(skillIcon(skill))}" alt="${escapeHtml(skill)}" title="${escapeHtml(skill)}">`;
  }

  function renderActionBadges({ importantOnly = false, action, masteryAchieved, adventureActionActive, guildEventActionActive, guildTrialActionActive, cache, locationBadges, materialWarning, materialWarningText, queueWarning, finiteQueue }) {
    if (!action) return '';
    return `<span class="iw-action-badges">${!importantOnly && action.isCombat ? '<span class="iw-combat-live"><i></i> LIVE</span>' : ''}
            ${importantOnly ? '' : `<span class="iw-mastery-badge ${masteryAchieved ? 'achieved' : ''}" title="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'}" aria-label="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'}"><img src="/assets/misc/mastery.png" alt=""></span>`}
            ${adventureActionActive ? `<span class="iw-adventure-badge" title="${escapeHtml(cache.adventure.mapName || 'Adventure')} in progress" aria-label="${escapeHtml(cache.adventure.mapName || 'Adventure')} in progress"><img src="/assets/misc/adventure.png" alt=""></span>` : ''}
            ${guildEventActionActive ? `<span class="iw-guild-event-badge" title="${escapeHtml(cache.guildEvent.eventName)} contribution active" aria-label="${escapeHtml(cache.guildEvent.eventName)} contribution active"><img src="/assets/misc/combat.png" alt=""></span>` : ''}
            ${guildTrialActionActive ? `<span class="iw-guild-trial-badge" title="${escapeHtml(cache.guildTrial.activeName)} bonus active (+10% XP)" aria-label="${escapeHtml(cache.guildTrial.activeName)} bonus active (+10% XP)"><img src="/assets/misc/quests.png" alt=""></span>` : ''}
            ${locationBadges}
            <span class="iw-active-badge ${action.reviveRemainingMs > 0 ? 'revive-active' : ''}" title="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}" aria-label="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}">${renderActionSpinner()}</span>
            ${materialWarning ? `<span class="iw-material-warning ${materialWarning}" title="${escapeHtml(materialWarningText)}" aria-label="${escapeHtml(materialWarningText)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg></span>` : ''}
            ${queueWarning ? `<span class="iw-queue-warning ${queueWarning}" title="Queue finishes in ${escapeHtml(finiteQueue.time)}" aria-label="Queue finishes in ${escapeHtml(finiteQueue.time)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path></svg></span>` : ''}
            ${!importantOnly && action.reviveRemainingMs > 0 ? '<span class="iw-revive-badge" title="Character defeated" aria-label="Character defeated">☠</span>' : ''}
          </span>`;
  }

  // Reconcile existing nodes so panel refreshes preserve CSS animations,
  // fighter images, quantity notices and HP transitions.
  function patchStatusSection(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next);
      return;
    }
    if (current.nodeType !== 1) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    // CSS offsets are applied once per event, never advanced on a retained node.
    const previousEvents = JSON.parse(current.getAttribute('data-effect-times') || '{}');
    const nextEvents = JSON.parse(next.getAttribute('data-effect-times') || '{}');
    for (const attr of [...current.attributes]) {
      if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    }
    for (const attr of next.attributes) {
      if (attr.name === 'style') {
        for (const property of [...current.style]) {
          if (!next.style.getPropertyValue(property)) current.style.removeProperty(property);
        }
        for (const property of next.style) {
          const effect = property.match(/^--iw-(\w+)-delay$/)?.[1];
          if (effect && previousEvents[effect] === nextEvents[effect] && current.style.getPropertyValue(property)) continue;
          const value = next.style.getPropertyValue(property);
          if (current.style.getPropertyValue(property) !== value) current.style.setProperty(property, value);
        }
      } else if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    }
    // Quantity children and their independent animation timelines belong to updateLiveValues.
    if (next.matches('[data-live-loot], [data-live-material-available], [data-live-consumable-equipped], [data-live-consumable-stored], [data-live-mastery-contract]') && current.querySelector('.iw-quantity-value')) return;
    const children = [...current.childNodes];
    const incoming = [...next.childNodes];
    children.forEach((child, index) => {
      if (incoming[index]) patchStatusSection(child, incoming[index]);
      else child.remove();
    });
    incoming.slice(children.length).forEach(child => current.appendChild(child));
  }

  function updateStatusMarkup(markup) {
    const page = AppState.ui.page;
    const current = page.querySelector('.iw-stats-grid');
    if (!current) { page.innerHTML = markup; return; }
    const template = document.createElement('template');
    template.innerHTML = markup;
    const next = template.content.querySelector('.iw-stats-grid');
    const children = [...current.children];
    const incoming = [...next.children];
    // Layout changes (for example switching to crafting) rebuild once.
    if (children.length !== incoming.length || children.some((child, index) => child.tagName !== incoming[index].tagName)) {
      current.replaceWith(next);
      return;
    }
    children.forEach((child, index) => patchStatusSection(child, incoming[index]));
  }

  function updateLiveValues(action, loot, consumables, materials, masteryProgress) {
    updateNewsTicker(action);
    if (!AppState.ui.page) return;
    if (action?.isCombat && Number.isFinite(action.progress)) {
      AppState.ui.page.querySelector('.iw-combat-card')?.style.setProperty('--combat-progress', `${action.progress}%`);
      action.combatants?.forEach((fighter) => {
        const element = AppState.ui.page.querySelector(`.iw-fighter-${fighter.side}`);
        const fill = element?.querySelector('.iw-hp-fill');
        const hp = element?.querySelector('.iw-fighter-heading b');
        const hpText = fighter.maxHp ? `${formatNumber(fighter.hp)} / ${formatNumber(fighter.maxHp)} HP` : `${formatNumber(fighter.hp)} HP`;
        if (hp && hp.textContent !== hpText) hp.textContent = hpText;
        if (element && fighter.hit && element.dataset.hitStarted !== String(fighter.effectStarted?.hit)) {
          element.style.setProperty('--iw-hit-delay', '0ms');
          element.dataset.hitStarted = String(fighter.effectStarted?.hit);
        }
        if (element) element.classList.toggle('iw-hit', Boolean(fighter.hit || Date.now() - fighter.effectStarted?.hit < 620));
        if (element) element.classList.toggle('iw-fighter-dead', Boolean(fighter.dead));
        if (element) element.classList.toggle('iw-spawn', Boolean(fighter.spawn));
        if (fill && Number.isFinite(fighter.hpPercent)) fill.style.transform = `scaleX(${fighter.hpPercent / 100})`;
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
      text('[data-live-level-progress]', Number.isFinite(action.skillProgress) ? `${action.skillProgress}% XP` : '—');
      text('[data-live-xp-hour]', action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—');
      const reviveElement = AppState.ui.page.querySelector('[data-live-revive]');
      if (reviveElement) {
        const remaining = Number(action.reviveRemainingMs) || 0;
        reviveElement.textContent = remaining > 0 ? `Revive in ${formatReviveTime(remaining)}` : '';
        reviveElement.hidden = remaining <= 0;
      }
    }
    const totalItems = lootItemCount(loot);
    text('[data-live-loot-total]', `${formatItemQuantity({amount:totalItems, approximate:loot.some(quantityIsApproximate)})} items waiting`);
    updateQuantityValue(AppState.ui.page.querySelector('[data-live-queue-loot]'), totalItems, null, 'queue-loot', Date.now(), loot.some(quantityIsApproximate));
    loot.forEach((item, index) => updateQuantityValue(
      AppState.ui.page.querySelector(`[data-live-loot="${index}"]`), item.amount,
      AppState.ui.lootDeltaNotices.get(item.image || item.name), item.image || item.name, Date.now(), quantityIsApproximate(item)));
    consumables.forEach((item, index) => {
      const storedOnly = /stardust|mastery contract/i.test(item.name);
      updateQuantityValue(AppState.ui.page.querySelector(`[data-live-consumable-${storedOnly ? 'stored' : 'equipped'}="${index}"]`),
        parseCompact(item.amount), AppState.ui.consumableDeltaNotices.get(item.image || item.name), item.image || item.name, Date.now(), quantityIsApproximate(item));
    });
    const liveMasteryContract = consumables.find((item) => /mastery contract/i.test(item.name));
    if (liveMasteryContract) updateQuantityValue(AppState.ui.page.querySelector('[data-live-mastery-contract]'), parseCompact(liveMasteryContract.amount), AppState.ui.consumableDeltaNotices.get(liveMasteryContract.image || liveMasteryContract.name), liveMasteryContract.image || liveMasteryContract.name, Date.now(), quantityIsApproximate(liveMasteryContract));
    updateMaterialValues(materials);
    text('[data-live-mastery-progress]', masteryProgress.cap ? `${formatCompact(masteryProgress.current)} / ${formatCompact(masteryProgress.cap)}` : '—');
    const automationCache = getCache().automations;
    (automationCache?.structures || []).forEach((item, index) => {
      const projected = projectedAutomation(item, automationCache.checkedAt);
      const progress = AppState.ui.page.querySelector(`[data-live-automation-progress="${index}"]`);
      if (progress) {
        const percent = automationQueuePercent(projected);
        progress.setAttribute('aria-valuenow', String(percent));
        progress.setAttribute('data-warning', automationQueueWarning(projected, automationCache.checkedAt));
        const description = automationQueueDescription(projected, automationCache.checkedAt);
        progress.setAttribute('title', description);
        progress.setAttribute('aria-valuetext', description);
        const fill = progress.querySelector('.iw-automation-queue-fill');
        if (fill) fill.style.width = `${percent}%`;
      }
      text(`[data-live-automation-time="${index}"]`, automationRemainingTime(projected, automationCache.checkedAt));
      text(`[data-live-automation-done="${index}"]`, formatNumber(projected.queuedDone || 0));
      text(`[data-live-automation-loot="${index}"]`, projected.lootAmount ? formatNumber(projected.lootAmount) : '0');
      text(`[data-live-automation-queue="${index}"]`, formatNumber(projected.queuedTotal || 0));
    });
    const eventDetail = AppState.ui.page.querySelector('[data-live-guild-event-detail]');
    if (eventDetail) {
      const label = guildEventDetail(getCache().guildEvent);
      if (eventDetail.title !== label) eventDetail.title = label;
      const markup = renderGuildEventSummary(getCache().guildEvent);
      if (eventDetail._iwSummary !== markup) { eventDetail.innerHTML = markup; eventDetail._iwSummary = markup; }
    }
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

  function renderStatusMarkup({ actionBadges, headerIcons, combatDeath, noticeNow, queueWarning, materialWarning, materialWarningText, cache, adventureActive, adventureActionActive, guildEventActionActive, guildTrialActionActive, prefs, automationOn, cacheLookupsOn, masteryAchieved, automationRows, questSkills, challengePrefs, dailyQuestComplete, taskIndicator, adventureIndicator, guildTrialIndicator, guildEventIndicator, attunementSkills, attunementDetails, challengeError, challengeIndicator, tamingDetails, tamingIndicator, resourceWarnings = {}, adventureSupplement, potionTypes, consumableRows, displayedPotions, inventoryCounts, totalItems, compactCraftingLoot, craftedInventory, action, loot, consumables, materials, masteryProgress, finiteQueue, locationBadges, displayActionName }) {
    return `${renderNewsTicker(action)}<div class="iw-stats-grid">
        ${action ? `
        <section class="iw-card iw-action-card ${action.isCombat ? `iw-combat-card${combatDeath ? ' iw-death' : ''}` : ''}" style="--combat-progress:${action.progress ?? 0}%">
          <div class="iw-card-header"><span>${escapeHtml(action.skillName || 'Current Action')}</span>${actionBadges}</div>
          <div class="iw-action-body">
            <div class="iw-action-heading">
              <div class="iw-action-image">${action.image ? `<img src="${escapeHtml(action.image)}" alt="">` : ''}</div>
              <div class="iw-action-name">
                <span class="iw-action-title"><strong>${escapeHtml(displayActionName)}</strong>${action.level ? `<small>(${escapeHtml(action.level.replace(/^Lv\.\s*/i, 'lvl '))})</small>` : ''}</span>
                <span class="iw-action-meta">
                  ${action.skillName || action.skillLevel ? `<span class="iw-action-skill">${action.skillName ? `<span class="iw-action-skill-name">${escapeHtml(action.skillName)}${currentActionRegion(action) ? renderRegionIcon(currentActionRegion(action)) : ''}</span>` : ''}${action.skillLevel ? `<span>${escapeHtml(action.skillLevel)}</span>` : ''}</span>` : ''}
                  <span data-live-xp-hour>${action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—'}</span>
                  <span data-live-level-progress>${Number.isFinite(action.skillProgress) ? `${action.skillProgress}% XP` : '—'}</span>
                  <span class="iw-revive-timer" data-live-revive ${action.reviveRemainingMs > 0 ? '' : 'hidden'}>${action.reviveRemainingMs > 0 ? `Revive in ${formatReviveTime(action.reviveRemainingMs)}` : ''}</span>
                </span>
              </div>
            </div>
            ${finiteQueue ? `<div class="iw-queue-summary" aria-label="Queue details">
              <span class="iw-queue-stat iw-queue-finish" title="Finishes in"><svg viewBox="0 0 24 24" aria-label="Finishes in" role="img"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><strong>${escapeHtml(finiteQueue.time)}</strong></span>
              ${compactCraftingLoot ? `
                <span class="iw-queue-stat" title="Loot waiting to collect"><img src="${escapeHtml(loot[0]?.image || action.image || '/assets/misc/inventory.png')}" alt="Loot"><b data-live-queue-loot>${formatQuantityMarkup({amount:totalItems, approximate:loot.some(quantityIsApproximate)})}</b></span>
                <span class="iw-queue-stat" title="Total queued"><svg viewBox="0 0 24 24" aria-label="Queued" role="img"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"></path></svg><b>${formatQuantityMarkup({amount:finiteQueue.total})}</b></span>
                <span class="iw-queue-stat" title="Owned in inventory"><img src="/assets/misc/inventory.png" alt="Owned"><b>${formatQuantityMarkup(craftedInventory)}</b></span>
              ` : `<span class="iw-queue-stat" title="Actions completed / queued"><svg viewBox="0 0 24 24" aria-label="Actions completed / queued" role="img"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"></path></svg><b>${formatQuantityMarkup({amount:finiteQueue.completed})} / ${formatQuantityMarkup({amount:finiteQueue.total})}</b></span>`}
            </div>` : ''}
          </div>
          ${renderCombatants(action)}
          ${action.isCombat ? '' : `<div class="iw-progress-stack">
            <div class="iw-progress iw-action-progress" title="Current action progress"><div data-live-progress style="width:${action.progress ?? 0}%"></div></div>
            <div class="iw-progress iw-skill-progress" title="${escapeHtml(action.skillName || 'Skill')} level progress"><div data-live-skill-progress style="width:${action.skillProgress ?? 0}%"></div></div>
          </div>`}
          ${materials.length ? `<div class="iw-subheader">Materials</div><div class="iw-materials"><div class="iw-material-head"><span></span><span>Material</span><span>Available</span></div>${materials.map((item, index) => `<div class="iw-material"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b data-live-material-available="${index}">${formatQuantityMarkup({amount:item.available, approximate:item.approximate})}</b></div>`).join('')}</div>` : ''}
          <div class="iw-subheader">Consumables</div>
          <div class="iw-consumables">${consumableRows.length ? `<div class="iw-consumable-head"><span></span><span>Consumable</span><span>Equipped</span><span>Stored</span></div>${consumableRows.map((item) => `<div class="iw-consumable"><img src="${escapeHtml(item.image)}" alt=""><span class="iw-consumable-name">${escapeHtml(item.name)}${item.masteryContract ? ` <small>· <span data-live-mastery-progress>${masteryProgress.cap ? `${formatCompact(masteryProgress.current)} / ${formatCompact(masteryProgress.cap)}` : '—'}</span></small>` : ''}</span>${item.storedOnly ? '<i></i>' : `<b data-live-consumable-equipped="${item.liveIndex}">${formatQuantityMarkup({amount:item.equipped || 0, approximate:item.equippedApproximate})}</b>`}<b class="${item.stored ? '' : 'iw-zero'}" ${item.masteryContract ? 'data-live-mastery-contract' : item.liveIndex === null ? '' : `data-live-consumable-stored="${item.liveIndex}"`}>${formatQuantityMarkup({amount:item.stored || 0, approximate:item.storedApproximate})}</b></div>`).join('')}` : '<div class="iw-muted">No consumables equipped.</div>'}</div>
        </section>` : `
        <section class="iw-card iw-empty iw-action-card"><strong>No action in progress</strong><span>Start an action and its live stats will appear here.</span></section>`}
        ${compactCraftingLoot ? '' : `<section class="iw-card iw-loot-card">
          <div class="iw-card-header"><span>Current Loot</span><div class="iw-summary"><span data-live-loot-total>${formatItemQuantity({amount:totalItems, approximate:loot.some(quantityIsApproximate)})} items waiting</span>${action && loot.length ? `<button class="iw-collect-button iw-claim-button" data-collect-loot data-claim-state="${AppState.ui.collectingLoot ? 'busy' : 'ready'}" ${automationOn && !AppState.ui.collectingLoot ? '' : 'disabled'} title="${automationOn ? 'Claim loot and continue' : 'Automation is disabled'}">Claim</button>` : ''}</div></div>
          ${loot.length ? `<div class="iw-data-table iw-loot-table">
            <div class="iw-table-head"><span>Item</span><span>Loot</span><span>Inventory</span></div>${loot.map((item) => `
            <div class="iw-table-row ${isHighValueDrop(item) ? 'iw-rare-drop' : ''}">
              <div class="iw-table-item"><span class="iw-item-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}</span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number" data-live-loot="${loot.indexOf(item)}">${formatQuantityMarkup(item)}</div>
              ${item.name === 'Coins' ? '<div class="iw-table-number iw-coin-inventory" aria-label="Not applicable"></div>' : `<div class="iw-table-number ${inventoryCounts.get(item.image.split('/').pop()?.split('?')[0])?.amount ? '' : 'iw-zero'}">${formatQuantityMarkup(inventoryCounts.get(item.image.split('/').pop()?.split('?')[0]))}</div>`}
            </div>`).join('')}</div>` : '<div class="iw-empty-loot">No loot waiting to be collected.</div>'}
        </section>`}
        <section class="iw-card iw-activity-card">
          <div class="iw-card-header"><span>Status</span>${renderCacheRefreshButton()}</div>
          <div class="iw-status-list">
            <div class="iw-status-row iw-status-link" data-route="/challenges" role="link" tabindex="0"><img src="/assets/items/challenge-scroll.png"><span><b>Challenges</b><small class="iw-status-skill-details iw-challenge-details"><span class="iw-challenge-selection">${renderRegionIcon(challengePrefs.region)}${renderStatusSkillIcon(challengePrefs.skill)}</span><span class="iw-challenge-scrolls" title="Challenge scrolls" aria-label="Challenge scrolls: ${escapeHtml(resourceAmount(cache.challenges?.scrollsAvailable))}"><img src="/assets/items/challenge-scroll.png" alt="" aria-hidden="true"><span aria-hidden="true">${escapeHtml(resourceAmount(cache.challenges?.scrollsAvailable))}</span></span></small>${challengeError ? `<small class="iw-challenge-error">${escapeHtml(challengeError)}</small>` : ''}</span>${challengeIndicator}</div>
            <div class="iw-status-row"><img src="/assets/misc/quests.png"><span><b>Daily quests</b><small class="iw-quest-progress" title="Daily quests completed today"><img src="/assets/misc/quests.png" alt="Daily quests completed today"><span>${Math.min(cache.quests?.completed || 0, 5)}/5</span></small></span>${taskIndicator('quests', dailyQuestComplete, 'Pending')}</div>
            <div class="iw-status-row iw-status-link" data-route="/adventure" role="link" tabindex="0"><img src="/assets/misc/adventure.png"><span><b>Adventure</b><small><span data-live-adventure-detail>${escapeHtml(adventureDetail(cache.adventure))}</span>${adventureSupplement ? ` · ${escapeHtml(adventureSupplement)}` : ''}</small><small class="iw-resource-line iw-adventure-resources"><span class="iw-rp-balance${resourceWarnings.rp ? ` iw-resource-warning-text ${resourceWarnings.rpState}` : ''}" title="${escapeHtml(resourceWarnings.rp || 'Research Points')}"><img src="/assets/items/research-points.png" alt="Research Points"><span>${escapeHtml(resourceAmount(cache.adventure?.researchPoints))}</span></span>${cache.adventure?.dailyMapsLimit ? `<span class="iw-map-balance" title="Maps created today"><img src="/assets/items/map.png" alt="Maps created today"><span>${escapeHtml(resourceAmount(cache.adventure.dailyMapsCreated))}/${escapeHtml(resourceAmount(cache.adventure.dailyMapsLimit))}</span></span>` : ''}</small></span><div class="iw-status-actions">${renderResourceWarning(resourceWarnings.rp, resourceWarnings.rpState)}${adventureIndicator}</div></div>
            <div class="iw-status-row iw-status-link" data-route="/skill/15" role="link" tabindex="0"><img src="/assets/misc/taming.png" alt=""><span><b>Taming</b><small>${escapeHtml(tamingDetails)}</small><small class="iw-resource-line iw-snack-balance"><img src="/assets/items/pet-snacks.png" alt="Pet Snacks" title="Pet Snacks"><span>${escapeHtml(resourceAmount(cache.taming?.petSnacks))}</span></small></span>${tamingIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/attunement" role="link" tabindex="0"><img src="/assets/misc/attunement.png"><span><b>Attunement</b>${renderAttunementTributes(cache.attunement)}</span><div class="iw-status-actions">${renderResourceWarning(resourceWarnings.tributes)}<button class="iw-small-button iw-claim-button" data-collect-attunement data-claim-state="${AppState.ui.collectingAttunementLoot ? 'busy' : 'ready'}" ${automationOn && !AppState.ui.collectingAttunementLoot && attunementSkills.length ? '' : 'disabled'} title="${automationOn ? 'Claim all Attunement loot' : 'Automation is disabled'}">Claim</button></div></div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/combat.png"><span><b>Guild event</b><small class="iw-event-details" data-live-guild-event-detail title="${escapeHtml(guildEventDetail(cache.guildEvent))}">${renderGuildEventSummary(cache.guildEvent)}</small></span>${guildEventIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/quests.png"><span><b>Guild trials</b><small data-live-guild-trial-detail>${escapeHtml(guildTrialDetail(cache.guildTrial))}</small></span>${guildTrialIndicator}</div>
          </div>
        </section>
        ${renderPotionPanel(displayedPotions, potionTypes)}
        ${renderAutomationsPanel(automationRows, cache, automationOn)}
      </div>`;
  }

  function updateMaterialValues(materials, now = Date.now()) {
    materials.forEach((item, index) => updateQuantityValue(
      AppState.ui.page?.querySelector(`[data-live-material-available="${index}"]`), item.available,
      AppState.ui.materialDeltaNotices.get(item.image || item.name), item.image || item.name, now, Boolean(item.approximate)));
  }

  function updateQuantityValue(element, amount, notice, key, now = Date.now(), approximate = false) {
    if (!element) return;
    let quantity = element.querySelector('.iw-quantity-value');
    if (!quantity) {
      element.textContent = '';
      quantity = document.createElement('span');
      quantity.className = 'iw-quantity-value';
      element.appendChild(quantity);
    }
    const value = formatQuantityMarkup({ amount, approximate });
    if (value.includes('<')) {
      if (quantity.innerHTML !== value) quantity.innerHTML = value;
    } else if (quantity.textContent !== value) quantity.textContent = value;
    const existing = element.querySelector('.iw-quantity-delta');
    if (approximate || !notice || notice.until <= now) { existing?.remove(); return; }
    const eventKey = `${key}:${notice.started}`;
    if (existing?.dataset.eventKey === eventKey) return;
    existing?.remove();
    const delta = document.createElement('span');
    delta.className = `iw-quantity-delta${notice.delta < 0 ? ' negative' : ''}`;
    delta.dataset.eventKey = eventKey;
    delta.textContent = `${notice.delta > 0 ? '+' : ''}${formatNumber(notice.delta)}`;
    delta.style.animationDelay = `-${Math.max(0, now - notice.started)}ms`;
    delta.setAttribute('aria-hidden', 'true');
    element.appendChild(delta);
  }
