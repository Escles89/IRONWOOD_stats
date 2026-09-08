  function findCard(title, document = globalThis.document) {
    return [...document.querySelectorAll('skill-page .card')].find((card) =>
      clean(card.querySelector(':scope > .header > .name')?.textContent) === title
    );
  }

  function nativeXpHourRow(document = globalThis.document) {
    return [...document.querySelectorAll('skill-page .row')].find((row) =>
      !row.closest('#estimatorComponent')
      && clean(row.children[0]?.textContent) === 'XP'
      && /\/\s*hour/i.test(clean(row.textContent))
    );
  }

  function readCurrentAction(document = globalThis.document) {
    const standardCard = document.querySelector('skill-page action-component > .card');
    const combatComponent = document.querySelector('skill-page combat-component');
    const combatCard = document.querySelector('skill-page combat-component .interface.monster')
      || document.querySelector('skill-page combat-component > .card')
      || (combatComponent && /\b(?:revive|respawn|resurrect|dead|defeated)\b/i.test(clean(combatComponent.textContent)) ? combatComponent : null);
    const statusText = clean([
      combatCard?.textContent,
      standardCard?.textContent,
      document.querySelector('skill-page')?.textContent
    ].filter(Boolean).join(' '));
    const parsedReviveRemainingMs = parseReviveRemaining(statusText);
    const now = Date.now();
    if (parsedReviveRemainingMs > 0) {
      const newReviveCycle = !AppState.live.lastReviveObservedMs || parsedReviveRemainingMs > AppState.live.lastReviveObservedMs + 5000;
      if (newReviveCycle) AppState.live.reviveUntil = now + parsedReviveRemainingMs;
      AppState.live.lastReviveObservedMs = parsedReviveRemainingMs;
    } else if (!/\b(?:reviving|respawning|resurrecting)\b/i.test(statusText)) {
      AppState.live.reviveUntil = 0;
      AppState.live.lastReviveObservedMs = 0;
    }
    const reviveRemainingMs = AppState.live.reviveUntil > now ? AppState.live.reviveUntil - now : 0;
    const reviveVisible = reviveRemainingMs > 0 || /\b(?:reviving|respawning|resurrecting)\b/i.test(statusText);
    if (!combatCard && !standardCard && AppState.live.lastCombatAction && Date.now() - AppState.live.lastCombatSeenAt < 2500 && !reviveVisible) {
      return { ...AppState.live.lastCombatAction, reviveRemainingMs: 0, combatGrace: true };
    }
    const card = combatCard || standardCard;
    if (!card) {
      return AppState.live.lastCombatAction && Date.now() - AppState.live.lastCombatSeenAt < 2500
        ? { ...AppState.live.lastCombatAction, reviveRemainingMs: 0, combatGrace: true }
        : null;
    }
    const isCombat = Boolean(combatCard && card === combatCard);
    const fill = isCombat
      ? card.querySelector(':scope > .bars .progress-bar .fill')
      : card.querySelector(':scope > .bars .fill');
    // Ironwood keeps the selected action card mounted while idle. The live
    // progress bars only exist after an action has actually been started.
    if (!fill && !isCombat) {
      if (reviveVisible && AppState.live.lastCombatAction) return { ...AppState.live.lastCombatAction, reviveRemainingMs, combatGrace: true };
      return AppState.live.lastCombatAction && Date.now() - AppState.live.lastCombatSeenAt < 2500
        ? { ...AppState.live.lastCombatAction, reviveRemainingMs: 0, combatGrace: true }
        : null;
    }
    const match = location.pathname.match(/\/skill\/(\d+)\/action\/(\d+)/)
      || AppState.ui.previousUrl.match(/\/skill\/(\d+)\/action\/(\d+)/);
    const locationButton = [...document.querySelectorAll('skill-page button.filter')]
      .find((button) => button.disabled && /^(Village|Outskirts|Forest|Mountain|Ocean)$/.test(clean(button.textContent)));
    const tracker = document.querySelector('skill-page tracker-component .skill');
    // Some combat layouts omit the tracker; the native active-action shortcut still names the skill.
    const skillName = clean(tracker?.querySelector('.header .name')?.textContent)
      || clean(document.querySelector('nav-component action-component button.button .details > .skill, nav-component combat-component button.button .details > .skill')?.textContent);
    const skillLevel = clean(tracker?.querySelector('.header .level')?.textContent);
    const progressText = clean(tracker?.querySelector('.percent')?.textContent);
    const progressPercent = progressText ? numberFrom(progressText) : null;
    // Use Ironwood's native Estimates table. Pancake's estimator can lag behind
    // the current action and is therefore deliberately excluded here.
    const xpHourRow = nativeXpHourRow(document);
    // The native estimate rows are only mounted while Ironwood's Estimates tab
    // is selected. The original skill page is hidden behind Status, so select
    // that tab once and read the newly mounted value on the next live update.
    if (!xpHourRow) {
      const estimatesTab = [...document.querySelectorAll('skill-page button.tab')]
        .find((button) => clean(button.textContent) === 'Estimates' && !button.disabled);
      estimatesTab?.click();
    }
    const xpPerHour = parseCompact(xpHourRow?.children[1]?.textContent || xpHourRow?.textContent);
    const combatTranslate = fill?.style.transform?.match(/translateX\((-?[\d.]+)%\)/i);
    const actionProgress = isCombat && combatTranslate
      ? Math.max(0, Math.min(100, 100 + Number(combatTranslate[1])))
      : fill ? Math.max(0, Math.min(100, parseFloat(fill.style.width) || 0)) : null;
    const combatRoots = isCombat ? [...document.querySelectorAll('combat-component .interface')] : [];
    const playerRoot = combatRoots.find((root) => root.classList.contains('player'))
      || combatRoots.find((root) => !root.classList.contains('monster'));
    const monsterRoot = combatRoots.find((root) => root.classList.contains('monster'))
      || combatRoots.find((root) => root !== playerRoot && !root.classList.contains('player'));
    const isElite = Boolean(isCombat && (
      /\belite\b/i.test(clean(card.textContent))
      || card.matches('[class*="elite"], [data-elite="true"]')
      || combatRoots.some((root) => root.matches('[class*="elite"], [data-elite="true"]')
        || /\belite\b/i.test(clean(root.textContent))
        || [...root.querySelectorAll('img, [aria-label], [title]')].some((element) => /\belite\b/i.test(element.alt || element.getAttribute('aria-label') || element.title || '')))
    ));
    const combatants = isCombat ? ['player', 'monster'].map((side) => {
      const root = side === 'player' ? playerRoot : monsterRoot;
      if (!root) return null;
      const rootText = clean(root.textContent);
      const hpPair = rootText.match(/([\d,.]+)\s*\/\s*([\d,.]+)\s*HP/i);
      const hpText = clean(root.querySelector('.hp, .health, .health-bar .amount')?.textContent)
        || hpPair?.[0]
        || clean([...root.querySelectorAll('.amount, .value')].find((element) => /\d/.test(element.textContent))?.textContent);
      const hp = numberFrom(hpText);
      const maxHp = numberFrom(hpPair?.[2] || hpText.match(/\/\s*([\d,.]+)/)?.[1]);
      const fill = root.querySelector('.health-bar .fill, .bars .progress-bar .fill, .bars .fill');
      const fillWidth = parseFloat(fill?.style.width);
      const fillTranslate = fill?.style.transform?.match(/translateX\((-?[\d.]+)%\)/i);
      const nativePercent = Number.isFinite(fillWidth) ? fillWidth
        : fillTranslate ? 100 + Number(fillTranslate[1]) : null;
      const hpPercent = maxHp > 0 ? Math.max(0, Math.min(100, hp / maxHp * 100))
        : Number.isFinite(nativePercent) ? Math.max(0, Math.min(100, nativePercent)) : null;
      const meterFill = root.querySelector('.action-bar .fill, .energy-bar .fill, .mana-bar .fill, .stamina-bar .fill')
        || [...root.querySelectorAll('.bars .fill, .progress-bar .fill')].find((element) => !element.closest('.health-bar'));
      const meterWidth = parseFloat(meterFill?.style.width);
      const meterTranslate = meterFill?.style.transform?.match(/translateX\((-?[\d.]+)%\)/i);
      const meterPercent = Number.isFinite(meterWidth) ? meterWidth
        : meterTranslate ? 100 + Number(meterTranslate[1]) : null;
      return { side, name: clean(root.querySelector('.name, .header .name')?.textContent) || (side === 'player' ? 'You' : 'Enemy'), image: root.querySelector('.image img, img')?.src || '', hp, maxHp, hpPercent, meterPercent: Number.isFinite(meterPercent) ? Math.max(0, Math.min(100, meterPercent)) : null };
    }).filter(Boolean) : [];
    const result = {
      name: clean(card.querySelector(':scope > .header > .name')?.textContent) || 'Current action',
      level: clean(card.querySelector(':scope > .header > .level, :scope > .details > .level')?.textContent),
      image: card.querySelector(':scope > .body img')?.src || '',
      progress: actionProgress,
      actionId: match?.[2] || '',
      location: clean(locationButton?.textContent) || 'Unknown',
      isCombat,
      isElite,
      skillName,
      skillLevel,
      skillProgress: Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent)) : null,
      levelRemaining: Number.isFinite(progressPercent) ? Math.max(0, 100 - progressPercent) : null,
      xpPerHour: xpPerHour || null,
      reviveRemainingMs: reviveRemainingMs > 0 ? reviveRemainingMs : 0,
      combatants: transitionCombatants(combatants, AppState.live.lastCombatAction?.combatants || [])
    };
    if (isCombat) { AppState.live.lastCombatAction = result; AppState.live.lastCombatSeenAt = Date.now(); }
    return result;
  }

  function readLoot(document = globalThis.document) {
    const card = findCard('Loot', document);
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => ({
      name: clean(row.querySelector(':scope > .name')?.textContent) || 'Unknown item',
      ...readItemQuantity(row.querySelector(':scope > .amount')),
      worth: parseCompact(row.querySelector(':scope > .worth')?.textContent),
      image: row.querySelector(':scope > .image img')?.src || ''
    }));
  }
  function readConsumables(document = globalThis.document) {
    const card = findCard('Consumables', document);
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => ({
      name: clean(row.querySelector(':scope > .name')?.textContent),
      amount: clean(row.querySelector(':scope > .amount')?.textContent),
      use: clean(row.querySelector(':scope > .use')?.textContent),
      image: row.querySelector(':scope > .image img')?.src || ''
    })).filter((item) => item.name);
  }

  function readMaterials(document = globalThis.document) {
    const card = findCard('Materials', document);
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => {
      const amountText = clean(row.querySelector(':scope > .amount, :scope > .value')?.textContent);
      const pair = amountText.match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      return {
        name: clean(row.querySelector(':scope > .name')?.textContent),
        image: row.querySelector(':scope > .image img')?.src || '',
        available: pair ? parseCompact(pair[1]) : parseCompact(amountText),
        approximate: quantityIsApproximate({amountText:pair ? pair[1] : amountText})
      };
    }).filter((item) => item.name);
  }

  function readMastery(document = globalThis.document) {
    const row = [...document.querySelectorAll('skill-page .row')]
      .find((item) => clean(item.querySelector(':scope > .name')?.textContent) === 'Mastery');
    const value = clean(row?.querySelector(':scope > .value, :scope > .amount')?.textContent);
    const pair = value.match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
    const current = pair ? parseCompact(pair[1]) : 0;
    const cap = pair ? parseCompact(pair[2]) : 0;
    return { current, cap };
  }

  function readFiniteQueue(document = globalThis.document) {
    const lootCard = findCard('Loot', document);
    const header = lootCard?.querySelector(':scope > .header');
    const time = [...(header?.querySelectorAll(':scope > .time > *') || [])]
      .map((part) => clean(part.textContent)).filter(Boolean).join(' ');
    const amount = clean(header?.querySelector(':scope > .amount')?.textContent);
    const pair = amount.match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    if (!time || !pair) return null;
    return { time: formatDuration(durationMs(time) / 1000), completed: numberFrom(pair[1]), total: numberFrom(pair[2]) };
  }

  // Ironwood's daily boundary is 02:00 CET, i.e. 01:00 UTC year-round.

  const SourceAdapter = {
    capture(document) {
      const action = readCurrentAction(document);
      Object.assign(AppState.live, {
        action, combatants: action?.combatants || [],
        loot: readLoot(document).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
        consumables: readConsumables(document), materials: readMaterials(document),
        masteryProgress: readMastery(document), finiteQueue: readFiniteQueue(document),
        observations: { capturedAt: Date.now(), route: location.pathname }
      });
      AppState.ui.activeRoute = location.pathname;
      return AppState.live;
    }
  };
