  function projectStatusCache(cache, now = Date.now()) {
    const projected = { ...cache };
    if (cache.quests?.day && cache.quests.day !== dayKey(now)) {
      projected.quests = { ...cache.quests, completed: 0, selectedDone: 0, dailyComplete: false, quests: [] };
    }
    if (Number.isFinite(cache.challenges?.checkedAt) && nextDailyReset(cache.challenges.checkedAt) <= now) {
      projected.challenges = { ...cache.challenges, autoCompletesUsed: 0,
        autoCompletesRemaining: cache.challenges.autoCompletesLimit, dailyScrollsUsed: 0 };
    }
    if (Number.isFinite(cache.adventure?.checkedAt) && nextDailyReset(cache.adventure.checkedAt) <= now) {
      projected.adventure = { ...cache.adventure, dailyMapsCreated: 0, mapsComplete: false };
    }
    return projected;
  }

  function lootItemCount(loot) {
    return loot.reduce((sum, item) => sum + (item.name === 'Coins' ? 0 : item.amount), 0);
  }

  function isHighValueDrop(item) {
    if (!item) return false;
    return /\brune\b/i.test(item.name)
      || /efficiency\s+(?:wing|wings|ring|rings)\b/i.test(item.name)
      || /loot\s+amulet\b/i.test(item.name);
  }

  function selectLocationBadges(action, consumables, eliteCombat) {
    const dungeonKeyIcon = consumables.find((item) => /key/i.test(item.name) && item.image)?.image || '/assets/misc/elite-key.png';
    const dungeonCombat = Boolean(action?.isCombat && (eliteCombat || /dungeon/i.test(`${action?.name} ${action?.location}`)));
    const combatLocation = Boolean(action?.isCombat || action?.location === 'Outskirts');
    const locationIcon = dungeonCombat ? dungeonKeyIcon : combatLocation ? '/assets/misc/combat.png' : '/assets/misc/woodcutting.png';
    const locationClass = dungeonCombat ? 'dungeon' : combatLocation ? 'outskirts' : 'village';
    const locationLabel = dungeonCombat ? 'Dungeons' : action?.isCombat ? 'Combat' : action?.location;
    const displayActionName = action?.isCombat && eliteCombat && !/^elite\b/i.test(action?.name) ? `Elite ${action?.name}` : action?.name;
    const locationBadges = eliteCombat
      ? `<span class="iw-location-badge dungeon" title="Elite dungeon" aria-label="Elite dungeon"><img src="${escapeHtml(dungeonKeyIcon)}" alt=""></span><span class="iw-location-badge outskirts" title="Combat" aria-label="Combat"><img src="/assets/misc/combat.png" alt=""></span>`
      : `<span class="iw-location-badge ${locationClass}" title="${escapeHtml(locationLabel)}" aria-label="${escapeHtml(locationLabel)}"><img src="${escapeHtml(locationIcon)}" alt=""></span>`;

    return { locationBadges, displayActionName, dungeonCombat, locationClass, locationIcon };
  }
