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
