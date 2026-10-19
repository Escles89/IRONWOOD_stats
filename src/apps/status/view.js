  function renderStatusCountdowns(kind, cache, now = Date.now()) {
    return statusCountdowns(kind, cache, now).map(timer => {
      // Round visual fill updates so subpixel timer changes do not rewrite the DOM.
      const percent = timer.percent === null ? null : Math.round(timer.percent * 100) / 100;
      const time = `${timer.approximate ? '≈ ' : ''}${timer.remaining < 60000 ? '<1m' : formatDuration(timer.remaining / 1000)} remaining`;
      const description = `${timer.label}: ${time}`;
      return `<span class="iw-progress-bar iw-status-countdown" role="progressbar" aria-label="${escapeHtml(timer.label)} time remaining" aria-valuemin="0" aria-valuemax="100" ${percent === null ? '' : `aria-valuenow="${percent}"`} aria-valuetext="${escapeHtml(time)}" title="${escapeHtml(description + (percent === null ? ' · Total duration unavailable' : ''))}" data-duration-known="${percent !== null}">
        <span class="iw-progress-fill" style="width:${percent ?? 100}%"></span><span>${escapeHtml(timer.label)}</span><span>${escapeHtml(time)}</span>
      </span>`;
    }).join('');
  }

  function renderStatusTimerSlot(kind, cache) {
    return `<span class="iw-status-timers" data-status-timers="${kind}">${renderStatusCountdowns(kind, cache)}</span>`;
  }

  function updateStatusCountdowns(cache, now = Date.now()) {
    for (const kind of ['guildEvent', 'guildTrial']) {
      const slot = AppState.ui.page?.querySelector(`[data-status-timers="${kind}"]`);
      if (!slot) continue;
      const markup = renderStatusCountdowns(kind, cache, now);
      if (slot.innerHTML !== markup) slot.innerHTML = markup;
    }
  }

  function renderRegionIcon(region, decorative = false) {
    const paths = {
      Forest: 'M12 3 5 12h4l-5 6h7v3h2v-3h7l-5-6h4L12 3Z',
      Mountain: 'm2 20 8-16 5 10 3-6 4 12H2ZM7 10l3 2 3-2',
      Ocean: 'M2 8c4-6 6-6 10 0s6 6 10 0M2 16c4-6 6-6 10 0s6 6 10 0'
    };
    if (!Object.hasOwn(paths, region)) return '';
    return `<svg class="iw-region-icon" viewBox="0 0 24 24" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escapeHtml(region)}"`}><title>${escapeHtml(region)}</title><path d="${paths[region]}"></path></svg>`;
  }

  function renderGuildEventSummary(entry, showCountdown = true) {
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
      return `${remaining > 0 ? showCountdown ? token(clock, `Ready in ${formatDuration(remaining / 1000)}`, formatDuration(remaining / 1000)) : '<span>Cooldown</span>' : '<span>Ready to start</span>'}${eventType(nextGuildEventName(entry.eventName), true)}`;
    }
    if (state === 'Participating' || state === 'Completed') {
      const remaining = Number(state === 'Completed' ? entry.eventEndsAt : entry.stateEndsAt) - Date.now();
      const xp = `${formatNumber(entry.personalXp || 0)} XP`;
      return `${eventType(entry.eventName)}<span title="Contribution XP">${escapeHtml(xp)}</span>${showCountdown && remaining > 0 ? token(clock, `${state === 'Completed' ? 'Event ends' : 'Participation ends'} in ${formatDuration(remaining / 1000)}`, formatDuration(remaining / 1000)) : ''}`;
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
      return `<span class="iw-attunement-pair${low ? ' iw-low-tribute' : ''}" title="${escapeHtml(skill ? `${skill} · ${label}` : label)}">${region ? `<img src="/assets/items/tribute-${region.toLowerCase()}.png" alt="${region} Tribute">` : '<span aria-hidden="true"></span>'}<span class="iw-tribute-amount" role="img" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(amount)}</span></span><span class="iw-attunement-divider" aria-hidden="true"></span><span class="iw-attunement-skill">${skill ? renderStatusSkillIcon(skill) : ''}</span>${skill && Number.isFinite(shards) && shards > 0 ? `<span class="iw-attunement-divider" aria-hidden="true"></span><span class="iw-pending-shards" title="${escapeHtml(shardLabel)}"><img src="/assets/items/attunement-shard.png" alt="${escapeHtml(shardLabel)}"><span>${formatNumber(shards)}</span></span>` : ''}</span>`;
    }).join('')}</small>`;
  }

  function renderStatusSkillIcon(skill) {
    return `<img class="iw-status-skill-icon" src="${escapeHtml(skillIcon(skill))}" alt="${escapeHtml(skill)}" title="${escapeHtml(skill)}">`;
  }

  function renderActionBadges({ importantOnly = false, action, masteryAchieved, adventureActionActive, guildEventActionActive, guildTrialActionActive, cache, locationBadges, materialWarning, materialWarningText, queueWarning, finiteQueue }) {
    if (!action) return '';
    return `<span class="iw-action-badges">${!importantOnly && action.isCombat ? '<span class="iw-combat-live"><i></i> LIVE</span>' : ''}
            ${importantOnly ? '' : `<button type="button" data-mastery-open="current" aria-haspopup="dialog" class="iw-mastery-badge ${masteryAchieved ? 'achieved' : ''}" title="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'}" aria-label="${escapeHtml(action.skillName || 'Skill')} Mastery ${masteryAchieved ? 'achieved' : 'not achieved'} — open Skill Mastery tracker"><img src="/assets/misc/mastery.png" alt=""></button>`}
            ${adventureActionActive ? `<span class="iw-adventure-badge" title="${escapeHtml(cache.adventure.mapName || 'Adventure')} in progress" aria-label="${escapeHtml(cache.adventure.mapName || 'Adventure')} in progress"><img src="/assets/misc/adventure.png" alt=""></span>` : ''}
            ${guildEventActionActive ? `<span class="iw-guild-event-badge" title="${escapeHtml(cache.guildEvent.eventName)} contribution active" aria-label="${escapeHtml(cache.guildEvent.eventName)} contribution active"><img src="/assets/misc/combat.png" alt=""></span>` : ''}
            ${guildTrialActionActive ? `<span class="iw-guild-trial-badge" title="${escapeHtml(cache.guildTrial.activeName)} bonus active (+10% XP)" aria-label="${escapeHtml(cache.guildTrial.activeName)} bonus active (+10% XP)"><img src="/assets/misc/quests.png" alt=""></span>` : ''}
            ${locationBadges}
            <span class="iw-active-badge ${action.reviveRemainingMs > 0 ? 'revive-active' : ''}" title="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}" aria-label="${action.reviveRemainingMs > 0 ? 'Reviving' : 'Action active'}">${renderActionSpinner()}</span>
            ${renderRecipeRunnerBadge()}
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
    // The live updater owns action-cycle transitions, including instant resets.
    if (current.hasAttribute('data-live-progress') && next.hasAttribute('data-live-progress')) return;
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
    if (next.hasAttribute('data-quick-controls-slot')) return;
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
    updateCombatWeapon(action);
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
      if (actionFill && !action.isCombat) {
        const progress = action.progress ?? 0;
        const previous = parseFloat(actionFill.style.height);
        if (progress !== previous) {
          actionFill.style.transition = Number.isFinite(previous) && progress > previous ? '' : 'none';
          actionFill.style.height = `${progress}%`;
        }
        const icon = actionFill.parentElement;
        if (Number.isFinite(action.progress)) icon.setAttribute('aria-valuenow', String(action.progress));
        else icon.removeAttribute('aria-valuenow');
      }
      const skillFill = AppState.ui.page.querySelector('[data-live-skill-progress]');
      if (skillFill) skillFill.style.width = `${action.skillProgress ?? 0}%`;
      text('[data-live-level-progress]', Number.isFinite(action.skillProgress) ? `${action.skillProgress}% XP` : '—');
      text('[data-live-xp-hour]', action.isCombat
        ? (action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—')
        : currentActionXpDetails(action).rate);
      const xpBar = AppState.ui.page.querySelector('[data-live-xp-bar]');
      if (xpBar && !action.isCombat) {
        const xp = currentActionXpDetails(action);
        text('[data-live-xp-total]', xp.total);
        xpBar.title = xp.description;
        xpBar.setAttribute('aria-valuetext', xp.description);
        if (Number.isFinite(action.skillProgress)) xpBar.setAttribute('aria-valuenow', String(action.skillProgress));
        else xpBar.removeAttribute('aria-valuenow');
      }
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
      const markup = renderGuildEventSummary(getCache().guildEvent, false);
      if (eventDetail._iwSummary !== markup) { eventDetail.innerHTML = markup; eventDetail._iwSummary = markup; }
    }
    updateStatusCountdowns(getCache());
    text('[data-live-adventure-detail]', adventureDetail(getCache().adventure));
    text('[data-live-guild-trial-detail]', guildTrialDetail(getCache().guildTrial, Date.now(), false));
  }

  const StatusRenderer = {
    render(state) {
      if (state !== AppState) throw new Error('StatusRenderer requires the application state');
      return render();
    },
    updateLive(state) {
      recipeUpdateProgress();
      updateTraitsViews();
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

  function renderStatusConsumable(item, masteryProgress) {
    const interactive = item.masteryContract || !item.storedOnly;
    const tag = interactive ? 'button' : 'div';
    const category = consumableCategory(item);
    const control = !interactive ? '' : item.masteryContract
      ? ' type="button" data-mastery-open="current" aria-haspopup="dialog" title="Open current skill mastery"'
      : ` type="button" data-consumable-open="${category}" aria-haspopup="dialog" title="View all ${category.toLowerCase()}"`;
    return `<${tag} class="iw-consumable"${control}><img src="${escapeHtml(item.image)}" alt=""><span class="iw-consumable-name">${escapeHtml(item.name)}${item.masteryContract ? ` <small>· <span data-live-mastery-progress>${masteryProgress.cap ? `${formatCompact(masteryProgress.current)} / ${formatCompact(masteryProgress.cap)}` : '—'}</span></small>` : ''}</span>${item.storedOnly ? '<i></i>' : `<b data-live-consumable-equipped="${item.liveIndex}">${formatQuantityMarkup({amount:item.equipped || 0, approximate:item.equippedApproximate})}</b>`}<b class="${item.stored ? '' : 'iw-zero'}" ${item.masteryContract ? 'data-live-mastery-contract' : item.liveIndex === null ? '' : `data-live-consumable-stored="${item.liveIndex}"`}>${formatQuantityMarkup({amount:item.stored || 0, approximate:item.storedApproximate})}</b></${tag}>`;
  }

  const ACTION_XP_FORMAT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  function currentActionXpDetails(action) {
    const known = Number.isFinite(action.skillXp) && Number.isFinite(action.skillXpRequired) && action.skillXpRequired > 0;
    const total = known ? `${ACTION_XP_FORMAT.format(action.skillXp)} / ${ACTION_XP_FORMAT.format(action.skillXpRequired)} XP`
      : Number.isFinite(action.skillProgress) ? `${action.skillProgress}% XP` : 'XP unavailable';
    const rate = Number.isFinite(action.xpPerHour) ? `${ACTION_XP_FORMAT.format(action.xpPerHour)} XP/h` : '— XP/h';
    const description = `${action.skillName || 'Skill'} level progress: ${known ? `${formatNumber(action.skillXp)} / ${formatNumber(action.skillXpRequired)} XP` : total}${Number.isFinite(action.skillProgress) ? ` · ${action.skillProgress}%` : ''} · ${Number.isFinite(action.xpPerHour) ? `${formatNumber(action.xpPerHour)} XP/h` : 'XP rate unavailable'}`;
    return { total, rate, description };
  }

  function renderCurrentActionImage(action) {
    const image = action.image ? `<img src="${escapeHtml(action.image)}" alt="">` : '';
    if (action.isCombat) return `<div class="iw-action-image">${image}</div>`;
    return `<div class="iw-action-image iw-action-progress-icon" role="progressbar" aria-label="Current action progress" aria-valuemin="0" aria-valuemax="100" ${Number.isFinite(action.progress) ? `aria-valuenow="${action.progress}"` : ''} title="Current action progress"><span data-live-progress style="height:${action.progress ?? 0}%"></span>${image}</div>`;
  }

  function renderCurrentActionXp(action) {
    if (action.isCombat) return '';
    const xp = currentActionXpDetails(action);
    return `<div class="iw-progress-bar iw-action-xp-bar" data-live-xp-bar role="progressbar" aria-label="${escapeHtml(action.skillName || 'Skill')} level progress" aria-valuemin="0" aria-valuemax="100" ${Number.isFinite(action.skillProgress) ? `aria-valuenow="${action.skillProgress}"` : ''} aria-valuetext="${escapeHtml(xp.description)}" title="${escapeHtml(xp.description)}"><span class="iw-progress-fill" data-live-skill-progress style="width:${action.skillProgress ?? 0}%"></span><span data-live-xp-total>${xp.total}</span><span data-live-xp-hour>${xp.rate}</span></div>`;
  }

  function renderCurrentActionQueue(queue, { compactCraftingLoot = false, loot = [], totalItems = 0, craftedInventory = null } = {}) {
    if (!queue) return '';
    const known = Number.isFinite(queue.completed) && Number.isFinite(queue.total) && queue.total > 0;
    const percent = known ? Math.min(100, Math.max(0, queue.completed / queue.total * 100)) : null;
    const completed = Number.isFinite(queue.completed) ? formatNumber(queue.completed) : '—';
    const total = Number.isFinite(queue.total) ? formatNumber(queue.total) : '—';
    const time = queue.time || 'Time unknown';
    const description = `${completed} / ${total} actions completed · ${time} remaining`;
    return `<div class="iw-queue-summary" aria-label="Queue details">
      <div class="iw-progress-bar iw-action-queue-bar" role="progressbar" aria-label="Current action queue completion" aria-valuemin="0" aria-valuemax="100" ${known ? `aria-valuenow="${percent}"` : ''} aria-valuetext="${escapeHtml(description)}" title="${escapeHtml(description)}">
        <span class="iw-progress-fill" style="width:${percent ?? 0}%"></span>
        <span class="iw-action-queue-count" title="Completed / total actions"><span>${completed}</span><span class="iw-queue-slash"> / </span>${total}</span>
        <span class="iw-action-queue-time">${escapeHtml(time)}${queue.time ? ' left' : ''}</span>
      </div>
      ${compactCraftingLoot ? `<div class="iw-queue-details"><span>Loot waiting <b data-live-queue-loot>${formatQuantityMarkup({ amount: totalItems, approximate: loot.some(quantityIsApproximate) })}</b></span><span>Owned <b>${craftedInventory ? formatQuantityMarkup(craftedInventory) : 'Unknown'}</b></span><div data-quick-controls-slot></div></div>` : ''}
    </div>`;
  }

  function renderStatusMarkup({ actionBadges, headerIcons, combatDeath, noticeNow, queueWarning, materialWarning, materialWarningText, cache, adventureActive, adventureActionActive, guildEventActionActive, guildTrialActionActive, prefs, automationOn, cacheLookupsOn, masteryAchieved, automationRows, questSkills, challengePrefs, dailyQuestComplete, taskIndicator, adventureIndicator, guildTrialIndicator, guildEventIndicator, attunementSkills, attunementDetails, challengeError, challengeIndicator, tamingDetails, tamingIndicator, resourceWarnings = {}, adventureSupplement, consumableRows, inventoryCounts, totalItems, compactCraftingLoot, craftedInventory, action, loot, consumables, materials, masteryProgress, finiteQueue, locationBadges, displayActionName }) {
    return `${renderNewsTicker(action)}<div class="iw-stats-grid">
        ${action ? `
        <section class="iw-card iw-action-card ${action.isCombat ? `iw-combat-card${combatDeath ? ' iw-death' : ''}` : ''}" style="--combat-progress:${action.progress ?? 0}%">
          <div class="iw-action-skills" data-action-skills tabindex="0" role="group" aria-label="Current action — open Skills" aria-haspopup="dialog">
          <div class="iw-card-header"><span>${escapeHtml(action.skillName || 'Current Action')}</span><div class="iw-action-header-tools">${actionBadges}</div></div>
          <div class="iw-action-body">
            <div class="iw-action-heading">
              ${renderCurrentActionImage(action)}
              <div class="iw-action-name">
                <span class="iw-action-title"><strong>${escapeHtml(displayActionName)}</strong>${action.level ? `<small>(${escapeHtml(action.level.replace(/^Lv\.\s*/i, 'lvl '))})</small>` : ''}</span>
                <span class="iw-action-meta">
                  ${action.skillName || action.skillLevel ? `<span class="iw-action-skill">${action.skillName ? `<span class="iw-action-skill-name">${escapeHtml(action.skillName)}${currentActionRegion(action) ? renderRegionIcon(currentActionRegion(action)) : ''}</span>` : ''}${action.skillLevel ? `<span>${escapeHtml(action.skillLevel)}</span>` : ''}</span>` : ''}
                  ${action.isCombat ? `<span data-live-xp-hour>${action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—'}</span>
                  <span data-live-level-progress>${Number.isFinite(action.skillProgress) ? `${action.skillProgress}% XP` : '—'}</span>` : ''}
                  <span class="iw-revive-timer" data-live-revive ${action.reviveRemainingMs > 0 ? '' : 'hidden'}>${action.reviveRemainingMs > 0 ? `Revive in ${formatReviveTime(action.reviveRemainingMs)}` : ''}</span>
                </span>
              </div>
            </div>
            ${renderCurrentActionXp(action)}
            ${renderCurrentActionQueue(finiteQueue, { compactCraftingLoot, loot, totalItems, craftedInventory })}
          </div>
          ${renderCombatants(action)}
          </div>
          ${materials.length ? `<div class="iw-subheader">Materials</div><div class="iw-materials"><div class="iw-material-head"><span></span><span>Material</span><span>Available</span></div>${materials.map((item, index) => `<div class="iw-material"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b data-live-material-available="${index}">${formatQuantityMarkup({amount:item.available, approximate:item.approximate})}</b></div>`).join('')}</div>` : ''}
          <div class="iw-subheader">Consumables</div>
          <div class="iw-consumables">${consumableRows.length ? `<div class="iw-consumable-head"><span></span><span>Consumable</span><span>Equipped</span><span>Stored</span></div>${consumableRows.map(item => renderStatusConsumable(item, masteryProgress)).join('')}` : '<div class="iw-muted">No consumables equipped.</div>'}</div>
        </section>` : `
        <section class="iw-card iw-empty iw-action-card iw-action-skills" data-action-skills tabindex="0" role="group" aria-label="Current action — open Skills" aria-haspopup="dialog"><button type="button" class="iw-mastery-badge" data-mastery-open aria-haspopup="dialog" aria-label="Open Skill Mastery tracker" title="Open Skill Mastery tracker"><img src="/assets/misc/mastery.png" alt=""></button>${renderRecipeRunnerBadge()}<strong>No action in progress</strong><span>Open Skills to choose an action.</span></section>`}
        ${compactCraftingLoot ? '' : `<section class="iw-card iw-loot-card">
          <div class="iw-card-header"><span>Current Loot</span><div class="iw-summary"><span data-live-loot-total>${formatItemQuantity({amount:totalItems, approximate:loot.some(quantityIsApproximate)})} items waiting</span><div data-quick-controls-slot></div></div></div>
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
            <div class="iw-status-row iw-status-link" data-route="/attunement" role="link" tabindex="0"><img src="/assets/misc/attunement.png"><span><b>Attunement</b>${renderAttunementTributes(cache.attunement)}</span><div class="iw-status-actions">${renderAttunementAvailability()}${renderResourceWarning(resourceWarnings.tributes)}<button class="iw-small-button iw-claim-button" data-collect-attunement data-claim-state="${AppState.ui.collectingAttunementLoot ? 'busy' : 'ready'}" ${automationOn && !AppState.ui.collectingAttunementLoot && attunementSkills.length ? '' : 'disabled'} title="${automationOn ? 'Claim all Attunement loot' : 'Automation is disabled'}">Claim</button></div></div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/combat.png"><span><b>Guild event</b><small class="iw-event-details" data-live-guild-event-detail title="${escapeHtml(guildEventDetail(cache.guildEvent))}">${renderGuildEventSummary(cache.guildEvent, false)}</small></span>${guildEventIndicator}${renderStatusTimerSlot('guildEvent', cache)}</div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/quests.png"><span><b>Guild trials</b><small data-live-guild-trial-detail>${escapeHtml(guildTrialDetail(cache.guildTrial, Date.now(), false))}</small></span>${guildTrialIndicator}${renderStatusTimerSlot('guildTrial', cache)}</div>
            ${renderMasteryStatusRow()}
            <button type="button" class="iw-status-row iw-traits-summary" data-traits-summary data-traits-open aria-haspopup="dialog" title="Trait training progress and recommended changes">${renderTraitsSummaryContent()}</button>
          </div>
        </section>
        ${renderAutomationsPanel(automationRows, cache, automationOn)}
        ${renderPlannedActionCard()}
        ${renderShoppingCard()}
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
