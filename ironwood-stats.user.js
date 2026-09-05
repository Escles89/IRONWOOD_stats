// ==UserScript==
// @name         Ironwood RPG - Status Page
// @namespace    https://github.com/pverbeek/IRONWOOD_stats
// @version      1.13.2
// @description  Adds a cached live status dashboard and optional task automation to Ironwood RPG.
// @author       pverbeek
// @license      Copyright pverbeek
// @match        https://ironwoodrpg.com/*
// @icon         https://ironwoodrpg.com/favicon.ico
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const PAGE_ID = 'iw-stats-page';
  const NAV_ID = 'iw-stats-nav';
  const MULTIPLAYER_ID = 'iw-multiplayer-control';
  const STYLE_ID = 'iw-stats-style';
  const STATS_PATH = '/status';
  const LEGACY_STATS_PATH = '/stats';
  let page, navButton;
  let previousUrl = '/';
  let hiddenRouteElements = [];
  let lastSignature = '';
  let lastCombatAction = null;
  let lastCombatSeenAt = 0;
  let previousLootValues = new Map();
  let previousConsumableValues = new Map();
  const lootDeltaNotices = new Map();
  const consumableDeltaNotices = new Map();
  const combatEffects = new Map();
  let combatEffectLockUntil = 0;
  let combatUseNotice = null;
  let combatDropNotice = null;
  let eliteCombatDetected = false;
  let questModalOpen = false;
  let headerSnapshot = null;
  let collectingLoot = false;
  let lastAdventureCapture = 0;
  const visibleCaptureTimes = {};
  let refreshingAdventure = false;
  let refreshingChallenges = false;
  let refreshingTaming = false;
  let refreshingAutomations = false;
  let automationTask = '';
  let collectingAttunementLoot = false;
  let runningChallenge = false;
  let collectingTaming = false;
  let collectingAutomation = '';
  let tamingClaimNoticeUntil = 0;
  let reviveUntil = 0;
  let lastReviveObservedMs = 0;

  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const numberFrom = (text) => Number(clean(text).replace(/[^\d.-]/g, '')) || 0;
  const formatNumber = (value) => new Intl.NumberFormat().format(value);
  const formatCompact = (value) => value >= 1000
    ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, '')}K`
    : formatNumber(Math.round(value));
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const skillIcon = (skill) => `/assets/misc/${String(skill).trim().toLowerCase().replace(/\s+/g, '-')}.png`;

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating…';
    const totalMinutes = Math.ceil(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return [hours && `${hours}h`, (minutes || !hours) && `${minutes}m`].filter(Boolean).join(' ');
  }

  const withoutSeconds = (value) => clean(String(value || '').replace(/\s*\d+(?:\.\d+)?s\b/gi, ' '));
  const formatReviveTime = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  };

  function findCard(title) {
    return [...document.querySelectorAll('skill-page .card')].find((card) =>
      clean(card.querySelector(':scope > .header > .name')?.textContent) === title
    );
  }

  function nativeXpHourRow() {
    return [...document.querySelectorAll('skill-page .row')].find((row) =>
      !row.closest('#estimatorComponent')
      && clean(row.children[0]?.textContent) === 'XP'
      && /\/\s*hour/i.test(clean(row.textContent))
    );
  }

  async function primeNativeEstimates() {
    if (nativeXpHourRow()) return;
    const estimatesTab = [...document.querySelectorAll('skill-page button.tab')]
      .find((button) => clean(button.textContent) === 'Estimates' && !button.disabled);
    estimatesTab?.click();
    const started = Date.now();
    while (estimatesTab && Date.now() - started < 1000 && !nativeXpHourRow()) await wait(25);
  }

  function readCurrentAction() {
    const standardCard = document.querySelector('skill-page action-component > .card');
    const combatComponent = document.querySelector('skill-page combat-component');
    const combatCard = document.querySelector('skill-page combat-component .interface.monster')
      || document.querySelector('skill-page combat-component > .card')
      || (combatComponent && /\b(?:revive|respawn|resurrect|dead|defeated)\b/i.test(clean(combatComponent.textContent)) ? combatComponent : null);
    const statusText = clean([
      combatCard?.textContent,
      standardCard?.textContent,
      document.querySelector('skill-page')?.textContent,
      document.body?.textContent
    ].filter(Boolean).join(' '));
    const reviveWordMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i);
    const reviveBareMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)(?!\s*(?:hp|level|xp))/i);
    const reviveClockMatch = statusText.match(/(\d+):(\d{2})[^a-z]{0,12}(?:revive|respawn|resurrect)/i)
      || statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+):(\d{2})/i);
    const parsedReviveRemainingMs = reviveWordMatch
      ? Number(reviveWordMatch[1]) * (/m(?:in(?:ute)?s?)?\b/i.test(reviveWordMatch[2]) ? 60000 : 1000)
      : reviveClockMatch ? (Number(reviveClockMatch[1]) * 60 + Number(reviveClockMatch[2])) * 1000
      : reviveBareMatch ? Number(reviveBareMatch[1]) * 1000 : 0;
    const now = Date.now();
    if (parsedReviveRemainingMs > 0) {
      const newReviveCycle = !lastReviveObservedMs || parsedReviveRemainingMs > lastReviveObservedMs + 5000;
      if (newReviveCycle) reviveUntil = now + parsedReviveRemainingMs;
      lastReviveObservedMs = parsedReviveRemainingMs;
    } else if (!/\b(?:reviving|respawning|resurrecting)\b/i.test(statusText)) {
      reviveUntil = 0;
      lastReviveObservedMs = 0;
    }
    const reviveRemainingMs = reviveUntil > now ? reviveUntil - now : 0;
    const reviveVisible = reviveRemainingMs > 0 || /\b(?:reviving|respawning|resurrecting)\b/i.test(statusText);
    if (!combatCard && lastCombatAction && Date.now() - lastCombatSeenAt < 2500 && !reviveVisible) {
      return { ...lastCombatAction, reviveRemainingMs: 0, combatGrace: true };
    }
    const card = combatCard || standardCard;
    if (!card) {
      return lastCombatAction && Date.now() - lastCombatSeenAt < 2500
        ? { ...lastCombatAction, reviveRemainingMs: 0, combatGrace: true }
        : null;
    }
    const isCombat = Boolean(combatCard && card === combatCard);
    const fill = isCombat
      ? card.querySelector(':scope > .bars .progress-bar .fill')
      : card.querySelector(':scope > .bars .fill');
    // Ironwood keeps the selected action card mounted while idle. The live
    // progress bars only exist after an action has actually been started.
    if (!fill && !isCombat) {
      if (reviveVisible && lastCombatAction) return { ...lastCombatAction, reviveRemainingMs, combatGrace: true };
      return lastCombatAction && Date.now() - lastCombatSeenAt < 2500
        ? { ...lastCombatAction, reviveRemainingMs: 0, combatGrace: true }
        : null;
    }
    const match = location.pathname.match(/\/skill\/(\d+)\/action\/(\d+)/)
      || previousUrl.match(/\/skill\/(\d+)\/action\/(\d+)/);
    const locationButton = [...document.querySelectorAll('skill-page button.filter')]
      .find((button) => button.disabled && /^(Village|Outskirts|Forest|Mountain|Ocean)$/.test(clean(button.textContent)));
    const tracker = document.querySelector('skill-page tracker-component .skill');
    const skillName = clean(tracker?.querySelector('.header .name')?.textContent);
    const skillLevel = clean(tracker?.querySelector('.header .level')?.textContent);
    const progressText = clean(tracker?.querySelector('.percent')?.textContent);
    const progressPercent = progressText ? numberFrom(progressText) : null;
    // Use Ironwood's native Estimates table. Pancake's estimator can lag behind
    // the current action and is therefore deliberately excluded here.
    const xpHourRow = nativeXpHourRow();
    // The native estimate rows are only mounted while Ironwood's Estimates tab
    // is selected. The original skill page is hidden behind Status, so select
    // that tab once and read the newly mounted value on the next live update.
    if (!xpHourRow) {
      const estimatesTab = [...document.querySelectorAll('skill-page button.tab')]
        .find((button) => clean(button.textContent) === 'Estimates' && !button.disabled);
      estimatesTab?.click();
    }
    const xpPerHour = numberFrom(xpHourRow?.children[1]?.textContent || xpHourRow?.textContent);
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
    const previousCombatants = lastCombatAction?.combatants || [];
    const playerNow = combatants.find((fighter) => fighter.side === 'player');
    const playerBefore = previousCombatants.find((fighter) => fighter.side === 'player');
    const monsterNow = combatants.find((fighter) => fighter.side === 'monster');
    const monsterBefore = previousCombatants.find((fighter) => fighter.side === 'monster');
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
      combatants: combatants.map((fighter) => {
        const previous = previousCombatants.find((item) => item.side === fighter.side);
        const hit = Boolean(previous && fighter.hp < previous.hp);
        const healAmount = previous && fighter.hp > previous.hp ? fighter.hp - previous.hp : 0;
        // A defeated enemy can respawn with the same name and sprite. Detect the
        // zero-HP to positive-HP transition as a replacement as well.
        const spawn = fighter.side === 'monster' && Boolean(previous && (
          previous.name !== fighter.name
          || previous.image !== fighter.image
          || ((previous.hpPercent === 0 || previous.hp <= 0) && (fighter.hpPercent > 0 || fighter.hp > 0))
        ));
        const key = fighter.side;
        const now = Date.now();
        const remembered = combatEffects.get(key) || {};
        const healAlreadyActive = remembered.healUntil > now;
        const newHeal = healAmount && !healAlreadyActive;
        const detectedEffect = newHeal || spawn;
        const effectWasAvailable = now >= combatEffectLockUntil;
        if (detectedEffect && effectWasAvailable) {
          combatEffects.clear();
          combatEffectLockUntil = now + 1800;
        }
        const effectAllowed = !detectedEffect || effectWasAvailable;
        if (effectAllowed && newHeal) combatEffects.set(key, { ...(combatEffects.get(key) || remembered), healAmount, healUntil: now + 3200 });
        if (effectAllowed && spawn) combatEffects.set(key, { ...(combatEffects.get(key) || remembered), spawnUntil: now + 4500 });
        const defeated = fighter.side === 'monster' && (fighter.hpPercent === 0 || fighter.hp <= 0);
        if (defeated && (!previous || previous.hpPercent !== 0)) {
          combatEffects.set(key, { ...(combatEffects.get(key) || remembered), deathUntil: now + 3600 });
        }
        const effect = combatEffects.get(key) || remembered;
        const activeHeal = effect.healUntil > now ? effect.healAmount : 0;
        return { ...fighter, hit, healAmount: healAmount || activeHeal, healStartPercent: healAmount && Number.isFinite(previous?.hpPercent) ? previous.hpPercent : null, spawn: spawn || effect.spawnUntil > now, lostPercent: hit && Number.isFinite(previous.hpPercent) ? Math.max(fighter.hpPercent || 0, previous.hpPercent) : null, dead: defeated || effect.deathUntil > now };
      })
    };
    if (isCombat) { lastCombatAction = result; lastCombatSeenAt = Date.now(); }
    return result;
  }

  function readLoot() {
    const card = findCard('Loot');
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => ({
      name: clean(row.querySelector(':scope > .name')?.textContent) || 'Unknown item',
      amount: numberFrom(row.querySelector(':scope > .amount')?.textContent),
      worth: numberFrom(row.querySelector(':scope > .worth')?.textContent),
      image: row.querySelector(':scope > .image img')?.src || ''
    }));
  }
  function isHighValueDrop(item) {
    if (!item) return false;
    return /\brune\b/i.test(item.name)
      || /efficiency\s+(?:wing|wings|ring|rings)\b/i.test(item.name)
      || /loot\s+amulet\b/i.test(item.name);
  }

  function readConsumables() {
    const card = findCard('Consumables');
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => ({
      name: clean(row.querySelector(':scope > .name')?.textContent),
      amount: clean(row.querySelector(':scope > .amount')?.textContent),
      use: clean(row.querySelector(':scope > .use')?.textContent),
      image: row.querySelector(':scope > .image img')?.src || ''
    })).filter((item) => item.name);
  }

  function readMaterials() {
    const card = findCard('Materials');
    if (!card) return [];
    return [...card.querySelectorAll(':scope > .row')].map((row) => {
      const amountText = clean(row.querySelector(':scope > .amount, :scope > .value')?.textContent);
      const pair = amountText.match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      return {
        name: clean(row.querySelector(':scope > .name')?.textContent),
        image: row.querySelector(':scope > .image img')?.src || '',
        available: pair ? parseCompact(pair[1]) : parseCompact(amountText)
      };
    }).filter((item) => item.name);
  }

  function readMastery() {
    const row = [...document.querySelectorAll('skill-page .row')]
      .find((item) => clean(item.querySelector(':scope > .name')?.textContent) === 'Mastery');
    const value = clean(row?.querySelector(':scope > .value, :scope > .amount')?.textContent);
    const pair = value.match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
    const current = pair ? parseCompact(pair[1]) : 0;
    const cap = pair ? parseCompact(pair[2]) : 0;
    return { current, cap };
  }

  function readFiniteQueue() {
    const lootCard = findCard('Loot');
    const header = lootCard?.querySelector(':scope > .header');
    const time = [...(header?.querySelectorAll(':scope > .time > *') || [])]
      .map((part) => clean(part.textContent)).filter(Boolean).join(' ');
    const amount = clean(header?.querySelector(':scope > .amount')?.textContent);
    const pair = amount.match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    if (!time || !pair) return null;
    return { time: formatDuration(durationMs(time) / 1000), completed: numberFrom(pair[1]), total: numberFrom(pair[2]) };
  }

  // Ironwood's daily boundary is 02:00 CET, i.e. 01:00 UTC year-round.
  const dayKey = (time = Date.now()) => new Date(time - 3600000).toISOString().slice(0, 10);
  function nextDailyReset(time = Date.now()) {
    const now = new Date(time);
    let reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1);
    if (reset <= time) reset += 24 * 3600000;
    return reset;
  }

  const CACHE_KEY = 'iw-stats-cache-v1';
  const PREFS_KEY = 'iw-stats-quest-prefs';
  const EQUIPPED_KEY = 'iw-stats-equipped-divine';
  const CHALLENGE_PREFS_KEY = 'iw-stats-challenge-prefs';
  const AUTOMATION_KEY = 'iw-stats-automation-enabled';
  const CACHE_LOOKUPS_KEY = 'iw-stats-cache-lookups-enabled';
  const SUPER_POTIONS_KEY = 'iw-stats-show-super-potions';
  const PLAYER_NAME_KEY = 'iw-stats-player-name-v2';
  const CHALLENGE_SKILLS = {
    Forest: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'],
    Mountain: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'],
    Ocean: ['Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed', 'Defense']
  };
  const GATHERING_SKILLS = new Set(['Woodcutting', 'Mining', 'Farming', 'Fishing', 'Delving', 'Exploring']);
  const CRAFTING_SKILLS = new Set(['Smelting', 'Smithing', 'Enchanting', 'Alchemy', 'Cooking', 'Imbuing']);
  const COMBAT_SKILLS = new Set(['One-handed', 'Two-handed', 'Ranged', 'Defense']);
  const TRAIT_REGION_ORDER = [
    'Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged',
    'Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed',
    'Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed',
    'Defense'
  ];
  const TRAIT_REGIONS = [
    { name: 'Forest', skills: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'] },
    { name: 'Mountain', skills: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'] },
    { name: 'Ocean', skills: ['Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed', 'Defense'] }
  ];
  const TTL = { quests: 26 * 3600000, inventory: 3600000, equipped: Number.POSITIVE_INFINITY, adventure: 26 * 3600000, challenges: 26 * 3600000, taming: 3600000, automations: 24 * 3600000, attunement: 4 * 3600000, mastery: Number.POSITIVE_INFINITY, guildEvent: 24 * 3600000, guildTrial: 24 * 3600000 };
  let syncing = false;

  function getCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
  }
  function setCache(key, data) {
    const cache = getCache();
    cache[key] = { checkedAt: Date.now(), ...data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    lastSignature = '';
  }
  function getPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '[]'); } catch { return []; }
  }
  function automationEnabled() {
    return localStorage.getItem(AUTOMATION_KEY) === 'true';
  }
  function setAutomationEnabled(enabled) {
    localStorage.setItem(AUTOMATION_KEY, enabled ? 'true' : 'false');
    lastSignature = '';
  }
  function cacheLookupsEnabled() {
    return localStorage.getItem(CACHE_LOOKUPS_KEY) === 'true';
  }
  function setCacheLookupsEnabled(enabled) {
    localStorage.setItem(CACHE_LOOKUPS_KEY, enabled ? 'true' : 'false');
    lastSignature = '';
  }
  function getChallengePrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHALLENGE_PREFS_KEY) || '{}');
      const region = Object.hasOwn(CHALLENGE_SKILLS, saved.region) ? saved.region : 'Mountain';
      const skill = CHALLENGE_SKILLS[region].includes(saved.skill) ? saved.skill : 'Defense';
      return { region, skill };
    } catch { return { region: 'Mountain', skill: 'Defense' }; }
  }
  function setChallengePrefs(preferences) {
    const region = Object.hasOwn(CHALLENGE_SKILLS, preferences.region) ? preferences.region : 'Mountain';
    const skill = CHALLENGE_SKILLS[region].includes(preferences.skill) ? preferences.skill : 'Defense';
    localStorage.setItem(CHALLENGE_PREFS_KEY, JSON.stringify({ region, skill }));
    lastSignature = '';
  }
  function isStale(key) {
    const entry = getCache()[key];
    const incompleteAdventure = key === 'adventure' && entry && (entry.schema !== 10 || [
      entry.researchPoints, entry.mapCost, entry.dailyMapsCreated,
      entry.dailyMapsLimit, entry.mapsStored, entry.mapStorageLimit
    ].some((value) => typeof value !== 'number' || !Number.isFinite(value)));
    const incompleteGuildEvent = key === 'guildEvent' && entry?.schema !== 7;
    const incompleteGuildTrial = key === 'guildTrial' && entry?.schema !== 3;
    const guildTrialRefreshDue = key === 'guildTrial' && entry && Number.isFinite(entry.refreshAt) && Date.now() >= entry.refreshAt;
    const incompleteQuests = key === 'quests' && (entry?.schema !== 2 || (getPrefs().length === 5 && entry?.day === dayKey() && !entry.dailyComplete));
    const incompleteAttunement = key === 'attunement' && entry?.schema !== 3;
    const incompleteMastery = key === 'mastery' && entry?.schema !== 1;
    const incompleteChallenges = key === 'challenges' && entry?.schema !== 3;
    const incompleteTaming = key === 'taming' && entry?.schema !== 2;
    const incompleteAutomations = key === 'automations' && entry?.schema !== 4;
    return !entry || incompleteAdventure || incompleteGuildEvent || incompleteGuildTrial || guildTrialRefreshDue || incompleteQuests || incompleteAttunement || incompleteMastery || incompleteChallenges || incompleteTaming || incompleteAutomations || (key === 'inventory' && !Array.isArray(entry.allItems)) || (entry.expiresAt ? Date.now() >= entry.expiresAt : Date.now() - entry.checkedAt > TTL[key]) || (key === 'quests' && entry.day !== dayKey());
  }
  function humanAge(time) {
    if (!time) return 'Never checked';
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'Just checked' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  }
  function projectedAutomation(item, checkedAt) {
    checkedAt = item?.checkedAt || checkedAt;
    if (!item?.intervalMs || !checkedAt || item.queuedDone >= item.queuedTotal) return item;
    const elapsedActions = Math.floor(Math.max(0, Date.now() - checkedAt) / item.intervalMs);
    const remainingQueue = Math.max(0, item.queuedTotal - item.queuedDone);
    const additional = Math.min(remainingQueue, elapsedActions);
    return {
      ...item,
      queuedDone: item.queuedDone + additional,
      lootAmount: Math.round(item.lootAmount + additional * (item.outputPerAction || 0))
    };
  }
  function nextGuildEventName(eventName) {
    const order = ['Gathering', 'Crafting', 'Combat'];
    const index = order.findIndex((name) => new RegExp(name, 'i').test(eventName || ''));
    return index < 0 ? '' : order[(index + 1) % order.length];
  }
  function guildEventDetail(entry) {
    if (!entry) return 'Never checked';
    const remaining = Number(entry.state === 'Participating' ? entry.stateEndsAt : entry.expiresAt) - Date.now();
    const countdown = () => {
      return formatDuration(Math.max(0, remaining) / 1000);
    };
    if (entry.state === 'Cooldown') {
      const nextEvent = nextGuildEventName(entry.eventName);
      const detail = remaining > 0 ? `Ready in ${countdown()}` : 'Ready to start';
      return nextEvent ? `Next: ${nextEvent} · ${detail}` : detail;
    }
    if (remaining > 0 && entry.state === 'Participating') return `${entry.eventName || 'Guild event'} · Participating · ${formatNumber(entry.personalXp || 0)} XP · ${countdown()} remaining`;
    if (entry.state === 'Participating') return entry.stateDetail || `${entry.eventName || 'Guild event'} · Participating · ${formatNumber(entry.personalXp || 0)} XP`;
    if (entry.state === 'Available') return 'Ready to start';
    return entry.stateDetail || humanAge(entry.checkedAt);
  }
  function adventureDetail(entry) {
    if (!entry) return 'Never checked';
    const remaining = Number(entry.stateEndsAt) - Date.now();
    if (entry.state === 'Active' && remaining > 0) return `In progress · ${formatDuration(remaining / 1000)} remaining`;
    if (entry.state === 'Active') return 'Adventure ending';
    return withoutSeconds(entry.stateDetail) || humanAge(entry.checkedAt);
  }
  function guildEventIncludesSkill(eventName, skillName) {
    if (!skillName) return false;
    const group = /gathering/i.test(eventName) ? GATHERING_SKILLS
      : /crafting/i.test(eventName) ? CRAFTING_SKILLS
      : /combat/i.test(eventName) ? COMBAT_SKILLS
      : null;
    return Boolean(group?.has(skillName));
  }
  function guildTrialDetail(entry) {
    if (!entry) return 'Never checked';
    const remaining = Number(entry.stateEndsAt) - Date.now();
    if (entry.state === 'Active' && remaining > 0) return `${entry.activeName || 'Participating'} · ${formatDuration(remaining / 1000)} remaining`;
    if (entry.state === 'Active') return entry.stateDetail || 'Trial participation active';
    return withoutSeconds(entry.stateDetail) || humanAge(entry.checkedAt);
  }
  function playerName() {
    const live = clean(document.querySelector('combat-component .interface.player .name')?.textContent);
    if (live) localStorage.setItem(PLAYER_NAME_KEY, live);
    return live || clean(localStorage.getItem(PLAYER_NAME_KEY));
  }
  function collectPlayerName(doc) {
    const element = doc.querySelector('profile-page profile-card-component .name');
    const name = clean(element?.childNodes?.[0]?.textContent || element?.textContent);
    if (name) localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  }
  function titleFromSlug(slug) {
    return slug.replace(/^potion-(?:divine|super)-/, '').split('-').map((part) => part.toLowerCase() === 'xp' ? 'XP' : part[0].toUpperCase() + part.slice(1)).join(' ');
  }
  function parseCompact(text) {
    const match = clean(text).match(/[\d,.]+\s*[KMB]?/i);
    if (!match) return 0;
    const raw = match[0].replace(/,/g, '');
    const multiplier = /K/i.test(raw) ? 1e3 : /M/i.test(raw) ? 1e6 : /B/i.test(raw) ? 1e9 : 1;
    return Math.round(parseFloat(raw) * multiplier);
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function durationMs(text) {
    const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return [...clean(text).matchAll(/([\d.]+)\s*([dhms])/gi)].reduce((sum, match) => sum + Number(match[1]) * units[match[2].toLowerCase()], 0);
  }
  async function waitFor(doc, selector, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const found = doc.querySelector(selector); if (found) return found; await wait(200); }
    throw new Error(`Timed out waiting for ${selector}`);
  }
  async function withPage(path, selector, task) {
    const frame = document.createElement('iframe');
    frame.className = 'iw-sync-frame';
    frame.src = path;
    document.body.appendChild(frame);
    try {
      await new Promise((resolve, reject) => { frame.onload = resolve; setTimeout(() => reject(new Error(`Could not load ${path}`)), 15000); });
      await waitFor(frame.contentDocument, selector);
      return await task(frame.contentDocument, frame.contentWindow);
    } finally { frame.remove(); }
  }
  function collectInventory(doc) {
    const allItems = [...doc.querySelectorAll('inventory-page button.item')].map((button) => {
      const src = button.querySelector('img')?.getAttribute('src') || '';
      const key = src.split('/').pop()?.split('?')[0] || '';
      const amountText = clean(button.querySelector('.amount')?.textContent);
      const name = clean(button.querySelector('.name')?.textContent);
      return key ? { key, name, amount: parseCompact(amountText), amountText, image: src } : null;
    }).filter(Boolean);
    const items = [...doc.querySelectorAll('inventory-page button.item')].map((button) => {
      const src = button.querySelector('img')?.getAttribute('src') || '';
      const slug = src.match(/potion-divine-[\w-]+/)?.[0];
      return slug ? { slug, name: `Divine ${titleFromSlug(slug)} Potion`, amount: parseCompact(button.querySelector('.amount')?.textContent), image: src } : null;
    }).filter(Boolean);
    setCache('inventory', { items, allItems });
  }
  function divineConsumables(doc) {
    const card = [...doc.querySelectorAll('.card')].find((item) =>
      clean(item.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'
    );
    return [...(card?.querySelectorAll(':scope > .row, :scope > .items > button.item') || [])].map((row) => {
      const image = row.querySelector(':scope > .image img, img')?.getAttribute('src') || '';
      const slug = image.match(/potion-divine-[\w-]+/)?.[0];
      if (!slug) return null;
      return {
        slug,
        name: clean(row.querySelector('.description > .name, :scope > .name')?.textContent) || `Divine ${titleFromSlug(slug)} Potion`,
        amount: parseCompact(row.querySelector('.description > .amount, :scope > .amount')?.textContent),
        image
      };
    }).filter(Boolean);
  }
  function storeEquippedDivine(items, replace = false) {
    let equipped = [];
    try { equipped = JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'); } catch { equipped = []; }
    if (!Array.isArray(equipped)) equipped = [];
    equipped = equipped.filter((item) => item && typeof item.image === 'string' && item.image);
    items = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.image === 'string' && item.image);
    const map = new Map((replace ? [] : equipped).map((item) => [item.slug || item.image.split('/').pop(), item]));
    items.forEach((item) => map.set(item.slug || item.image.split('/').pop(), item));
    equipped = [...map.values()];
    const serialized = JSON.stringify(equipped);
    if (localStorage.getItem(EQUIPPED_KEY) !== serialized) localStorage.setItem(EQUIPPED_KEY, serialized);
    const cached = getCache().equipped?.items;
    if (JSON.stringify(cached) !== serialized) setCache('equipped', { items: equipped });
    return equipped;
  }
  function collectQuests(doc) {
    const card = [...doc.querySelectorAll('quests-page .card')].find((item) => clean(item.querySelector(':scope > .header > .name')?.textContent) === 'Daily Quests');
    const quests = [...(card?.querySelectorAll(':scope > button.row') || [])].map((row) => {
      const amountText = clean(row.querySelector(':scope > .amount')?.textContent);
      const progress = amountText.match(/(\d+)\s*\/\s*(\d+)/);
      const done = /complete/i.test(amountText) || (progress && Number(progress[1]) >= Number(progress[2]));
      return {
        id: clean(row.querySelector('.name')?.textContent), name: clean(row.querySelector('.name')?.childNodes[0]?.textContent),
        skill: clean(row.querySelector('.name span')?.textContent), image: row.querySelector('img')?.getAttribute('src') || '', done
      };
    });
    const headerText = clean(card?.querySelector(':scope > .header > .amount')?.textContent);
    const headerProgress = headerText.match(/(\d+)\s*\/\s*(\d+)/);
    const completed = headerProgress ? Number(headerProgress[1]) : quests.filter((quest) => quest.done).length;
    setCache('quests', { schema: 2, day: dayKey(), quests, completed, dailyComplete: completed >= 5, expiresAt: nextDailyReset() });
    return { card, quests };
  }
  function questMatchesPreference(quest, preference) {
    return quest.id === preference || quest.skill === preference || (quest.skill && preference.endsWith(quest.skill));
  }
  function questForPreference(quests, preference) {
    return quests.find((quest) => questMatchesPreference(quest, preference));
  }
  async function waitForQuestProgress(doc, previousCompleted, timeout = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const state = collectQuests(doc);
      if (state.quests.filter((quest) => quest.done).length > previousCompleted) return state;
      await wait(200);
    }
    return collectQuests(doc);
  }
  async function completeSelectedQuests(doc) {
    if (!automationEnabled()) return collectQuests(doc);
    const prefs = getPrefs();
    if (prefs.length !== 5) return collectQuests(doc);
    let state = collectQuests(doc);
    if (state.quests.filter((quest) => quest.done).length >= 5) return state;
    for (const preference of prefs) {
      const quest = questForPreference(state.quests, preference);
      if (!quest || quest.done) continue;
      const row = [...state.card.querySelectorAll(':scope > button.row')].find((item) => clean(item.querySelector('.name')?.textContent) === quest.id);
      if (!row || row.disabled) continue;
      const previousCompleted = state.quests.filter((item) => item.done).length;
      row.click();
      await wait(250);
      const autoComplete = [...doc.querySelectorAll('quests-page button')].find((button) =>
        !button.disabled && /auto[\s-]?complete/i.test(clean(button.textContent))
      );
      autoComplete?.click();
      state = await waitForQuestProgress(doc, previousCompleted);
      if (state.quests.filter((item) => item.done).length >= 5) break;
    }
    const selectedDone = prefs.filter((preference) => questForPreference(state.quests, preference)?.done).length;
    const completed = state.quests.filter((q) => q.done).length;
    setCache('quests', { schema: 2, day: dayKey(), quests: state.quests, completed, selectedDone, dailyComplete: completed >= 5, expiresAt: nextDailyReset() });
    return state;
  }
  function pageSummary(doc, selector, key) {
    const root = doc.querySelector(selector);
    const text = clean(root?.textContent).slice(0, 600);
    setCache(key, { summary: text || 'No active information found' });
  }
  function collectAdventure(doc) {
    const root = doc.querySelector('adventure-page');
    const cards = [...root.querySelectorAll('.card')];
    const createCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Create Map');
    const menu = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Menu');
    const adventureRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Adventure');
    const storageRow = [...(menu?.querySelectorAll(':scope > button.row') || [])].find((row) => clean(row.querySelector('.name')?.textContent) === 'Storage');
    const rawStateText = clean(adventureRow?.querySelector('.event-icon, .amount')?.textContent) || 'Unknown';
    const stateText = withoutSeconds(rawStateText);
    const allRows = [...root.querySelectorAll('.row')];
    const researchRow = [...(createCard?.querySelectorAll('.row') || [])]
      .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
    const values = {};
    allRows.forEach((row) => {
      const name = clean(row.querySelector('.name')?.textContent);
      if (['Map Points', 'Map Effect', 'Daily Map Limit', 'Daily Upgrade Limit', 'Daily Limit Reset', 'Weekly Adventure Limit', 'Weekly Limit Reset'].includes(name)) {
        values[name] = clean([...row.children].filter((child) => !child.classList.contains('name')).map((child) => child.textContent).join(' '));
      }
    });
    const cooldown = /Cooldown/i.test(stateText);
    const activeDuration = durationMs(rawStateText);
    const active = !cooldown && activeDuration > 0;
    const resetText = cooldown ? withoutSeconds(values['Weekly Limit Reset'] || values['Daily Limit Reset']) : '';
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      if (!match) return { current: null, max: null };
      return { current: parseCompact(match[1]), max: parseCompact(match[2]) };
    };
    const research = pair(researchRow?.querySelector('.amount')?.textContent);
    const dailyMaps = pair(values['Daily Map Limit']);
    const storage = pair(storageRow?.querySelector('.amount')?.textContent);
    const data = {
      schema: 10,
      state: active ? 'Active' : cooldown ? 'Cooldown' : stateText,
      stateDetail: active ? 'In progress' : cooldown ? `Ready in ${resetText}` : 'No adventure running',
      stateEndsAt: activeDuration ? Date.now() + activeDuration : null,
      dailyLimit: values['Daily Map Limit'] || '', weeklyLimit: values['Weekly Adventure Limit'] || '',
      dailyReset: values['Daily Limit Reset'] || '', weeklyReset: values['Weekly Limit Reset'] || '',
      researchPoints: research.current, mapCost: research.max,
      dailyMapsCreated: dailyMaps.current, dailyMapsLimit: dailyMaps.max,
      mapsStored: storage.current, mapStorageLimit: storage.max,
      mapsComplete: dailyMaps.max > 0 && dailyMaps.current >= dailyMaps.max,
      mapAutomation: getCache().adventure?.mapAutomation || null,
      expiresAt: active ? Date.now() + Math.min(activeDuration || 4 * 3600000, 4 * 3600000) : nextDailyReset()
    };
    setCache('adventure', data);
    return data;
  }

  async function refreshAdventureSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !isStale('adventure')) return;
    if (refreshingAdventure) return;
    refreshingAdventure = true;
    try {
      await withPage('/adventure', 'adventure-page', async (doc) => {
        const started = Date.now();
        let researchRow = null;
        while (Date.now() - started < 8000) {
          researchRow = [...doc.querySelectorAll('adventure-page .row')]
            .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
          if (researchRow && /\//.test(clean(researchRow.querySelector('.amount')?.textContent))) break;
          await wait(100);
        }
        if (researchRow) collectAdventure(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Adventure snapshot refresh failed', error);
    } finally {
      refreshingAdventure = false;
      lastSignature = '';
      render();
    }
  }

  async function refreshChallengesSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (getCache().challenges?.scrollsAvailable === 0) return;
    if (!force && !isStale('challenges')) return;
    if (refreshingChallenges) return;
    refreshingChallenges = true;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        const started = Date.now();
        let scrollRow = null;
        while (Date.now() - started < 6000) {
          scrollRow = [...doc.querySelectorAll('challenges-page .row')]
            .find((item) => clean(item.querySelector(':scope > .name')?.textContent) === 'Challenge Scroll');
          if (scrollRow && /\//.test(clean(scrollRow.querySelector('.amount')?.textContent))) break;
          await wait(100);
        }
        if (scrollRow) collectChallenges(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge snapshot refresh failed', error);
    } finally {
      refreshingChallenges = false;
      lastSignature = '';
      render();
    }
  }

  function collectTaming(doc) {
    const root = doc.querySelector('taming-page');
    const activeExpedition = root?.querySelector('button.row.row-active');
    const expeditionName = clean(activeExpedition?.querySelector('.survival')?.childNodes[0]?.textContent);
    const expeditionType = clean(activeExpedition?.querySelector('.status')?.textContent);
    const snackRow = [...(root?.querySelectorAll('.row') || [])]
      .find((row) => clean(row.querySelector(':scope > .name')?.textContent) === 'Pet Snacks');
    const match = clean(snackRow?.querySelector('.amount')?.textContent)
      .match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
    const collectButton = [...(root?.querySelectorAll('button') || [])]
      .find((button) => clean(button.textContent) === 'Collect');
    const data = {
      schema: 2,
      petSnacks: match ? parseCompact(match[1]) : null,
      snacksRequired: match ? parseCompact(match[2]) : null,
      expeditionName: expeditionName || '',
      expeditionType: expeditionType || '',
      lootAvailable: Boolean(collectButton && !collectButton.disabled)
    };
    setCache('taming', data);
    return data;
  }

  async function refreshTamingSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (!force && !isStale('taming')) return;
    if (refreshingTaming) return;
    refreshingTaming = true;
    try {
      await withPage('/skill/15', 'taming-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('taming-page .row .name')]
          .some((element) => clean(element.textContent) === 'Pet Snacks')) await wait(100);
        collectTaming(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Taming snapshot refresh failed', error);
    } finally {
      refreshingTaming = false;
      lastSignature = '';
      render();
    }
  }

  async function collectAutomations(doc) {
    const root = doc.querySelector('home-page');
    const structuresCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
    const structureEntries = [...(structuresCard?.querySelectorAll(':scope > button.row') || [])].map((row) => ({
      structure: clean(row.querySelector(':scope > .name')?.textContent),
      image: row.querySelector(':scope > .image img')?.getAttribute('src') || '/assets/misc/structure.png',
      making: clean([...row.children].find((child) => !child.classList.contains('image') && !child.classList.contains('name'))?.textContent)
    }));
    const structures = [];
    for (const entry of structureEntries) {
      const { structure, image, making } = entry;
      const currentStructuresCard = [...(root?.querySelectorAll('.card') || [])]
        .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
      const row = [...(currentStructuresCard?.querySelectorAll(':scope > button.row') || [])]
        .find((candidate) => clean(candidate.querySelector(':scope > .name')?.textContent) === structure);
      if (!row) continue;
      row.click();
      const selectedAt = Date.now();
      while (Date.now() - selectedAt < 4000) {
        const currentActionsCard = [...root.querySelectorAll('.card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
        const activeName = clean(currentActionsCard?.querySelector(':scope > button.row.active-link .name')?.textContent);
        if (!making || activeName === making) break;
        await wait(75);
      }
      await wait(150);
      const cards = [...root.querySelectorAll('.card')];
      const lootCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Loot');
      const actionsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
      const selectedAction = actionsCard?.querySelector(':scope > button.row.active-link')
        || [...(actionsCard?.querySelectorAll(':scope > button.row') || [])]
          .find((action) => clean(action.querySelector(':scope > .name')?.textContent) === making);
      const baseIntervalMs = durationMs(selectedAction?.querySelector('.interval')?.textContent);
      const statsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Stats');
      const speedRow = [...(statsCard?.querySelectorAll(':scope > .row') || [])]
        .find((item) => clean(item.querySelector('.name')?.textContent) === `${structure} Automation Speed`);
      const speedBonus = numberFrom(speedRow?.querySelector('.bonus')?.textContent) / 100;
      const queueMatch = clean(lootCard?.querySelector(':scope > .header > .amount')?.textContent)
        .match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
      const lootRow = lootCard?.querySelector(':scope > .row');
      structures.push({
        structure,
        image,
        making,
        makingImage: selectedAction?.querySelector('img')?.getAttribute('src') || '',
        lootName: clean(lootRow?.querySelector('.name')?.textContent),
        lootAmount: numberFrom(lootRow?.querySelector('.amount')?.textContent),
        queuedDone: queueMatch ? numberFrom(queueMatch[1]) : 0,
        queuedTotal: queueMatch ? numberFrom(queueMatch[2]) : 0,
        checkedAt: Date.now(),
        intervalMs: baseIntervalMs ? baseIntervalMs / (1 + Math.max(0, speedBonus)) : 0
      });
    }
    structures.forEach((item) => {
      item.outputPerAction = item.queuedDone > 0 ? item.lootAmount / item.queuedDone : 0;
    });
    const data = automationSnapshot(structures);
    setCache('automations', data);
    return data;
  }

  async function openAutomationHouse(doc) {
    if (!doc.querySelector('home-page')) {
      const started = Date.now();
      let houseButton;
      while (Date.now() - started < 10000 && !houseButton) {
        houseButton = [...doc.querySelectorAll('nav-component button')]
          .find((button) => clean(button.textContent) === 'House');
        if (!houseButton) await wait(100);
      }
      if (!houseButton) throw new Error('Could not open the House page');
      houseButton.click();
    }
    await waitFor(doc, 'home-page', 10000);
    const started = Date.now();
    while (Date.now() - started < 6000) {
      if ([...doc.querySelectorAll('home-page .card > .header > .name')]
        .some((element) => clean(element.textContent) === 'Structures')) return;
      await wait(100);
    }
    throw new Error('Could not load automation structures');
  }

  async function collectAutomationStructure(doc, structure) {
    const root = doc.querySelector('home-page');
    const card = (name) => [...root.querySelectorAll('.card')]
      .find((item) => clean(item.querySelector(':scope > .header > .name')?.textContent) === name);
    const row = [...(card('Structures')?.querySelectorAll(':scope > button.row') || [])]
      .find((candidate) => clean(candidate.querySelector(':scope > .name')?.textContent) === structure);
    if (!row) throw new Error(`Could not find ${structure}`);
    row.click();
    await wait(100);
    const selectedAt = Date.now();
    let before;
    while (Date.now() - selectedAt < 6000) {
      const selected = card('Structures')?.querySelector(':scope > button.row.active-link');
      if (clean(selected?.querySelector(':scope > .name')?.textContent) === structure) {
        before = readVisibleAutomation(doc);
        if (before) break;
      }
      await wait(100);
    }
    if (!before) throw new Error(`Could not load ${structure} automation loot`);
    if (before.lootAmount <= 0) {
      storeAutomationStructure(before);
      return;
    }
    // Native controls are siblings of the Loot card inside automate-component.
    const collectButton = [...root.querySelectorAll('automate-component > .action-buttons > button')]
      .find((button) => !button.disabled && /^(?:collect|claim)(?:\s+loot)?$/i.test(clean(button.textContent)));
    if (!collectButton) throw new Error(`No loot claim control for ${structure}`);
    if (!automationEnabled()) return;
    collectButton.click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const after = readVisibleAutomation(doc);
      // A disabled button can mean a pending request. Confirm the actual loot
      // reduction before replacing the snapshot or moving to another structure.
      if (after?.structure === structure && after.lootAmount < before.lootAmount) {
        storeAutomationStructure(after);
        return;
      }
      await wait(100);
    }
    throw new Error(`The game did not confirm the ${structure} loot claim`);
  }

  async function collectAllAutomationLoot() {
    if (!automationEnabled() || collectingAutomation || refreshingAutomations) return;
    const cached = getCache().automations;
    const structures = (cached?.structures || [])
      .map((item) => projectedAutomation(item, cached.checkedAt))
      .filter((item) => item.lootAmount > 0);
    if (!structures.length) return;
    collectingAutomation = 'all';
    setCache('automations', { ...cached, lastError: '' });
    lastSignature = '';
    render();
    try {
      await withPage('/', 'app-component', async (doc) => {
        await openAutomationHouse(doc);
        for (const item of structures) {
          if (!automationEnabled()) break;
          collectingAutomation = item.structure;
          await collectAutomationStructure(doc, item.structure);
          lastSignature = '';
          render();
        }
      });
    } catch (error) {
      console.error('[Ironwood Status] Automation collection failed', error);
      setCache('automations', { ...getCache().automations, lastError: error.message });
    } finally {
      collectingAutomation = '';
      lastSignature = '';
      render();
    }
  }

  function automationSnapshot(structures) {
    const now = Date.now();
    const oldestExpiry = Math.min(now + TTL.automations, ...structures.map((item) => item.checkedAt + TTL.automations));
    const checkedAt = Math.min(now, ...structures.map((item) => item.checkedAt));
    // Queue completion is projected locally from the fixed interval. Do not
    // expire the cache at the predicted queue end and trigger a hidden lookup.
    return { schema: 4, checkedAt, structures, expiresAt: oldestExpiry };
  }

  async function refreshAutomationsSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (refreshingAutomations || collectingAutomation || (!force && !isStale('automations'))) return;
    refreshingAutomations = true;
    try {
      await withPage('/', 'app-component', async (doc) => {
        await openAutomationHouse(doc);
        await collectAutomations(doc);
      });
    } catch (error) {
      console.error('[Ironwood Status] Automation snapshot refresh failed', error);
    } finally {
      refreshingAutomations = false;
      lastSignature = '';
      render();
    }
  }

  async function collectTamingLoot() {
    if (!automationEnabled()) return;
    if (collectingTaming) return;
    collectingTaming = true;
    lastSignature = '';
    render();
    const returnToStatus = location.pathname === STATS_PATH;
    try {
      if (!document.querySelector('taming-page')) {
        const tamingNav = [...document.querySelectorAll('nav-component button')]
          .find((button) => clean(button.querySelector('.name')?.textContent) === 'Taming');
        if (!tamingNav) throw new Error('Could not open the Taming page');
        tamingNav.click();
        await waitFor(document, 'taming-page', 10000);
      }
      await (async (doc) => {
        const started = Date.now();
        let collectButton = null;
        while (Date.now() - started < 6000 && !collectButton) {
          collectButton = [...doc.querySelectorAll('taming-page button')]
            .find((button) => clean(button.textContent) === 'Collect' && !button.disabled);
          if (!collectButton) await wait(100);
        }
        if (!collectButton) throw new Error('No Taming loot is ready');
        const expeditionCard = () => [...doc.querySelectorAll('taming-page .card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Expedition');
        const lootTotal = () => [...(expeditionCard()?.querySelectorAll('.name-amount') || [])]
          .reduce((total, element) => total + numberFrom(element.textContent), 0);
        const elapsed = () => durationMs(clean(expeditionCard()?.querySelector(':scope > .header .interval')?.textContent).split('/')[0]);
        const beforeLoot = lootTotal();
        const beforeElapsed = elapsed();
        collectButton.click();
        const confirmStarted = Date.now();
        let confirmed = false;
        while (Date.now() - confirmStarted < 10000) {
          const current = [...doc.querySelectorAll('taming-page button')]
            .find((button) => clean(button.textContent) === 'Collect');
          const currentLoot = lootTotal();
          const currentElapsed = elapsed();
          if (!current || current.disabled || (beforeLoot > 0 && currentLoot < beforeLoot) || (beforeElapsed > 3000 && currentElapsed + 2000 < beforeElapsed)) {
            confirmed = true;
            break;
          }
          await wait(100);
        }
        if (!confirmed) throw new Error('The game did not confirm the Taming loot claim');
        const refreshed = collectTaming(doc);
        setCache('taming', { ...refreshed, lastClaimAt: Date.now(), lastError: '' });
      })(document);
      tamingClaimNoticeUntil = Date.now() + 1800;
    } catch (error) {
      console.error('[Ironwood Status] Taming collection failed', error);
      const cached = getCache().taming || {};
      setCache('taming', { ...cached, lastError: error.message });
    } finally {
      collectingTaming = false;
      if (returnToStatus) showStats({ push: true });
      lastSignature = '';
      render();
      if (tamingClaimNoticeUntil) setTimeout(() => {
        tamingClaimNoticeUntil = 0;
        lastSignature = '';
        render();
      }, 1800);
    }
  }
  function selectedMapRarity(doc) {
    const sell = [...doc.querySelectorAll('adventure-page button')]
      .find((button) => clean(button.textContent) === 'Sell' && !button.disabled);
    if (!sell) return '';
    let node = sell.parentElement;
    while (node && node.matches?.('adventure-page') === false) {
      const text = clean(node.textContent);
      const rarity = text.match(/\b(Legendary|Epic|Rare|Uncommon|Common)\b/i)?.[1];
      if (rarity) return rarity[0].toUpperCase() + rarity.slice(1).toLowerCase();
      node = node.parentElement;
    }
    return '';
  }
  async function automateMaps(doc) {
    if (!automationEnabled()) return collectAdventure(doc);
    let state = collectAdventure(doc);
    let created = 0;
    let sold = 0;
    let kept = 0;
    let stoppedReason = '';
    const runStarted = Date.now();
    const startingRP = state.researchPoints;
    while (state.dailyMapsLimit > 0 && state.dailyMapsCreated < state.dailyMapsLimit && created < 12) {
      if (state.mapsStored >= state.mapStorageLimit) { stoppedReason = 'Map storage is full'; break; }
      if (state.researchPoints < state.mapCost) { stoppedReason = 'Not enough RP'; break; }
      const storageButton = [...doc.querySelectorAll('adventure-page button.row')]
        .find((button) => clean(button.querySelector('.name')?.textContent) === 'Storage');
      storageButton?.click();
      await wait(250);
      const createButton = [...doc.querySelectorAll('adventure-page button')]
        .find((button) => clean(button.textContent) === 'Create' && button.classList.contains('action-button'));
      if (!createButton || createButton.disabled) { stoppedReason = 'Create Map is unavailable'; break; }
      const previousCreated = state.dailyMapsCreated;
      const previousStored = state.mapsStored;
      const previousRP = state.researchPoints;
      const expectedRP = Math.max(0, previousRP - state.mapCost);
      createButton.click();
      const createStarted = Date.now();
      do { await wait(200); state = collectAdventure(doc); }
      while (Date.now() - createStarted < 6000 &&
        (state.dailyMapsCreated <= previousCreated || state.researchPoints > expectedRP));
      if (state.dailyMapsCreated <= previousCreated) { stoppedReason = 'Map creation was not confirmed'; break; }
      const rpConfirmed = state.researchPoints <= expectedRP;
      created += state.dailyMapsCreated - previousCreated;
      let rarity = '';
      const rarityStarted = Date.now();
      while (Date.now() - rarityStarted < 3000 && !rarity) { rarity = selectedMapRarity(doc); if (!rarity) await wait(150); }
      if (!rarity) { stoppedReason = 'Created map rarity could not be read'; break; }
      if (rarity === 'Legendary') {
        kept++;
      } else {
        const sellButton = [...doc.querySelectorAll('adventure-page button')]
          .find((button) => clean(button.textContent) === 'Sell' && !button.disabled);
        if (!sellButton) { stoppedReason = `Could not sell ${rarity} map`; break; }
        sellButton.click();
        const sellStarted = Date.now();
        do { await wait(200); state = collectAdventure(doc); }
        while (Date.now() - sellStarted < 5000 && state.mapsStored >= previousStored + 1);
        if (state.mapsStored >= previousStored + 1) { stoppedReason = `${rarity} map sale was not confirmed`; break; }
        sold++;
      }
      state = collectAdventure(doc);
      if (!rpConfirmed) { stoppedReason = 'RP balance update was not confirmed'; break; }
    }
    const finalReadStarted = Date.now();
    do { await wait(150); state = collectAdventure(doc); }
    while (Date.now() - finalReadStarted < 1200 && !Number.isFinite(state.researchPoints));
    const complete = state.dailyMapsLimit > 0 && state.dailyMapsCreated >= state.dailyMapsLimit;
    const current = getCache().adventure || state;
    setCache('adventure', {
      ...current,
      mapsComplete: complete,
      mapAutomation: {
        attempted: true, created, sold, kept, complete,
        startingRP, researchPointsRemaining: state.researchPoints,
        rpSpent: Number.isFinite(startingRP) && Number.isFinite(state.researchPoints) ? startingRP - state.researchPoints : null,
        stoppedReason: complete ? '' : (stoppedReason || 'Stopped before the daily limit'),
        runStarted, finishedAt: Date.now()
      }
    });
    return getCache().adventure;
  }

  function collectChallenges(doc) {
    const root = doc.querySelector('challenges-page');
    const rows = [...(root?.querySelectorAll('.card .row') || [])];
    const row = (name) => rows.find((item) => clean(item.querySelector(':scope > .name')?.textContent) === name);
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      return match ? { current: parseCompact(match[1]), max: parseCompact(match[2]) } : { current: null, max: null };
    };
    const scrolls = pair(row('Challenge Scroll')?.querySelector('.amount')?.textContent);
    const autoCompletes = pair(row('Auto Challenge Completes')?.querySelector('.amount')?.textContent);
    const dailyScrolls = pair(row('Daily Scroll Limit')?.querySelector('.amount')?.textContent);
    const selectedRegion = clean(root?.querySelector('.categories button:disabled .name')?.textContent);
    const selectedChallenge = clean(root?.querySelector('.group .card button.row-active .name')?.textContent);
    const data = {
      schema: 3,
      scrollsAvailable: scrolls.current,
      scrollsRequired: scrolls.max,
      autoCompletesUsed: autoCompletes.current,
      autoCompletesLimit: autoCompletes.max,
      autoCompletesRemaining: Number.isFinite(autoCompletes.current) && Number.isFinite(autoCompletes.max)
        ? Math.max(0, autoCompletes.max - autoCompletes.current) : 0,
      dailyScrollsUsed: dailyScrolls.current,
      dailyScrollsLimit: dailyScrolls.max,
      selectedRegion,
      selectedChallenge,
      expiresAt: nextDailyReset()
    };
    setCache('challenges', data);
    return data;
  }

  async function automateChallenge() {
    if (!automationEnabled()) return;
    if (runningChallenge) return;
    runningChallenge = true;
    automationTask = 'challenges';
    lastSignature = '';
    render();
    const preferences = getChallengePrefs();
    let result = '';
    let successful = false;
    try {
      await withPage('/challenges', 'challenges-page', async (doc) => {
        const root = doc.querySelector('challenges-page');
        const button = (pattern) => [...root.querySelectorAll('button')]
          .find((item) => pattern.test(clean(item.textContent)) && !item.disabled);
        const regionButton = [...root.querySelectorAll('.categories button')]
          .find((item) => clean(item.textContent) === preferences.region);
        regionButton?.click();
        const regionStarted = Date.now();
        while (Date.now() - regionStarted < 3000 && ![...root.querySelectorAll('.categories button:disabled')]
          .some((item) => clean(item.textContent) === preferences.region)) await wait(100);

        let state = collectChallenges(doc);
        if (!(state.scrollsAvailable > 0)) throw new Error('No Challenge Scrolls available');
        if (!(state.autoCompletesRemaining > 0)) throw new Error('No Auto Challenge Completes remaining');
        const runLimit = Math.min(state.scrollsAvailable, state.autoCompletesRemaining);
        let completed = 0;

        while (completed < runLimit) {
          const startingScrolls = state.scrollsAvailable;
          const startingAutoUsed = state.autoCompletesUsed;
          const start = button(/^Start$/i);
          if (!start) throw new Error(`Challenge Start is unavailable after ${completed} completed`);
          start.click();

          const autoStarted = Date.now();
          let autoComplete = null;
          while (Date.now() - autoStarted < 6000 && !autoComplete) {
            autoComplete = button(/Auto.*Complete/i);
            if (!autoComplete) await wait(100);
          }
          if (!autoComplete) throw new Error(`Auto Complete did not become available after ${completed} completed`);
          autoComplete.click();

          const rewardStarted = Date.now();
          let claimButton = null;
          while (Date.now() - rewardStarted < 6000 && !claimButton) {
            const skillButton = [...root.querySelectorAll('button')]
              .find((item) => clean(item.textContent) === preferences.skill && !item.disabled);
            skillButton?.click();
            claimButton = button(/^Claim(?: Reward)?$/i);
            if (!claimButton) await wait(100);
          }
          if (!claimButton) throw new Error(`Could not select ${preferences.skill} after ${completed} completed`);
          claimButton.click();

          const claimStarted = Date.now();
          do { await wait(150); state = collectChallenges(doc); }
          while (Date.now() - claimStarted < 8000 &&
            state.scrollsAvailable >= startingScrolls && state.autoCompletesUsed <= startingAutoUsed);
          if (state.scrollsAvailable >= startingScrolls) throw new Error(`Reward claim was not confirmed after ${completed} completed`);
          completed++;
          await wait(150);
        }
        result = `Completed ${completed} · ${preferences.region} · ${preferences.skill}`;
        successful = true;
      });
    } catch (error) {
      console.error('[Ironwood Status] Challenge automation failed', error);
      result = error.message;
    } finally {
      runningChallenge = false;
      automationTask = '';
      const cached = getCache().challenges || {};
      setCache('challenges', { ...cached, lastRun: { result, successful, finishedAt: Date.now() } });
      lastSignature = '';
      render();
    }
  }

  async function collectAttunement(doc) {
    const cards = [...doc.querySelectorAll('attunement-page .card')];
    const slotsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
    const slots = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])].map((slot) => ({
      name: clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent),
      skill: clean(slot.querySelector('.name .secondary')?.textContent),
      image: slot.querySelector('img')?.getAttribute('src') || ''
    }));
    const selected = [];
    const tributes = {};
    for (const slot of slots) {
      const { name, skill, image } = slot;
      const liveSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
        .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
      liveSlot?.click();
      const started = Date.now();
      let tributeRow = null;
      while (Date.now() - started < 3000 && !tributeRow) {
        const liveCards = [...doc.querySelectorAll('attunement-page .card')];
        const selectedLoaded = liveCards.some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === name);
        const requirements = liveCards
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
        if (selectedLoaded) tributeRow = [...(requirements?.querySelectorAll(':scope > .row') || [])]
          .find((row) => /^(Forest|Mountain|Ocean) Tribute$/.test(clean(row.querySelector('.name')?.textContent)));
        if (!tributeRow) await wait(100);
      }
      const tributeName = clean(tributeRow?.querySelector('.name')?.textContent).replace(' Tribute', '');
      const tributeAmount = numberFrom(clean(tributeRow?.querySelector('.amount')?.textContent).split('/')[0]);
      selected.push({ name, skill, image, tribute: tributeName });
      if (tributeName) tributes[tributeName] = tributeAmount;
    }
    const data = { schema: 3, selected, tributes };
    setCache('attunement', data);
    return data;
  }
  async function collectAllAttunementLoot() {
    if (!automationEnabled()) return;
    if (collectingAttunementLoot) return;
    collectingAttunementLoot = true;
    const control = page?.querySelector('[data-collect-attunement]');
    if (control) { control.disabled = true; control.textContent = 'Claiming…'; }
    let collected = 0;
    try {
      await withPage('/attunement', 'attunement-page', async (doc) => {
        const slotsCard = [...doc.querySelectorAll('attunement-page .card')]
          .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
        const slotNames = [...(slotsCard?.querySelectorAll(':scope > button.row') || [])]
          .map((slot) => clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent));
        for (const name of slotNames) {
          const liveSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
            .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
          const pendingXp = numberFrom(liveSlot?.querySelector('.amount')?.textContent);
          if (!liveSlot || pendingXp <= 0) continue;
          liveSlot?.click();
          const selectedStarted = Date.now();
          while (Date.now() - selectedStarted < 3000) {
            const activeSlot = doc.querySelector('attunement-page .card > button.row.row-active');
            const activeName = clean(activeSlot?.querySelector(':scope > .name')?.childNodes[0]?.textContent);
            if (activeName === name) break;
            await wait(100);
          }
          const collectButton = [...doc.querySelectorAll('attunement-page button')]
            .find((button) => clean(button.textContent) === 'Collect' && !button.disabled);
          if (!collectButton) continue;
          collectButton.click();
          const collectStarted = Date.now();
          let confirmed = false;
          while (Date.now() - collectStarted < 8000) {
            const updatedSlot = [...doc.querySelectorAll('attunement-page .card > button.row')]
              .find((button) => clean(button.querySelector(':scope > .name')?.childNodes[0]?.textContent) === name);
            const updatedXp = numberFrom(updatedSlot?.querySelector('.amount')?.textContent);
            if (updatedXp < pendingXp) { confirmed = true; break; }
            await wait(150);
          }
          if (confirmed) collected++;
          await wait(150);
        }
        await collectAttunement(doc);
      });
      lastSignature = '';
      render();
      const updated = page?.querySelector('[data-collect-attunement]');
      if (updated) { updated.disabled = true; updated.textContent = collected ? `Claimed ${collected}` : 'Nothing to claim'; }
    } catch (error) {
      console.error('[Ironwood Status] Attunement collection failed', error);
      const failed = page?.querySelector('[data-collect-attunement]');
      if (failed) { failed.textContent = 'Claim'; failed.title = error.message; }
    } finally {
      collectingAttunementLoot = false;
      setTimeout(() => {
        const current = page?.querySelector('[data-collect-attunement]');
        if (current) { current.disabled = false; current.textContent = 'Claim'; }
      }, 1800);
    }
  }
  function collectGuildEvent(doc) {
    const root = doc.querySelector('guild-page');
    const cards = [...root.querySelectorAll('.card')];
    const eventCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Event');
    const participantsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Participants');
    const rows = [...root.querySelectorAll('.row')];
    const cooldownRow = rows.find((row) => clean(row.querySelector('.name')?.textContent) === 'Event Cooldown');
    const rowValue = (row) => {
      if (!row) return '';
      const label = clean(row.querySelector('.name')?.textContent);
      const explicit = clean(row.querySelector('.date, .time, .amount')?.textContent);
      return explicit || clean(row.textContent).replace(label, '').trim();
    };
    const cooldownText = rowValue(cooldownRow);
    const eventRow = [...(eventCard?.querySelectorAll(':scope > .row') || [])]
      .find((row) => !/^(Guild Event XP|Guild Credits)$/.test(clean(row.querySelector('.name')?.textContent)));
    const observedEventName = clean(eventRow?.querySelector(':scope > .name')?.textContent);
    const eventName = nextGuildEventName(observedEventName) ? observedEventName
      : cooldownText ? getCache().guildEvent?.eventName || 'Guild Event'
      : observedEventName || 'Guild Event';
    const eventRemainingText = clean(eventRow?.querySelector(':scope > .date')?.textContent);
    const eventXpRow = [...(eventCard?.querySelectorAll(':scope > .row') || [])]
      .find((row) => clean(row.querySelector(':scope > .name')?.textContent) === 'Guild Event XP');
    const eventXpMatch = rowValue(eventXpRow).match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    const participantRows = [...(participantsCard?.querySelectorAll('button.row, .row') || [])]
      .filter((row) => row.querySelector(':scope > .name') && row.querySelector(':scope > .amount'));
    const ownName = playerName();
    let ownRow = participantRows.find((row) => clean(row.querySelector(':scope > .name')?.textContent) === ownName);
    const personalXp = ownRow ? numberFrom(ownRow.querySelector(':scope > .amount')?.textContent) : null;
    const participationRemaining = clean(ownRow?.querySelector(':scope > .time')?.textContent);
    const cooldown = Boolean(cooldownRow && cooldownText);
    const participating = !cooldown && Boolean(ownRow);
    const timerText = cooldown ? cooldownText : participating ? participationRemaining : eventRemainingText;
    const timer = durationMs(timerText);
    const readableTimer = timer ? formatDuration(timer / 1000) : timerText;
    const expiresAt = participating
      ? Date.now() + Math.min(timer || 3600000, 3600000)
      : Date.now() + (timer || TTL.guildEvent);
    setCache('guildEvent', {
      schema: 7,
      state: participating ? 'Participating' : cooldown ? 'Cooldown' : 'Available', eventName,
      stateDetail: participating ? `${eventName} · Participating · ${formatNumber(personalXp || 0)} XP · ${readableTimer || 'In progress'}` : cooldown ? `Ready in ${readableTimer}` : 'Ready to participate',
      playerName: ownName || '', personalXp,
      eventXp: eventXpMatch ? numberFrom(eventXpMatch[1]) : null,
      eventXpGoal: eventXpMatch ? numberFrom(eventXpMatch[2]) : null,
      remaining: timerText, stateEndsAt: timer ? Date.now() + timer : null, expiresAt
    });
  }
  function collectMastery(doc) {
    const root = doc.querySelector('mastery-page');
    const skillsCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => [...card.querySelectorAll(':scope > .row .name')]
        .some((name) => clean(name.textContent) === 'Woodcutting'));
    const completeSkills = [...(skillsCard?.querySelectorAll(':scope > .row') || [])]
      .filter((row) => clean(row.textContent).endsWith('Complete'))
      .map((row) => clean(row.querySelector(':scope > .name')?.textContent))
      .filter(Boolean);
    const data = { schema: 1, completeSkills };
    setCache('mastery', data);
    return data;
  }
  function collectGuildTrial(doc) {
    const root = doc.querySelector('guild-page');
    const cards = [...root.querySelectorAll('.card')];
    const summary = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Trials');
    const trialCards = cards.filter((card) => /^(Incomplete|Complete) Trials$/.test(clean(card.querySelector(':scope > .header > .name')?.textContent)));
    const rows = trialCards.flatMap((card) => [...card.querySelectorAll(':scope > button.row')]);
    const activeRow = rows.find((row) => row.querySelector('.minus, .remove, [class*="leave"]'));
    const joinableRows = rows.filter((row) => !row.disabled && row.querySelector('.plus'));
    const endRow = [...(summary?.querySelectorAll(':scope > .row') || [])]
      .find((row) => clean(row.querySelector('.name')?.textContent) === 'End Date');
    const endText = endRow ? withoutSeconds(clean(endRow.textContent).replace('End Date', '').trim()) : '';
    const completedRow = [...(summary?.querySelectorAll(':scope > .row') || [])]
      .find((row) => clean(row.querySelector('.name')?.textContent) === 'Trials Completed');
    const completedMatch = clean(completedRow?.textContent).match(/(\d+)\s*\/\s*(\d+)/);
    const completed = Number(completedMatch?.[1] || 0);
    const total = Number(completedMatch?.[2] || 0);
    const activeName = clean(activeRow?.querySelector('.name')?.textContent);
    const allCompleted = total > 0 && completed >= total;
    const state = activeRow ? 'Active' : allCompleted ? 'Completed' : joinableRows.length ? 'Available' : 'Unavailable';
    const detail = activeRow
      ? `${activeName || 'Trial participation active'}${endText ? ` · ends in ${endText}` : ''}`
      : allCompleted
        ? `All ${total} guild trials completed${endText ? ` · resets in ${endText}` : ''}`
      : joinableRows.length
        ? `${joinableRows.length} trials available${endText ? ` · ends in ${endText}` : ''}`
        : `No trial available${endText ? ` · ends in ${endText}` : ''}`;
    const timer = durationMs(endText);
    const refreshAt = Date.now() + (timer || TTL.guildTrial);
    const expiresAt = refreshAt;
    setCache('guildTrial', {
      schema: 3, state, stateDetail: detail, activeName, available: joinableRows.length,
      stateEndsAt: state === 'Active' && timer ? Date.now() + timer : null, expiresAt, refreshAt
    });
  }
  async function syncStale(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (syncing) return;
    syncing = true;
    try {
      // Resolve the signed-in character and guild participation first so the
      // visible Status row does not wait behind every other stale cache.
      if ((force || isStale('guildEvent')) && !playerName()) {
        await withPage('/profile', 'profile-page profile-card-component .column > .name', (doc) => collectPlayerName(doc));
      }
      if (force || isStale('guildEvent')) await withPage('/guild', 'guild-page', async (doc) => {
        const menuStarted = Date.now();
        let button = null;
        while (Date.now() - menuStarted < 8000 && !button) {
          button = [...doc.querySelectorAll('guild-page button')].find((el) => clean(el.textContent).startsWith('Events'));
          if (!button) await wait(200);
        }
        button?.click();
        const eventStarted = Date.now();
        const expectedName = playerName();
        while (Date.now() - eventStarted < 8000) {
          const participants = [...doc.querySelectorAll('guild-page .card')]
            .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Participants');
          const playerRendered = [...(participants?.querySelectorAll('button.row, .row') || [])]
            .some((row) => clean(row.querySelector(':scope > .name')?.textContent) === expectedName);
          if (participants && (!expectedName || playerRendered)) break;
          await wait(200);
        }
        collectGuildEvent(doc);
      });
      if (force || isStale('quests')) {
        if (automationEnabled()) { automationTask = 'quests'; lastSignature = ''; render(); }
        try { await withPage('/quests', 'quests-page', automationEnabled() ? completeSelectedQuests : collectQuests); }
        finally { automationTask = ''; lastSignature = ''; render(); }
      }
      if (force || isStale('inventory')) await withPage('/inventory', 'inventory-page', async (doc) => collectInventory(doc));
      if (force || isStale('equipped')) await withPage('/equipment', 'equipment-page', async (doc) =>
        storeEquippedDivine(divineConsumables(doc), true)
      );
      if (force || isStale('adventure')) {
        if (automationEnabled()) { automationTask = 'maps'; lastSignature = ''; render(); }
        try { await withPage('/adventure', 'adventure-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 8000) {
          const names = [...doc.querySelectorAll('adventure-page .row .name')].map((element) => clean(element.textContent));
          const researchRow = [...doc.querySelectorAll('adventure-page .row')]
            .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
          const researchText = clean(researchRow?.querySelector('.amount')?.textContent);
          const researchMatch = researchText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
          const loadedResearch = researchMatch && numberFrom(researchMatch[1]) > 0;
          if (loadedResearch && names.includes('Daily Map Limit') && names.includes('Storage')) break;
          await wait(200);
        }
          if (automationEnabled()) await automateMaps(doc);
          else collectAdventure(doc);
        }); } finally { automationTask = ''; lastSignature = ''; render(); }
      }
      if ((force || isStale('challenges')) && getCache().challenges?.scrollsAvailable !== 0) await withPage('/challenges', 'challenges-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('challenges-page .row .name')]
          .some((element) => clean(element.textContent) === 'Challenge Scroll')) await wait(100);
        collectChallenges(doc);
      });
      if (force || isStale('taming')) await withPage('/skill/15', 'taming-page', collectTaming);
      if (force || isStale('automations')) await refreshAutomationsSnapshot(force);
      if (force || isStale('attunement')) await withPage('/attunement', 'attunement-page', collectAttunement);
      if (force || isStale('mastery')) await withPage('/mastery', 'mastery-page', collectMastery);
      if (force || isStale('guildTrial')) await withPage('/guild', 'guild-page', async (doc) => {
        const button = [...doc.querySelectorAll('guild-page button')].find((el) => clean(el.textContent).startsWith('Trials'));
        button?.click();
        const started = Date.now();
        while (Date.now() - started < 8000 && ![...doc.querySelectorAll('guild-page .card > .header > .name')].some((el) => /^(Incomplete|Complete) Trials$/.test(clean(el.textContent)))) await wait(200);
        collectGuildTrial(doc);
      });
    } catch (error) { setCache('syncError', { message: error.message }); }
    finally { syncing = false; lastSignature = ''; render(); }
  }

  function updateLiveValues(action, loot, consumables, materials, masteryProgress) {
    if (!page) return;
    if (action?.isCombat && Number.isFinite(action.progress)) {
      page.querySelector('.iw-combat-card')?.style.setProperty('--combat-progress', `${action.progress}%`);
      action.combatants?.forEach((fighter) => {
        const element = page.querySelector(`.iw-fighter-${fighter.side}`);
        const fill = element?.querySelector('.iw-hp-fill');
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
    const text = (selector, value) => { const element = page.querySelector(selector); if (element && element.textContent !== String(value)) element.textContent = value; };
    if (action) {
      const actionFill = page.querySelector('[data-live-progress]');
      if (actionFill) actionFill.style.width = `${action.progress ?? 0}%`;
      const skillFill = page.querySelector('[data-live-skill-progress]');
      if (skillFill) skillFill.style.width = `${action.skillProgress ?? 0}%`;
      text('[data-live-level-remaining]', Number.isFinite(action.levelRemaining) ? `${action.levelRemaining}% remaining` : '—');
      text('[data-live-xp-hour]', action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—');
      const reviveElement = page.querySelector('[data-live-revive]');
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

  async function collectLootAndContinue() {
    if (!automationEnabled()) return;
    if (collectingLoot) return;
    const stopButton = [...document.querySelectorAll('skill-page button.action-stop')]
      .find((button) => /Stop\s*&\s*Loot/i.test(clean(button.textContent)) && !button.disabled);
    if (!stopButton) return;
    collectingLoot = true;
    const control = page?.querySelector('[data-collect-loot]');
    if (control) { control.disabled = true; control.textContent = 'Claiming…'; }
    try {
      stopButton.click();
      const start = Date.now();
      let startButton = null;
      while (Date.now() - start < 8000) {
        startButton = document.querySelector('skill-page button.action-start, skill-page button[class*="action-start"]');
        if (!startButton) startButton = [...document.querySelectorAll('skill-page button')].find((button) =>
          !button.disabled && !button.classList.contains('row') && /^(Gather|Mine|Craft|Smelt|Smith|Enchant|Farm|Brew|Fish|Cook|Delve|Imbue|Explore|Tame|Fight|Start)$/i.test(clean(button.textContent))
        );
        if (startButton && !startButton.disabled) break;
        await wait(100);
      }
      if (!startButton || startButton.disabled) throw new Error('Ironwood did not expose the continue-action button');
      startButton.click();
      const restart = Date.now();
      while (Date.now() - restart < 8000 && !document.querySelector('skill-page action-component > .card .bars .fill')) await wait(100);
      if (!document.querySelector('skill-page action-component > .card .bars .fill')) throw new Error('The action did not resume');
      lastSignature = '';
      render();
    } catch (error) {
      console.error('[Ironwood Status] Collect and continue failed', error);
      if (control) { control.textContent = 'Claim'; control.title = error.message; }
    } finally {
      collectingLoot = false;
      const current = page?.querySelector('[data-collect-loot]');
      if (current) { current.disabled = false; if (current.textContent === 'Claiming…') current.textContent = 'Claim'; }
    }
  }

  function render() {
    if (!page || page.hidden) return;
    try {
    const action = readCurrentAction();
    const combatDeath = Boolean(action?.isCombat && action.combatants?.some((fighter) => fighter.side === 'monster' && fighter.hpPercent === 0));
    const loot = readLoot().sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const consumables = readConsumables();
    const lootDeltas = loot.map((item) => { const key = item.image || item.name; const old = previousLootValues.get(key); return old === undefined || old === item.amount ? 0 : item.amount - old; });
    const consumableDeltas = consumables.map((item) => { const key = item.image || item.name; const old = previousConsumableValues.get(key); return old === undefined || old === parseCompact(item.amount) ? 0 : parseCompact(item.amount) - old; });
    const noticeNow = Date.now();
    if (!action?.isCombat) eliteCombatDetected = false;
    if (action?.isCombat && consumables.some((item, index) => /elite\s+key/i.test(item.name) && consumableDeltas[index] < 0)) eliteCombatDetected = true;
    const eliteKeyEquipped = consumables.some((item) => /elite\s+key/i.test(item.name));
    const eliteCombat = Boolean(action?.isCombat && (action.isElite || eliteCombatDetected || eliteKeyEquipped));
      lootDeltaNotices.forEach((notice, key) => { if (notice.until <= noticeNow) lootDeltaNotices.delete(key); });
      consumableDeltaNotices.forEach((notice, key) => { if (notice.until <= noticeNow) consumableDeltaNotices.delete(key); });
      loot.forEach((item, index) => {
        const delta = lootDeltas[index];
        const key = item.image || item.name;
        const existing = lootDeltaNotices.get(key);
        if (delta && (!existing || existing.delta !== delta || existing.until <= noticeNow)) lootDeltaNotices.set(key, { delta, started: noticeNow, until: noticeNow + 4000 });
      });
      consumables.forEach((item, index) => {
        const delta = consumableDeltas[index];
        const key = item.image || item.name;
        const existing = consumableDeltaNotices.get(key);
        if (delta && (!existing || existing.delta !== delta || existing.until <= noticeNow)) consumableDeltaNotices.set(key, { delta, started: noticeNow, until: noticeNow + 4000 });
      });
    previousLootValues = new Map(loot.map((item) => [item.image || item.name, item.amount]));
    previousConsumableValues = new Map(consumables.map((item) => [item.image || item.name, parseCompact(item.amount)]));
    const isHealingConsumable = (item) => /pie|potion|elixir|food/i.test(item?.name || '');
    const dropCandidate = action?.isCombat ? loot.find((item, index) => lootDeltas[index] > 0 && item.image) : null;
    const useCandidate = action?.isCombat && !action.combatants?.some((fighter) => fighter.healAmount > 0)
      ? consumables.find((item, index) => consumableDeltas[index] < 0 && item.image && !isHealingConsumable(item)) : null;
    if (!action?.isCombat) { combatUseNotice = null; combatDropNotice = null; }
    if (dropCandidate) {
      const key = dropCandidate.image || dropCandidate.name;
      if (!combatDropNotice || combatDropNotice.key !== key || combatDropNotice.until <= noticeNow) combatDropNotice = { key, item: dropCandidate, started: noticeNow, until: noticeNow + 4000 };
    }
    if (useCandidate) {
      const key = useCandidate.image || useCandidate.name;
      if (!combatUseNotice || combatUseNotice.key !== key || combatUseNotice.until <= noticeNow) combatUseNotice = { key, item: useCandidate, started: noticeNow, until: noticeNow + 4000 };
    }
    if (combatDropNotice?.until <= noticeNow) combatDropNotice = null;
    if (combatUseNotice?.until <= noticeNow) combatUseNotice = null;
    const combatDrop = combatDropNotice?.item || null;
    const combatUse = combatUseNotice?.item || null;
    const pieHealing = Boolean(action?.isCombat && consumables.some(isHealingConsumable));
    const consumedHealing = action?.isCombat
      ? consumables.find((item, index) => consumableDeltas[index] < 0 && item.image && isHealingConsumable(item)) : null;
    const recoveryIcon = consumedHealing?.image || consumables.find(isHealingConsumable)?.image || '';
    page.style.setProperty('--iw-recovery-icon', recoveryIcon ? `url(${JSON.stringify(recoveryIcon)})` : 'none');
    page.style.setProperty('--iw-drop-icon', combatDrop ? `url(${JSON.stringify(combatDrop.image)})` : 'none');
    page.style.setProperty('--iw-use-icon', combatUse ? `url(${JSON.stringify(combatUse.image)})` : 'none');
    page.style.setProperty('--iw-drop-delay', `-${Math.min(4000, Math.max(0, noticeNow - (combatDropNotice?.started || noticeNow)))}ms`);
    page.style.setProperty('--iw-use-delay', `-${Math.min(4000, Math.max(0, noticeNow - (combatUseNotice?.started || noticeNow)))}ms`);
    const materials = readMaterials();
    const masteryProgress = readMastery();
    const finiteQueue = readFiniteQueue();
    const queueRemainingMs = finiteQueue ? durationMs(finiteQueue.time) : 0;
    const queueWarning = queueRemainingMs > 0 && queueRemainingMs < 3600000
      ? (queueRemainingMs < 600000 ? 'urgent' : 'warning') : '';
    const lowMaterials = materials
      .filter((item) => Number.isFinite(item.available) && item.available < 1000)
      .sort((a, b) => a.available - b.available);
    const materialWarning = lowMaterials.length ? (lowMaterials[0].available < 500 ? 'urgent' : 'warning') : '';
    const materialWarningText = lowMaterials.length
      ? `Material${lowMaterials.length > 1 ? 's' : ''} low: ${lowMaterials.map((item) => `${item.name} ${formatNumber(item.available)}`).join(', ')}`
      : '';
    const cache = getCache();
    const adventureActive = cache.adventure?.state === 'Active'
      && (!cache.adventure.stateEndsAt || cache.adventure.stateEndsAt > Date.now());
    const guildParticipationActive = cache.guildEvent?.state === 'Participating'
      && (!cache.guildEvent.stateEndsAt || cache.guildEvent.stateEndsAt > Date.now());
    const guildEventActionActive = guildParticipationActive
      && guildEventIncludesSkill(cache.guildEvent?.eventName, action?.skillName);
    const guildTrialActive = cache.guildTrial?.state === 'Active'
      && (!cache.guildTrial.stateEndsAt || cache.guildTrial.stateEndsAt > Date.now());
    const prefs = getPrefs();
    const automationOn = automationEnabled();
    const cacheLookupsOn = cacheLookupsEnabled();
    const masteryAchieved = (cache.mastery?.completeSkills || []).includes(action?.skillName);
    const gatheringSkill = GATHERING_SKILLS.has(action?.skillName);
    const craftingSkill = CRAFTING_SKILLS.has(action?.skillName);
    const automationRows = (cache.automations?.structures || [])
      .map((item) => projectedAutomation(item, cache.automations?.checkedAt));
    const questSkills = [...new Map((cache.quests?.quests || [])
      .filter((quest) => quest.skill)
      .map((quest) => [quest.skill, { name: quest.skill, image: skillIcon(quest.skill), done: quest.done }])).values()];
    const challengePrefs = getChallengePrefs();
    const dailyQuestComplete = (cache.quests?.completed || 0) >= 5 || cache.quests?.dailyComplete === true;
    const adventureStatus = adventureActive ? 'Active' : cache.adventure?.mapsComplete ? 'Complete' : cache.adventure?.state || 'Unknown';
    const adventureIdleAvailable = cache.adventure?.state === 'Idle' && Number(cache.adventure?.mapsStored) > 0;
    const taskIndicator = (task, complete, fallback, fallbackClass = '') => automationTask === task
      ? '<span class="iw-task-icon running" title="Automation running" aria-label="Automation running"><svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg></span>'
      : complete
        ? '<span class="iw-task-icon done" title="Complete" aria-label="Complete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4 4L19 6.5"></path></svg></span>'
        : `<em class="${fallbackClass}">${escapeHtml(fallback)}</em>`;
    const adventureIndicator = adventureActive
      ? '<span class="iw-task-icon participating" title="Adventure in progress" aria-label="Adventure in progress"><svg class="iw-hourglass" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
      : adventureIdleAvailable
        ? '<span class="iw-task-icon adventure-idle" title="Adventure ready to start" aria-label="Adventure ready to start"><span class="iw-idle-glyph">z<sup>Z</sup></span></span>'
      : taskIndicator('maps', adventureStatus === 'Complete', adventureStatus);
    const guildTrialIndicator = guildTrialActive
      ? '<span class="iw-task-icon participating" title="Guild trial in progress" aria-label="Guild trial in progress"><svg class="iw-hourglass" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
      : `<em class="${['Available', 'Completed'].includes(cache.guildTrial?.state) ? 'complete' : ''}">${escapeHtml(cache.guildTrial?.state || 'Unknown')}</em>`;
    const guildEventIndicator = cache.guildEvent?.state === 'Cooldown'
      ? '<span class="iw-task-icon waiting" title="Guild event cooldown" aria-label="Guild event cooldown"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
      : cache.guildEvent?.state === 'Participating'
        ? '<span class="iw-task-icon participating" title="Participating in guild event" aria-label="Participating in guild event"><svg class="iw-hourglass" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
        : `<em class="${cache.guildEvent?.state === 'Available' ? 'complete' : ''}">${escapeHtml(cache.guildEvent?.state || 'Unknown')}</em>`;
    const mapRunDetail = cache.adventure?.mapAutomation?.stoppedReason && !cache.adventure?.mapsComplete
      ? cache.adventure.mapAutomation.stoppedReason : '';
    const attunementSkills = (cache.attunement?.selected || []).map((slot) => slot.skill).filter(Boolean);
    const attunementTributes = ['Forest', 'Mountain', 'Ocean'].map((category) => {
      const amount = cache.attunement?.tributes?.[category];
      return Number.isFinite(amount) ? `${category} ${Math.round(amount / 1000)}K` : '';
    }).filter(Boolean);
    const attunementDetails = [...attunementSkills, ...attunementTributes].join(' · ') || humanAge(cache.attunement?.checkedAt);
    const challengeScrolls = cache.challenges?.scrollsAvailable;
    const challengeAutoRemaining = cache.challenges?.autoCompletesRemaining;
    const challengeLastError = cache.challenges?.lastRun?.successful === false ? cache.challenges.lastRun.result : '';
    const challengeDetails = Number.isFinite(challengeScrolls)
      ? `${formatNumber(challengeScrolls)} ${challengeScrolls === 1 ? 'scroll' : 'scrolls'} · ${challengePrefs.region} · ${challengePrefs.skill}${challengeLastError ? ` · ${challengeLastError}` : ''}`
      : `Scrolls unknown · ${challengePrefs.region} · ${challengePrefs.skill}`;
    const challengeIndicator = automationTask === 'challenges'
      ? taskIndicator('challenges', false, '')
      : challengeScrolls === 0 || challengeAutoRemaining === 0
        ? taskIndicator('challenges', true, '')
        : `<button class="iw-small-button" data-run-challenge ${automationOn && (!Number.isFinite(challengeScrolls) || (challengeScrolls > 0 && challengeAutoRemaining > 0)) ? '' : 'disabled'} title="${automationOn ? 'Run and claim challenges' : 'Automation is disabled'}">Claim</button>`;
    const tamingSnacks = cache.taming?.petSnacks;
    const tamingExpedition = cache.taming?.expeditionName;
    const tamingDetails = [
      tamingExpedition || 'No expedition selected',
      Number.isFinite(tamingSnacks) ? `${formatNumber(tamingSnacks)} Pet Snacks` : 'Pet Snacks unknown'
    ].join(' · ');
    const tamingIndicator = collectingTaming
      ? '<span class="iw-task-icon running" title="Collecting Taming loot" aria-label="Collecting Taming loot"><svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg></span>'
      : tamingClaimNoticeUntil > Date.now()
        ? '<button class="iw-small-button" disabled>Claimed</button>'
      : `<button class="iw-small-button" data-collect-taming ${automationOn && (cache.taming?.lootAvailable || !Number.isFinite(tamingSnacks)) ? '' : 'disabled'} title="${automationOn ? 'Claim Taming loot' : 'Automation is disabled'}">Claim</button>`;
    const adventureSupplement = [
      Number.isFinite(cache.adventure?.researchPoints) ? `${formatNumber(cache.adventure.researchPoints)} RP` : '',
      cache.adventure?.dailyMapsLimit ? `Maps ${cache.adventure.dailyMapsCreated}/${cache.adventure.dailyMapsLimit} today` : '',
      mapRunDetail
    ].filter(Boolean).join(' · ');
    const liveEquippedDivine = divineConsumables(document);
    let equippedDivine = [];
    try { equippedDivine = JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'); } catch { equippedDivine = []; }
    if (!Array.isArray(equippedDivine)) equippedDivine = [];
    equippedDivine = equippedDivine.filter((item) => item && typeof item.image === 'string' && item.image);
    if (liveEquippedDivine.length) {
      equippedDivine = storeEquippedDivine(liveEquippedDivine);
    }
    const cachedInventory = (Array.isArray(cache.inventory?.items) ? cache.inventory.items : [])
      .filter((item) => item && typeof item.image === 'string' && item.image);
    const cachedAllItems = Array.isArray(cache.inventory?.allItems) ? cache.inventory.allItems : [];
    const showSuperPotions = localStorage.getItem(SUPER_POTIONS_KEY) === 'true';
    const inventoryByKey = new Map(cachedAllItems.map((item) => [item.key, item]));
    let consumableRows = consumables.map((item, liveIndex) => {
      const key = item.image.split('/').pop()?.split('?')[0] || '';
      const storedItem = inventoryByKey.get(key);
      const storedOnly = /stardust|mastery contract/i.test(item.name);
      const masteryContract = /mastery contract/i.test(item.name);
      return {
        ...item,
        liveIndex: masteryContract ? null : liveIndex,
        storedOnly,
        masteryContract,
        equipped: storedOnly ? null : parseCompact(item.amount),
        stored: storedOnly ? (item.amount ? parseCompact(item.amount) : (storedItem?.amount ?? 0)) : (storedItem?.amount ?? 0)
      };
    }).filter((item) => !(!craftingSkill && /stardust/i.test(item.name)));
    if (masteryAchieved) consumableRows = consumableRows.filter((item) => !item.masteryContract);
    [
      ['stardust.png', 'Stardust'],
      ['contract-mastery.png', 'Mastery Contract']
    ].forEach(([key, name]) => {
      const storedItem = inventoryByKey.get(key);
      if (!storedItem || (key === 'stardust.png' && !craftingSkill) || (key === 'contract-mastery.png' && masteryAchieved) || consumableRows.some((item) => item.image.split('/').pop()?.split('?')[0] === key)) return;
      consumableRows.push({
        name, image: storedItem.image || `/assets/items/${key}`, amount: storedItem.amountText,
        liveIndex: null, storedOnly: true, masteryContract: key === 'contract-mastery.png', equipped: null, stored: storedItem.amount
      });
    });
    consumableRows.sort((a, b) => Number(a.storedOnly) - Number(b.storedOnly));
    const canonicalDivinePotions = [
      ['potion-divine-gather-yield.png', 'Divine Gather Yield Potion'],
      ['potion-divine-preservation.png', 'Divine Multi Craft Potion'],
      ['potion-divine-combat-loot.png', 'Divine Combat Loot Potion'],
      ['potion-divine-craft-efficiency.png', 'Divine Craft Efficiency Potion'],
      ['potion-divine-combat-efficiency.png', 'Divine Combat Efficiency Potion']
    ];
    const potionMap = new Map();
    canonicalDivinePotions.forEach(([key, name]) => potionMap.set(key, {
      key, name, image: `/assets/items/${key}`, equipped: null, stored: null
    }));
    cachedInventory.forEach((item) => {
      const key = item.image.split('/').pop();
      potionMap.set(key, { key, name: item.name, image: item.image, equipped: null, stored: item.amount });
    });
    equippedDivine.forEach((item) => {
      const key = item.image.split('/').pop();
      const existing = potionMap.get(key);
      potionMap.set(key, { key, name: item.name, image: item.image, equipped: item.amount, stored: existing?.stored ?? null });
    });
    if (showSuperPotions) {
      cachedAllItems.forEach((item) => {
        const slug = item?.key?.match(/^(potion-super-[\w-]+)\.[\w]+$/)?.[1];
        if (!slug || !(item.amount > 0)) return;
        const equipped = consumables.find((consumable) => consumable.image.split('/').pop()?.split('?')[0] === item.key);
        potionMap.set(item.key, {
          key: item.key,
          name: item.name || `Super ${titleFromSlug(slug)} Potion`,
          image: item.image,
          equipped: equipped ? parseCompact(equipped.amount) : null,
          stored: item.amount,
          superPotion: true
        });
      });
    }
    const canonicalPotionOrder = new Map(canonicalDivinePotions.map(([key], index) => [key, index]));
    const displayedPotions = [...potionMap.values()].sort((a, b) => {
      const tierOrder = Number(Boolean(a.superPotion)) - Number(Boolean(b.superPotion));
      if (tierOrder) return tierOrder;
      const equippedOrder = Number(Boolean(b.equipped)) - Number(Boolean(a.equipped));
      if (equippedOrder) return equippedOrder;
      const canonicalOrder = (canonicalPotionOrder.get(a.key) ?? 99) - (canonicalPotionOrder.get(b.key) ?? 99);
      if (canonicalOrder) return canonicalOrder;
      return a.name.localeCompare(b.name);
    });
    const inventoryCounts = new Map((Array.isArray(cache.inventory?.allItems) ? cache.inventory.allItems : [])
      .filter((item) => item?.key).map((item) => [item.key, item]));
    const totalItems = loot.reduce((sum, item) => sum + item.amount, 0);
    const compactCraftingLoot = Boolean(craftingSkill && finiteQueue);
    const craftedLoot = loot[0];
    const craftedInventory = craftedLoot
      ? inventoryCounts.get(craftedLoot.image.split('/').pop()?.split('?')[0]) : null;
    const signature = JSON.stringify({
      action: action && { name: action.name, level: action.level, image: action.image, actionId: action.actionId, location: action.location, skillName: action.skillName, skillLevel: action.skillLevel, isElite: eliteCombat, revive: Boolean(action.reviveRemainingMs), combatants: action.combatants?.map((fighter) => ({ side: fighter.side, name: fighter.name, image: fighter.image, healAmount: Boolean(fighter.healAmount), spawn: fighter.spawn, dead: fighter.dead })), pieHealing },
      loot: loot.map((item) => ({ name: item.name, image: item.image, amount: item.amount })),
      consumables: consumables.map((item) => ({ name: item.name, image: item.image, amount: item.amount })),
      materials: materials.map((item) => ({ name: item.name, image: item.image })),
      masteryAchieved,
      finiteQueue, materialWarning, materialWarningText, adventureActive, adventureIdleAvailable, guildEventActionActive, guildTrialActive, cache, prefs, challengePrefs, automationOn, cacheLookupsOn, showSuperPotions, questModalOpen, automationTask, tamingClaimNoticeUntil
    });
    if (signature === lastSignature) { updateLiveValues(action, loot, consumables, materials, masteryProgress); return; }
    lastSignature = signature;
    const dungeonKeyIcon = consumables.find((item) => /key/i.test(item.name) && item.image)?.image || '/assets/misc/elite-key.png';
    const dungeonCombat = Boolean(action.isCombat && (eliteCombat || /dungeon/i.test(`${action.name} ${action.location}`)));
    const combatLocation = Boolean(action.isCombat || action.location === 'Outskirts');
    const locationIcon = dungeonCombat ? dungeonKeyIcon : combatLocation ? '/assets/misc/combat.png' : '/assets/misc/woodcutting.png';
    const locationClass = dungeonCombat ? 'dungeon' : combatLocation ? 'outskirts' : 'village';
    const locationLabel = dungeonCombat ? 'Dungeons' : action.isCombat ? 'Combat' : action.location;
    const displayActionName = action.isCombat && eliteCombat && !/^elite\b/i.test(action.name) ? `Elite ${action.name}` : action.name;
    const locationBadges = eliteCombat
      ? `<span class="iw-location-badge dungeon" title="Elite dungeon" aria-label="Elite dungeon"><img src="${escapeHtml(dungeonKeyIcon)}" alt=""></span><span class="iw-location-badge outskirts" title="Combat" aria-label="Combat"><img src="/assets/misc/combat.png" alt=""></span>`
      : `<span class="iw-location-badge ${locationClass}" title="${escapeHtml(locationLabel)}" aria-label="${escapeHtml(locationLabel)}"><img src="${escapeHtml(locationIcon)}" alt=""></span>`;

    page.innerHTML = `<div class="iw-stats-grid">
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
          ${action.isCombat && action.combatants.length ? `<div class="iw-duel-board">${action.combatants.map((fighter) => { const playerDefeated = fighter.side === 'player' && action.reviveRemainingMs > 0; return `<div class="iw-fighter iw-fighter-${fighter.side}${fighter.hit ? ' iw-hit' : ''}${fighter.spawn ? ' iw-spawn' : ''}${fighter.healAmount ? ' iw-heal' : ''}${fighter.dead ? ' iw-fighter-dead' : ''}${playerDefeated ? ' iw-fighter-reviving' : ''}" style="--fighter-progress:${fighter.meterPercent ?? 0}%"><div class="iw-fighter-heading"><span>${escapeHtml(fighter.name)}</span><b>${fighter.maxHp ? `${formatNumber(fighter.hp)} / ${formatNumber(fighter.maxHp)} HP` : `${formatNumber(fighter.hp)} HP`}</b></div><div class="iw-fighter-visual"><span class="iw-fighter-glow"></span>${fighter.image ? `<img src="${escapeHtml(fighter.image)}" alt="">` : ''}${fighter.dead ? '<span class="iw-death-stamp" aria-hidden="true">✕</span><span class="iw-bone-pile" aria-hidden="true"></span>' : ''}${playerDefeated ? '<span class="iw-bone-pile iw-bone-pile-static" aria-hidden="true"></span>' : ''}${fighter.healAmount ? `<span class="iw-floating-heal ${fighter.side === 'player' ? 'iw-player-heal' : 'iw-enemy-heal'}">+${formatNumber(fighter.healAmount)} HP</span>` : ''}${fighter.spawn ? '<span class="iw-spawn-ring"></span>' : ''}</div><div class="iw-hp-track"><div class="iw-hp-fill" style="width:${fighter.hpPercent ?? 0}%"></div>${fighter.hit && fighter.lostPercent ? `<span class="iw-hp-damage" style="left:${fighter.hpPercent ?? 0}%; width:${Math.max(0, fighter.lostPercent - (fighter.hpPercent || 0))}%"></span>` : ''}</div></div>`; }).join('<span class="iw-duel-divider">VS</span>')}</div>` : ''}
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
              <div class="iw-table-number" data-live-loot="${loot.indexOf(item)}" data-value-icon="${escapeHtml(item.image)}" data-value-delta="${lootDeltaNotices.get(item.image || item.name)?.delta ? `${lootDeltaNotices.get(item.image || item.name).delta > 0 ? '+' : ''}${formatNumber(lootDeltaNotices.get(item.image || item.name).delta)}` : ''}" style="--iw-value-delta-delay:-${Math.min(4000, Math.max(0, noticeNow - (lootDeltaNotices.get(item.image || item.name)?.started || noticeNow)))}ms">${formatNumber(item.amount)}</div>
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
        <section class="iw-card iw-potion-card">
          <div class="iw-card-header"><span>${showSuperPotions ? 'Potions' : 'Divine Potions'}</span><small>${displayedPotions.length} types</small></div>
          ${displayedPotions.length ? `<div class="iw-data-table iw-potion-table">
            <div class="iw-table-head"><span>Potion</span><span>Equipped</span><span>Stored</span></div>
            ${displayedPotions.map((item) => `<div class="iw-table-row">
              <div class="iw-table-item"><span class="iw-item-image"><img src="${escapeHtml(item.image)}" alt=""></span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number ${item.equipped ? '' : 'iw-zero'}">${item.superPotion && item.equipped === null ? '—' : formatNumber(item.equipped || 0)}</div>
              <div class="iw-table-number ${item.stored ? '' : 'iw-zero'}">${formatNumber(item.stored || 0)}</div>
            </div>`).join('')}
          </div>` : '<div class="iw-muted">No Divine Potions found.</div>'}
        </section>
        <section class="iw-card iw-automations-card">
          <div class="iw-card-header"><span>Automations</span><div class="iw-summary"><small>${refreshingAutomations ? 'Updating…' : humanAge(cache.automations?.checkedAt)}</small>${collectingAutomation || automationRows.some((item) => item.lootAmount > 0) ? `<button class="iw-collect-button" data-collect-automations ${automationOn && !collectingAutomation && !refreshingAutomations ? '' : 'disabled'} title="${automationOn ? 'Claim all automation loot' : 'Automation is disabled'}">${collectingAutomation ? 'Claiming…' : 'Claim'}</button>` : ''}</div></div>
          ${cache.automations?.lastError ? `<div class="iw-muted" role="alert">${escapeHtml(cache.automations.lastError)}</div>` : ''}
          ${automationRows.length ? `<div class="iw-data-table iw-automation-table">
            <div class="iw-table-head"><span>Structure</span><span>Making</span><span>Loot</span><span>Queued</span></div>
            ${automationRows.map((item, index) => `<div class="iw-table-row">
              <div class="iw-automation-label" title="${escapeHtml(item.structure)}"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.structure)}</span></div>
              <div class="iw-automation-label" title="${escapeHtml(item.making || 'Idle')}">${item.makingImage ? `<img src="${escapeHtml(item.makingImage)}" alt="">` : '<span class="iw-zero iw-automation-placeholder">—</span>'}<span>${escapeHtml(item.making || 'Idle')}</span></div>
              <div class="iw-automation-value ${item.lootAmount ? '' : 'iw-zero'}" title="${escapeHtml(item.lootName || 'Loot')}" data-live-automation-loot="${index}">${item.lootAmount ? formatNumber(item.lootAmount) : '0'}</div>
              <div class="iw-table-number ${item.queuedTotal > item.queuedDone ? '' : 'iw-zero'}" data-live-automation-queue="${index}">${item.queuedTotal ? formatNumber(Math.max(0, item.queuedTotal - item.queuedDone)) : '0'}</div>
            </div>`).join('')}
          </div>` : `<div class="iw-muted">${refreshingAutomations ? 'Reading structures…' : 'Automation data has not been loaded yet.'}</div>`}
        </section>
        <div class="iw-modal ${questModalOpen ? '' : 'iw-modal-hidden'}" data-modal-backdrop>
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
      consumables.forEach((item, index) => {
        const delta = consumableDeltas[index] || 0;
        const notice = consumableDeltaNotices.get(item.image || item.name);
        if (!delta && !notice) return;
        const element = page.querySelector(`[data-live-consumable-equipped="${index}"]`);
        if (element) {
          const shownDelta = notice?.delta || delta;
          element.dataset.valueDelta = `${shownDelta > 0 ? '+' : ''}${formatNumber(shownDelta)}`;
          element.style.setProperty('--iw-value-delta-delay', `-${Math.min(4000, Math.max(0, noticeNow - (notice?.started || noticeNow)))}ms`);
          element.dataset.valueIcon = consumables[index]?.image || '';
          element.style.setProperty('--value-icon', consumables[index]?.image ? `url(${JSON.stringify(consumables[index].image)})` : 'none');
        }
      });
    } catch (error) {
      console.error('[Ironwood Status] Render failed', error);
      lastSignature = '';
      page.innerHTML = `<section class="iw-card iw-render-error"><strong>Status could not render</strong><span>${escapeHtml(error?.message || String(error))}</span><button class="iw-small-button" data-sync>Repair cached data</button></section>`;
    }
  }

  const routeWrapper = () => document.querySelector('app-component > .scroll > .padding > .wrapper');

  function setStatusHeader(active) {
    const header = document.querySelector('header-component > .header');
    const title = header?.querySelector('.title');
    const image = header?.querySelector('.image img');
    if (!header || !title) return;
    if (active) {
      if (!headerSnapshot) headerSnapshot = { title: clean(title.textContent), image: image?.getAttribute('src') || '' };
      title.textContent = 'Status';
      if (image) image.setAttribute('src', '/assets/misc/leaderboards.png');
    } else if (headerSnapshot) {
      title.textContent = headerSnapshot.title;
      if (image && headerSnapshot.image) image.setAttribute('src', headerSnapshot.image);
      headerSnapshot = null;
    }
  }

  function showStats({ push = true } = {}) {
    const wrapper = routeWrapper();
    if (!wrapper || !page) return;
    if (location.pathname !== STATS_PATH) previousUrl = `${location.pathname}${location.search}${location.hash}`;
    hiddenRouteElements = [...wrapper.children].filter((element) => element !== page && element.tagName !== 'ROUTER-OUTLET');
    hiddenRouteElements.forEach((element) => {
      element.dataset.iwStatsDisplay = element.style.display;
      element.style.display = 'none';
    });
    page.hidden = false;
    navButton?.classList.add('active-link');
    setStatusHeader(true);
    if (push && location.pathname !== STATS_PATH) history.pushState({ iwStats: true }, '', STATS_PATH);
    document.querySelector('app-component > .scroll')?.scrollTo?.(0, 0);
    lastSignature = '';
    render();
    refreshAdventureSnapshot();
    refreshChallengesSnapshot();
    refreshTamingSnapshot();
    refreshAutomationsSnapshot();
  }

  async function showStatusFromCurrentAction() {
    const shortcut = document.querySelector('nav-component action-component button.button, nav-component combat-component button.button');
    if (shortcut) {
      shortcut.click();
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (document.querySelector('skill-page action-component > .card .bars .fill, skill-page combat-component .interface.monster, skill-page combat-component > .card')) break;
        await wait(100);
      }
    }
    await primeNativeEstimates();
    showStats({ push: true });
  }

  function hideStats() {
    if (!page || page.hidden) return;
    page.hidden = true;
    setStatusHeader(false);
    navButton?.classList.remove('active-link');
    hiddenRouteElements.forEach((element) => {
      element.style.display = element.dataset.iwStatsDisplay || '';
      delete element.dataset.iwStatsDisplay;
    });
    hiddenRouteElements = [];
  }

  function leaveStats() {
    hideStats();
    if (location.pathname === STATS_PATH) history.replaceState(null, '', previousUrl || '/');
  }

  function installNavButton() {
    if (document.getElementById(NAV_ID)) {
      navButton = document.getElementById(NAV_ID);
      return;
    }
    const inventory = [...document.querySelectorAll('nav-component .scroll > button')]
      .find((button) => clean(button.textContent) === 'Inventory');
    if (!inventory) return;
    navButton = inventory.cloneNode(true);
    navButton.id = NAV_ID;
    navButton.removeAttribute('routerlink');
    navButton.removeAttribute('routerlinkactive');
    navButton.classList.remove('active-link');
    navButton.querySelector('img')?.setAttribute('src', '/assets/misc/leaderboards.png');
    const name = navButton.querySelector('.name');
    if (name) { name.textContent = 'Status'; name.removeAttribute('style'); }
    navButton.addEventListener('click', () => showStatusFromCurrentAction());
    inventory.before(navButton);
  }

  function installInterfaceControls() {
    const multiplayerName = [...document.querySelectorAll('nav-component .row-button > .name')]
      .find((name) => clean(name.textContent) === 'Multiplayer');
    const multiplayer = multiplayerName?.closest('.row-button');
    if (multiplayer) multiplayer.id = MULTIPLAYER_ID;

    document.querySelectorAll('modal-component .modal').forEach((modal) => {
      const craftableRow = [...modal.querySelectorAll(':scope > .row')]
        .find((row) => clean(row.querySelector(':scope > span')?.textContent) === 'Craftable');
      const input = modal.querySelector('form.actions input[name="quantity"], form.actions input[placeholder="Quantity"]');
      const buttons = modal.querySelector('form.actions > .buttons');
      const nativeCraft = [...(buttons?.querySelectorAll(':scope > button') || [])]
        .find((button) => clean(button.textContent) === 'Craft');
      if (!craftableRow || !input || !buttons || !nativeCraft || buttons.querySelector('[data-craft-all]')) return;
      const craftable = numberFrom(clean(craftableRow.textContent).replace('Craftable', ''));
      const craftAll = nativeCraft.cloneNode(false);
      craftAll.type = 'button';
      craftAll.className = 'craft iw-craft-all';
      craftAll.removeAttribute('disabled');
      craftAll.removeAttribute('style');
      craftAll.dataset.craftAll = '';
      craftAll.textContent = 'Craft All';
      craftAll.disabled = craftable <= 0;
      craftAll.title = `Craft all ${formatNumber(craftable)}`;
      buttons.classList.add('iw-craft-buttons');
      nativeCraft.after(craftAll);
    });

    orderTraitsByRegion();
  }

  function orderTraitsByRegion() {
    if (!location.pathname.startsWith('/traits')) return;
    const card = [...document.querySelectorAll('.card')]
      .find((candidate) => clean(candidate.querySelector(':scope > .header')?.textContent) === 'Traits'
        && [...candidate.querySelectorAll('.row .title')].some((title) => /^Woodcutting\b/.test(clean(title.textContent))));
    const rows = [...(card?.querySelectorAll('.row') || [])]
      .filter((row) => row.querySelector(':scope > .title'));
    if (rows.length < 2 || !rows.every((row) => row.parentElement === rows[0].parentElement)) return;
    const rank = new Map(TRAIT_REGION_ORDER.map((skill, index) => [skill, index]));
    const skillFor = (row) => {
      const name = clean(row.querySelector(':scope > .title')?.textContent);
      return TRAIT_REGION_ORDER.find((skill) => name === skill || name.startsWith(`${skill} `)) || '';
    };
    const ordered = rows.map((row, index) => ({ row, index, order: rank.get(skillFor(row)) ?? TRAIT_REGION_ORDER.length }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map((entry) => entry.row);
    const parent = rows[0].parentElement;
    const headers = [...parent.querySelectorAll(':scope > .iw-trait-region-header')];
    const desiredHeaders = [
      ...TRAIT_REGIONS.map((region) => ({ name: region.name, firstSkill: region.skills[0] })),
      { name: 'All Regions', firstSkill: 'Defense' }
    ];
    const orderCorrect = ordered.every((row, index) => row === rows[index]);
    const headersCorrect = headers.length === desiredHeaders.length && desiredHeaders.every((wanted) => {
      const header = headers.find((candidate) => candidate.dataset.region === wanted.name);
      return header && !header.querySelector('.iw-set-tier') && skillFor(header.nextElementSibling) === wanted.firstSkill;
    });
    if (orderCorrect && headersCorrect) return;
    headers.forEach((header) => header.remove());
    ordered.forEach((row) => parent.appendChild(row));
    desiredHeaders.forEach(({ name, firstSkill }) => {
      const firstRow = ordered.find((row) => skillFor(row) === firstSkill);
      if (!firstRow) return;
      const header = document.createElement('div');
      header.className = 'iw-trait-region-header';
      header.dataset.region = name;
      header.innerHTML = `<strong>${name}</strong>`;
      parent.insertBefore(header, firstRow);
    });
  }

  function createPage() {
    const wrapper = routeWrapper();
    if (!wrapper || document.getElementById(PAGE_ID)) return;
    page = document.createElement('iw-stats-page');
    page.id = PAGE_ID;
    page.hidden = true;
    wrapper.appendChild(page);
  }

  function captureVisibleAdventure() {
    if (location.pathname !== '/adventure' || Date.now() - lastAdventureCapture < 2000) return;
    const researchRow = [...document.querySelectorAll('adventure-page .row')]
      .find((row) => clean(row.querySelector('.name')?.textContent) === 'Research Points');
    const researchText = clean(researchRow?.querySelector('.amount')?.textContent);
    if (!/([\d,]+)\s*\/\s*([\d,]+)/.test(researchText)) return;
    lastAdventureCapture = Date.now();
    collectAdventure(document);
  }

  function captureVisibleQuests() {
    if (Date.now() - (visibleCaptureTimes.quests || 0) < 2000) return;
    const root = document.querySelector('quests-page');
    const names = [...(root?.querySelectorAll('.row .name') || [])].map((element) => clean(element.textContent));
    const dailyCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Daily Quests');
    if (!dailyCard || !names.includes('Auto Quest Completes') || !names.includes('Daily Quest Reset')) return;
    visibleCaptureTimes.quests = Date.now();
    collectQuests(document);
  }

  function captureVisibleAttunement() {
    const root = document.querySelector('attunement-page');
    const slotsCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Slots');
    if (!slotsCard) return;
    const previous = getCache().attunement || {};
    const previousByName = new Map((previous.selected || []).map((item) => [item.name, item]));
    const selected = [...slotsCard.querySelectorAll(':scope > button.row')].map((slot) => {
      const name = clean(slot.querySelector(':scope > .name')?.childNodes[0]?.textContent);
      return {
        ...previousByName.get(name), name,
        skill: clean(slot.querySelector('.name .secondary')?.textContent),
        image: slot.querySelector('img')?.getAttribute('src') || ''
      };
    });
    const requirements = [...root.querySelectorAll('.card')]
      .find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Requirements');
    const tributeRow = [...(requirements?.querySelectorAll(':scope > .row') || [])]
      .find((row) => /^(Forest|Mountain|Ocean) Tribute$/.test(clean(row.querySelector('.name')?.textContent)));
    const tributes = { ...(previous.tributes || {}) };
    const region = clean(tributeRow?.querySelector('.name')?.textContent).replace(' Tribute', '');
    if (region) tributes[region] = numberFrom(clean(tributeRow.querySelector('.amount')?.textContent).split('/')[0]);
    setCache('attunement', { schema: 3, selected, tributes });
  }

  function readVisibleAutomation(doc) {
    const root = doc.querySelector('home-page');
    const cards = [...(root?.querySelectorAll('.card') || [])];
    const structuresCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
    const row = structuresCard?.querySelector(':scope > button.row.active-link');
    const lootCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Loot');
    if (!row || !lootCard) return;
    const structure = clean(row.querySelector(':scope > .name')?.textContent);
    const making = clean([...row.children].find((child) => !child.classList.contains('image') && !child.classList.contains('name'))?.textContent);
    const queueMatch = clean(lootCard.querySelector(':scope > .header > .amount')?.textContent).match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
    if (!queueMatch) return;
    const lootRow = lootCard.querySelector(':scope > .row');
    const actionsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Actions');
    const selectedAction = actionsCard?.querySelector(':scope > button.row.active-link')
      || [...(actionsCard?.querySelectorAll(':scope > button.row') || [])].find((action) => clean(action.querySelector(':scope > .name')?.textContent) === making);
    const statsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Stats');
    const speedRow = [...(statsCard?.querySelectorAll(':scope > .row') || [])]
      .find((item) => clean(item.querySelector('.name')?.textContent) === `${structure} Automation Speed`);
    const speedBonus = numberFrom(speedRow?.querySelector('.bonus')?.textContent) / 100;
    const queuedDone = numberFrom(queueMatch[1]);
    const queuedTotal = numberFrom(queueMatch[2]);
    const lootAmount = numberFrom(lootRow?.querySelector('.amount')?.textContent);
    return {
      structure,
      image: row.querySelector(':scope > .image img')?.getAttribute('src') || '/assets/misc/structure.png',
      making,
      makingImage: selectedAction?.querySelector('img')?.getAttribute('src') || '',
      lootName: clean(lootRow?.querySelector('.name')?.textContent),
      lootAmount,
      queuedDone,
      queuedTotal,
      checkedAt: Date.now(),
      intervalMs: durationMs(selectedAction?.querySelector('.interval')?.textContent) / (1 + Math.max(0, speedBonus)),
      outputPerAction: queuedDone > 0 ? lootAmount / queuedDone : 0
    };
  }

  function storeAutomationStructure(item) {
    const previous = getCache().automations || {};
    const prior = previous.structures?.find((entry) => entry.structure === item.structure);
    if (!item.outputPerAction && prior?.making === item.making) item.outputPerAction = prior.outputPerAction || 0;
    const byStructure = new Map((previous.structures || []).map((entry) => [entry.structure, {
      ...entry, checkedAt: entry.checkedAt || previous.checkedAt || Date.now()
    }]));
    byStructure.set(item.structure, item);
    const structures = [...byStructure.values()];
    setCache('automations', automationSnapshot(structures));
  }

  function captureVisibleAutomation() {
    const item = readVisibleAutomation(document);
    if (!item) return;
    const captureKey = `automations:${item.structure}`;
    if (Date.now() - (visibleCaptureTimes[captureKey] || 0) < 1500) return;
    visibleCaptureTimes[captureKey] = Date.now();
    storeAutomationStructure(item);
  }

  function captureVisibleCaches() {
    if (!page?.hidden || location.pathname === STATS_PATH) return;
    const path = location.pathname;
    const capture = (key, ready, fn) => {
      if (!ready || Date.now() - (visibleCaptureTimes[key] || 0) < 2000) return;
      visibleCaptureTimes[key] = Date.now();
      fn();
    };
    if (path === '/quests') captureVisibleQuests();
    else if (path === '/inventory') capture('inventory', document.querySelector('inventory-page'), () => collectInventory(document));
    else if (path === '/equipment') capture('equipped', [...document.querySelectorAll('.card')].some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'), () => storeEquippedDivine(divineConsumables(document), true));
    else if (path === '/adventure') captureVisibleAdventure();
    else if (path === '/challenges') capture('challenges', document.querySelector('challenges-page'), () => collectChallenges(document));
    else if (path === '/skill/15') capture('taming', document.querySelector('taming-page .row .name'), () => collectTaming(document));
    else if (path === '/attunement') capture('attunement', document.querySelector('attunement-page'), captureVisibleAttunement);
    else if (path === '/mastery') capture('mastery', document.querySelector('mastery-page'), () => collectMastery(document));
    else if (path === '/profile') capture('playerName', document.querySelector('profile-page profile-card-component .name'), () => collectPlayerName(document));
    else if (path.startsWith('/house')) captureVisibleAutomation();
    else if (path.startsWith('/guild')) {
      const headers = [...document.querySelectorAll('guild-page .card > .header > .name')].map((element) => clean(element.textContent));
      if (headers.includes('Event') && headers.includes('Participants')) capture('guildEvent', true, () => collectGuildEvent(document));
      if (headers.some((name) => /^(Incomplete|Complete) Trials$/.test(name))) capture('guildTrial', true, () => collectGuildTrial(document));
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PAGE_ID}[hidden] { display:none !important; }
      #${MULTIPLAYER_ID} { display:none !important; }
      #${PAGE_ID} { display:block; width:100%; color:#fff; font-family:Jost,"Helvetica Neue",Arial,sans-serif; font-size:16px; line-height:24px; }
      .iw-stats-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:stretch; gap:10px; }
      .iw-card { overflow:hidden; margin-bottom:10px; color:#fff; background:#0d2234; border-radius:4px; box-shadow:0 6px 12px -6px rgba(0,0,0,.4); }
      .iw-action-card, .iw-loot-card { height:100%; margin-bottom:0; }
      .iw-activity-card, .iw-potion-card { align-self:start; height:auto; margin-bottom:0; }
      .iw-potion-card { grid-column:1; }
      .iw-card-header { display:flex; align-items:center; justify-content:space-between; height:48px; padding:8px 10px; border-bottom:1px solid #294052; box-sizing:border-box; font-size:16px; font-weight:600; line-height:24px; }
      .iw-card-header small { color:#aab6bf; font-size:14px; font-weight:400; }
      .iw-trait-region-header { display:flex; align-items:center; justify-content:space-between; min-height:32px; padding:3px 10px; color:#dce7ec; background:#102a3d; border-top:1px solid #355064; border-bottom:1px solid #294052; box-sizing:border-box; }
      .iw-trait-region-header strong { font-size:14px; font-weight:600; letter-spacing:.02em; }
      .iw-live { display:flex; align-items:center; gap:7px; color:#31c777; font-size:12px; letter-spacing:.05em; }
      .iw-live i { width:8px; height:8px; border-radius:50%; background:#31c777; box-shadow:0 0 0 3px rgba(49,199,119,.15); }
      .iw-action-badges { display:flex; align-items:center; gap:6px; height:30px; }
      .iw-location-badge, .iw-active-badge, .iw-mastery-badge, .iw-adventure-badge, .iw-guild-event-badge, .iw-guild-trial-badge, .iw-material-warning, .iw-queue-warning, .iw-revive-badge { position:relative; display:block; width:34px; height:34px; overflow:hidden; border:1px solid; border-radius:5px; box-sizing:border-box; }
      .iw-revive-badge { display:grid; place-items:center; color:#ff8178; background:rgba(224,65,58,.14); border-color:#e95f57; font-size:21px; line-height:1; text-shadow:0 0 8px rgba(255,62,48,.72); box-shadow:inset 0 0 0 1px rgba(255,180,170,.06),0 0 9px rgba(235,72,62,.3); }
      .iw-revive-badge { margin-left:4px; animation:iw-death-badge-glow 1.8s ease-in-out infinite; }
      .iw-active-badge.revive-active { color:#ff8178; background:rgba(224,65,58,.14); border-color:#e95f57; box-shadow:inset 0 0 0 1px rgba(255,180,170,.06),0 0 9px rgba(235,72,62,.3); }
      .iw-active-badge.revive-active .iw-spin-motion { animation:none; }
      .iw-location-badge img, .iw-mastery-badge img { position:absolute; top:50%; left:50%; display:block; width:24px; height:24px; object-fit:contain; transform:translate(-50%,-50%); }
      .iw-mastery-badge { color:#a8b2bc; background:rgba(135,149,162,.045); border-color:rgba(154,168,181,.42); box-shadow:inset 0 0 0 1px rgba(220,228,235,.025); }
      .iw-mastery-badge img { filter:grayscale(1); opacity:.42; }
      .iw-mastery-badge.achieved { color:#ffe28a; background:rgba(238,181,48,.11); border-color:#e8b43e; box-shadow:inset 0 0 0 1px rgba(255,239,173,.06),0 0 8px rgba(232,180,62,.24); }
      .iw-mastery-badge.achieved img { filter:none; opacity:1; }
      .iw-location-badge.outskirts { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-location-badge.dungeon { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-location-badge.village, .iw-active-badge { color:#78efa9; background:rgba(56,221,137,.08); border-color:#38dd89; box-shadow:inset 0 0 0 1px rgba(195,255,217,.04),0 0 7px rgba(42,220,130,.16); }
      .iw-active-badge .iw-spin { position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; }
      .iw-adventure-badge, .iw-guild-event-badge, .iw-guild-trial-badge { display:grid; place-items:center; background:rgba(68,171,221,.12); border-color:#4fb7e5; box-shadow:inset 0 0 0 1px rgba(198,239,255,.04),0 0 7px rgba(79,183,229,.18); }
      .iw-adventure-badge img, .iw-guild-event-badge img, .iw-guild-trial-badge img { width:27px; height:27px; object-fit:contain; image-rendering:auto; }
      .iw-material-warning, .iw-queue-warning { color:#ffd078; background:rgba(231,164,45,.09); border-color:#e7a42d; box-shadow:inset 0 0 0 1px rgba(255,222,153,.04),0 0 8px rgba(231,164,45,.2); }
      .iw-material-warning.urgent, .iw-queue-warning.urgent { color:#ff8d87; background:rgba(230,72,65,.1); border-color:#ed5a52; box-shadow:inset 0 0 0 1px rgba(255,190,184,.04),0 0 8px rgba(237,90,82,.22); }
      .iw-material-warning svg, .iw-queue-warning svg { position:absolute; top:50%; left:50%; width:21px; height:21px; transform:translate(-50%,-50%); fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      .iw-spin { display:block; width:18px; height:18px; overflow:visible; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      .iw-spin-track { opacity:.2; stroke-width:1.5; }
      .iw-spin-motion { transform-origin:12px 12px; will-change:transform; backface-visibility:hidden; animation:iw-spin 1.15s linear infinite; }
      @keyframes iw-spin { from { transform:translateZ(0) rotate(0deg); } to { transform:translateZ(0) rotate(360deg); } }
      @keyframes iw-death-badge-glow { 0%,100% { filter:brightness(.95); box-shadow:inset 0 0 0 1px rgba(255,180,170,.06),0 0 7px rgba(235,72,62,.25); } 50% { filter:brightness(1.18); box-shadow:inset 0 0 0 1px rgba(255,180,170,.1),0 0 14px rgba(235,72,62,.5),0 0 24px rgba(235,72,62,.18); } }
      .iw-action-body { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:8px; min-height:54px; padding:6px; }
      .iw-action-image { display:grid; place-items:center; width:40px; height:40px; background:#0b2539; border:1px solid #203a4d; border-radius:4px; }
      .iw-action-image img { width:32px; height:32px; object-fit:contain; }
      .iw-combat-card { border:1px solid rgba(89,190,244,.58); background:linear-gradient(145deg,#102d45,#0b1d30 58%,#102f48); box-shadow:0 0 0 1px rgba(65,164,222,.1),0 8px 20px rgba(23,137,205,.13),inset 0 0 24px rgba(35,143,207,.06); }
      .iw-combat-card .iw-card-header { background:linear-gradient(90deg,rgba(47,151,211,.2),transparent 65%); border-bottom-color:rgba(89,190,244,.35); }
      .iw-combat-card .iw-action-image { border-color:rgba(74,185,236,.8); box-shadow:0 0 10px rgba(62,184,235,.24); animation:iw-combat-pulse 2.6s ease-in-out infinite; }
      .iw-combat-card .iw-progress div { background:linear-gradient(90deg,#3b9bd2,#83cde9,#3b9bd2); background-size:200% 100%; animation:iw-bar-sheen 3.4s linear infinite; }
      .iw-combat-live { display:inline-flex; align-items:center; gap:4px; color:#8de2ff; font-size:10px; letter-spacing:.12em; }
      .iw-combat-live i { width:6px; height:6px; border-radius:50%; background:#65d9ff; box-shadow:0 0 7px #65d9ff; animation:iw-live-pulse 1s ease-in-out infinite; }
      .iw-duel-board { position:relative; display:grid; grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr); align-items:center; gap:8px; padding:18px 10px 20px; background:linear-gradient(180deg,rgba(4,15,27,.18),rgba(40,104,139,.08)); border-top:1px solid rgba(109,184,218,.12); border-bottom:1px solid rgba(109,184,218,.16); }
      .iw-duel-board::after { display:none; }
      .iw-duel-board::before { display:none; }
      .iw-fighter { position:relative; min-width:0; display:flex; flex-direction:column; }
      .iw-fighter::after { content:''; position:absolute; left:20%; bottom:14px; width:var(--fighter-progress,0%); max-width:60%; height:3px; border-radius:2px; background:linear-gradient(90deg,rgba(73,181,229,.35),rgba(133,228,255,.9)); box-shadow:0 0 4px rgba(73,198,242,.3); transition:width .28s ease-out; }
      .iw-fighter-heading { display:none; }
      .iw-fighter-heading span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .iw-fighter-heading b { color:#f1f7f8; font-weight:500; white-space:nowrap; }
      .iw-fighter-visual { position:relative; display:grid; place-items:center; order:1; height:84px; }
      .iw-fighter-visual img { position:relative; z-index:1; width:82px; height:82px; object-fit:contain; image-rendering:pixelated; filter:drop-shadow(0 7px 9px rgba(0,0,0,.38)); }
      .iw-fighter-visual img { animation:iw-fighter-float 3.8s ease-in-out infinite; }
      .iw-fighter-monster .iw-fighter-visual img { transform:scaleX(-1); animation:iw-fighter-float-monster 3.8s ease-in-out infinite; }
      .iw-fighter.iw-hit .iw-fighter-visual img { animation:iw-hit-reaction .48s cubic-bezier(.2,.8,.3,1) both; }
      .iw-fighter-monster.iw-hit .iw-fighter-visual img { animation:iw-hit-reaction-monster .48s cubic-bezier(.2,.8,.3,1) both; }
      .iw-fighter.iw-hit .iw-fighter-visual::after { content:''; position:absolute; inset:12px 22%; border-radius:50%; background:rgba(224,70,65,.12); filter:blur(7px); animation:iw-impact-flash .62s ease-out both; }
      .iw-fighter-player .iw-fighter-visual::before { content:''; position:absolute; z-index:4; right:calc(50% + 28px); top:2px; width:27px; height:27px; background:var(--iw-use-icon, none) center/contain no-repeat; filter:drop-shadow(0 0 7px rgba(125,225,255,.45)); animation:iw-floating-event 4s ease-out both; animation-delay:var(--iw-use-delay,0ms); pointer-events:none; }
      .iw-fighter-monster .iw-fighter-visual::before { content:''; position:absolute; z-index:4; left:calc(50% + 28px); top:2px; width:27px; height:27px; background:var(--iw-drop-icon, none) center/contain no-repeat; filter:drop-shadow(0 0 7px rgba(255,205,95,.5)); animation:iw-floating-event 4s ease-out both; animation-delay:var(--iw-drop-delay,0ms); pointer-events:none; }
      .iw-fighter-monster.iw-fighter-dead .iw-fighter-visual::before,
      .iw-fighter-monster.iw-spawn .iw-fighter-visual::before { opacity:0; animation:none; }
      .iw-fighter.iw-spawn .iw-fighter-visual img { animation:iw-spawn-in 2.8s cubic-bezier(.2,.8,.25,1) both; }
      .iw-fighter-monster.iw-spawn .iw-fighter-visual img { animation:iw-spawn-in-monster 2.8s cubic-bezier(.2,.8,.25,1) both; }
      .iw-fighter-monster.iw-spawn .iw-fighter-visual img { animation-delay:1.15s; }
      .iw-fighter-monster.iw-spawn .iw-fighter-visual::before { content:'✕'; display:grid; place-items:center; opacity:0; background:none; color:#ff7468; font-size:43px; font-weight:800; line-height:1; text-shadow:0 0 11px rgba(255,54,45,.9),0 0 26px rgba(255,54,45,.55); animation:iw-death-to-spawn 3.4s ease-out both; }
      .iw-fighter.iw-spawn .iw-fighter-visual::after { content:''; position:absolute; z-index:2; inset:0 8%; border-radius:50%; background:radial-gradient(circle,rgba(126,255,176,.78) 0,rgba(63,231,145,.34) 34%,transparent 70%); filter:blur(2px); opacity:0; animation:iw-spawn-burst 2.8s ease-out both; pointer-events:none; }
      .iw-fighter-monster.iw-spawn .iw-spawn-ring { animation-delay:1.15s; }
      .iw-death-stamp { position:absolute; z-index:5; display:grid; place-items:center; width:44px; height:44px; border:2px solid rgba(255,92,78,.95); border-radius:50%; color:#ff786d; font-size:32px; font-weight:700; line-height:1; text-shadow:0 0 8px rgba(255,62,48,.75),0 0 18px rgba(255,62,48,.45); box-shadow:0 0 10px rgba(255,62,48,.42),0 0 24px rgba(255,62,48,.3),inset 0 0 7px rgba(255,62,48,.25); animation:iw-death-stamp 3.1s ease-out both; pointer-events:none; }
      .iw-bone-pile { position:absolute; z-index:4; left:50%; bottom:2px; width:62px; height:34px; background:url('/assets/items/giant-bone.png') center/34px 26px no-repeat; opacity:0; filter:drop-shadow(0 3px 3px rgba(0,0,0,.55)); animation:iw-bone-pile-rise 3.1s 1s ease-out both; pointer-events:none; }
      .iw-bone-pile::before, .iw-bone-pile::after { content:''; position:absolute; width:34px; height:26px; background:url('/assets/items/giant-bone.png') center/contain no-repeat; }
      .iw-bone-pile::before { left:2px; bottom:0; transform:rotate(-24deg) scale(.78); }
      .iw-bone-pile::after { right:0; bottom:1px; transform:rotate(23deg) scale(.82); }
      .iw-fighter-reviving .iw-fighter-visual img { opacity:0; animation:none !important; transform:none !important; }
      .iw-bone-pile-static { opacity:1; animation:none; transform:translateX(-50%); }
      .iw-spawn-ring { position:absolute; width:56px; height:56px; border:2px solid rgba(87,225,255,.72); border-radius:50%; box-shadow:0 0 15px rgba(42,211,255,.55),0 0 30px rgba(42,211,255,.3); animation:iw-spawn-ring 3.2s ease-out both; }
      .iw-floating-heal, .iw-spawn-ring { left:auto; right:calc(50% + 28px); }
      .iw-fighter-monster .iw-floating-heal, .iw-fighter-monster .iw-spawn-ring { left:calc(50% + 28px); right:auto; }
      .iw-spawn-ring::after { content:'♥'; position:absolute; inset:0; color:rgba(104,239,255,.9); font-size:31px; font-weight:300; line-height:52px; text-align:center; text-shadow:0 0 8px rgba(42,211,255,.5),0 0 18px rgba(42,211,255,.35); }
      .iw-fighter-monster .iw-spawn-ring::after { color:rgba(104,255,153,.9); text-shadow:0 0 8px rgba(42,235,116,.58); }
      .iw-fighter-glow { position:absolute; width:72px; height:19px; bottom:3px; border-radius:50%; background:rgba(74,190,232,.28); filter:blur(10px); }
      .iw-floating-heal { position:absolute; z-index:3; top:0; width:27px; height:27px; color:rgba(92,255,157,.82); font-size:0; text-shadow:0 1px 4px #071923,0 0 9px rgba(53,255,140,.5); animation:iw-floating-heal 1.8s ease-out both; pointer-events:none; }
      .iw-floating-heal::before { content:''; display:block; width:27px; height:27px; background:var(--iw-recovery-icon) center/contain no-repeat; filter:drop-shadow(0 0 5px rgba(53,255,140,.55)); }
      .iw-enemy-heal::before { content:'♥'; display:block; width:27px; height:27px; color:rgba(104,255,153,.92); font-size:25px; font-weight:400; line-height:27px; text-align:center; text-shadow:0 0 7px rgba(42,235,116,.58); }
      .iw-fighter-monster .iw-floating-heal::before { content:'♥'; background:none !important; color:rgba(104,255,153,.92); font-size:25px; font-weight:400; line-height:27px; text-align:center; text-shadow:0 0 7px rgba(42,235,116,.58); }
      .iw-fighter-monster .iw-fighter-glow { background:rgba(232,91,87,.23); }
      .iw-fighter-monster.iw-fighter-dead .iw-fighter-visual { animation:iw-death-stage 3.1s ease-out both; }
      .iw-hp-track { position:relative; width:60%; height:9px; margin:19px auto 0; order:3; overflow:visible; background:#172d3b; border:1px solid rgba(138,179,193,.2); border-radius:5px; box-shadow:inset 0 1px 2px rgba(0,0,0,.3); box-sizing:border-box; }
      .iw-hp-fill { position:relative; z-index:1; height:100%; border-radius:inherit; background:linear-gradient(90deg,#19b86d,#62f29a,#1acb76); background-size:180% 100%; box-shadow:0 0 6px rgba(63,235,135,.38),0 0 12px rgba(29,204,112,.16); transition:width .35s ease-out; }
      /* Keep the live fill stable; transient hit/heal effects are layered on the track
         so width updates do not restart a second animation on every polling tick. */
      .iw-fighter-player .iw-hp-fill { animation:none; }
      .iw-fighter.iw-hit .iw-hp-fill { animation:iw-hp-impact .62s ease-out both; }
      .iw-fighter:has(.iw-shield) .iw-hp-fill { animation:iw-defense-glow .72s ease-out both; }
      .iw-fighter-monster .iw-hp-fill { background:linear-gradient(90deg,#ca514d,#f4876b); box-shadow:0 0 7px rgba(235,95,83,.25); }
      .iw-hp-damage { position:absolute; z-index:2; top:-2px; bottom:-2px; min-width:3px; background:linear-gradient(180deg,#f5dfb2 0%,#e99b65 28%,#d6534e 100%); box-shadow:0 0 4px rgba(255,181,111,.52),0 2px 5px rgba(180,42,39,.3); transform-origin:center bottom; animation:iw-damage-fall 1.05s cubic-bezier(.17,.72,.24,1) both; }
      .iw-fighter.iw-hit .iw-hp-track::after { content:''; position:absolute; z-index:3; inset:-2px 0; border-radius:inherit; background:linear-gradient(90deg,transparent,rgba(235,93,83,.3),transparent); opacity:0; animation:iw-hp-flash .58s ease-out both; pointer-events:none; }
      .iw-fighter-dead .iw-hp-track::before { content:''; position:absolute; z-index:3; inset:-1px 0; border-radius:inherit; background:linear-gradient(180deg,rgba(255,220,175,.7),rgba(87,226,128,.42),transparent); transform:scaleY(0); transform-origin:top; animation:iw-hp-heal-grow .9s .34s cubic-bezier(.2,.8,.25,1) both; pointer-events:none; }
      .iw-fighter-dead .iw-hp-track::after { content:''; position:absolute; z-index:4; inset:-4px 0; border-radius:inherit; background:rgba(244,64,55,.9); opacity:0; animation:iw-death-bar-flash .7s ease-out both; pointer-events:none; }
      .iw-fighter.iw-heal .iw-hp-track::before { content:''; position:absolute; z-index:3; inset:-1px 0; border-radius:inherit; background:linear-gradient(180deg,rgba(220,255,224,.9),rgba(91,231,137,.42) 55%,transparent); background-size:100% 220%; transform:scaleY(0); transform-origin:top; animation:iw-hp-heal-grow 1.8s cubic-bezier(.2,.8,.25,1) both; pointer-events:none; }
      .iw-duel-divider { color:#d8b96b; font-size:10px; font-weight:600; letter-spacing:.12em; text-align:center; opacity:.8; }
      @keyframes iw-fighter-in { from { opacity:.4; transform:translateY(3px); } to { opacity:1; transform:none; } }
      @keyframes iw-fighter-float { 50% { transform:translateY(-2px); } }
      @keyframes iw-fighter-float-monster { 50% { transform:translateY(-2px) scaleX(-1); } }
      @keyframes iw-hit-reaction { 0% { transform:translateX(0) scale(1); filter:brightness(1); } 22% { transform:translateX(-3px) scale(.97); filter:brightness(1.1); } 55% { transform:translateX(2px) scale(1.01); filter:brightness(1.03); } 100% { transform:none; filter:none; } }
      @keyframes iw-hit-reaction-monster { 0% { transform:translateX(0) scaleX(-1) scale(1); filter:brightness(1); } 22% { transform:translateX(3px) scaleX(-1) scale(.97); filter:brightness(1.1); } 55% { transform:translateX(-2px) scaleX(-1) scale(1.01); filter:brightness(1.03); } 100% { transform:scaleX(-1); filter:none; } }
      @keyframes iw-impact-flash { 0% { opacity:0; transform:scale(.55); } 20% { opacity:.9; transform:scale(1); } 100% { opacity:0; transform:scale(1.35); } }
      @keyframes iw-hp-impact { 0% { opacity:1; filter:brightness(1.3); } 24% { opacity:.52; filter:brightness(1); } 100% { opacity:.78; filter:brightness(.92); } }
      @keyframes iw-defense-glow { 0% { filter:brightness(1); box-shadow:0 0 5px rgba(70,203,133,.2); } 24% { filter:brightness(1.35) saturate(1.2); box-shadow:0 0 13px rgba(74,187,255,.85),0 0 24px rgba(74,187,255,.32); } 100% { filter:brightness(1); box-shadow:0 0 5px rgba(70,203,133,.2); } }
      @keyframes iw-damage-fall { 0% { opacity:1; transform:translateY(0) scaleY(1) skewX(0); filter:brightness(1.3); } 28% { opacity:.98; transform:translateY(2px) scaleY(1.03) skewX(-5deg); filter:brightness(1.15); } 62% { opacity:.72; transform:translateY(6px) scaleY(.88) skewX(3deg); } 100% { opacity:0; transform:translateY(10px) scaleY(.5) skewX(0); filter:blur(1px); } }
      @keyframes iw-hp-flash { 0% { opacity:0; transform:scaleX(.4); } 18% { opacity:.9; transform:scaleX(1); } 100% { opacity:0; transform:scaleX(1.1); } }
      @keyframes iw-hp-heal-grow { 0% { opacity:0; transform:scaleY(0) skewX(0); background-position:0 0; } 18% { opacity:.9; transform:scaleY(.72) skewX(-3deg); background-position:0 20%; } 40% { opacity:.78; transform:scaleY(1) skewX(3deg); background-position:0 48%; } 68% { opacity:.52; transform:scaleY(1.04) skewX(-2deg); background-position:0 76%; } 100% { opacity:0; transform:scaleY(1.1) skewX(0); background-position:0 100%; } }
      @keyframes iw-floating-event { 0% { opacity:0; transform:translateY(5px) rotate(-4deg) scale(.8); } 18% { opacity:1; transform:translateY(0) rotate(3deg) scale(1); } 76% { opacity:.34; transform:translateY(-13px) rotate(-2deg) scale(.96); } 100% { opacity:.12; transform:translateY(-17px) rotate(-1deg) scale(.92); } }
      @keyframes iw-death-bar-flash { 0% { opacity:0; } 20% { opacity:.88; } 100% { opacity:0; } }
      @keyframes iw-death-stage { 0%,12% { filter:none; transform:scale(1); } 18% { filter:brightness(1.55) saturate(1.3); transform:scale(1.06); } 34% { filter:grayscale(.7) brightness(.8); transform:scale(.96) translateY(2px); } 62% { filter:grayscale(1) brightness(.55); transform:scale(.72) translateY(10px); } 100% { filter:grayscale(1) brightness(.35); transform:scale(.42) translateY(22px); opacity:.08; } }
      @keyframes iw-neon-hp { 0%,100% { background-position:0 0; filter:brightness(.94); } 50% { background-position:100% 0; filter:brightness(1.14); } }
      @keyframes iw-floating-heal { 0% { opacity:0; transform:translateY(5px) rotate(-6deg) scale(.8); } 18% { opacity:1; transform:translateY(0) rotate(4deg) scale(1); } 45% { transform:translateY(-4px) rotate(-3deg) scale(1.03); } 72% { opacity:.48; transform:translateY(-10px) rotate(3deg) scale(.98); } 100% { opacity:.12; transform:translateY(-18px) rotate(-1deg) scale(.92); } }
      .iw-combat-card .iw-fighter-dead .iw-fighter-visual img { animation:iw-death 3.1s ease-in forwards; }
      .iw-combat-card .iw-fighter-monster.iw-fighter-dead .iw-fighter-visual img { animation:iw-death-monster 3.1s ease-in forwards; }
      .iw-combat-card .iw-fighter-dead .iw-fighter-visual::after { content:''; position:absolute; z-index:2; inset:-4px 4%; border-radius:50%; background:radial-gradient(circle,rgba(255,104,82,.82) 0,rgba(214,53,49,.38) 34%,transparent 72%); filter:blur(2px); opacity:0; animation:iw-death-burst 3.1s ease-out both; pointer-events:none; }
      @keyframes iw-death { 0% { opacity:1; filter:none; transform:translateY(0) rotate(0) scale(1); } 24% { opacity:1; filter:brightness(1.35); transform:translateY(-2px) rotate(-3deg) scale(.92); } 52% { opacity:.68; filter:grayscale(.8) blur(1px) brightness(.82); transform:translateY(8px) rotate(5deg) scale(.58); } 78% { opacity:.16; filter:grayscale(1) blur(3px) brightness(.55) drop-shadow(0 0 0 transparent); transform:translateY(18px) rotate(10deg) scale(.2); } 100% { opacity:0; filter:grayscale(1) blur(6px) brightness(.4) drop-shadow(0 0 0 transparent); transform:translateY(26px) rotate(14deg) scale(.02); } }
      @keyframes iw-death-monster { 0% { opacity:1; filter:none; transform:translateY(0) rotate(0) scaleX(-1) scale(1); } 24% { opacity:1; filter:brightness(1.35); transform:translateY(-2px) rotate(-3deg) scaleX(-1) scale(.92); } 52% { opacity:.68; filter:grayscale(.8) blur(1px) brightness(.82); transform:translateY(8px) rotate(5deg) scaleX(-1) scale(.58); } 78% { opacity:.16; filter:grayscale(1) blur(3px) brightness(.55) drop-shadow(0 0 0 transparent); transform:translateY(18px) rotate(10deg) scaleX(-1) scale(.2); } 100% { opacity:0; filter:grayscale(1) blur(6px) brightness(.4) drop-shadow(0 0 0 transparent); transform:translateY(26px) rotate(14deg) scaleX(-1) scale(.02); } }
      @keyframes iw-death-burst { 0%,10% { opacity:0; transform:scale(.25); } 22% { opacity:1; transform:scale(1); } 48% { opacity:.78; transform:scale(1.14); } 100% { opacity:0; transform:scale(2.1); } }
      @keyframes iw-death-stamp { 0% { opacity:0; transform:scale(.2) rotate(-18deg); } 12% { opacity:1; transform:scale(1.3) rotate(6deg); } 32% { opacity:1; transform:scale(1) rotate(0); } 62% { opacity:.92; transform:scale(1.08) rotate(-3deg); } 100% { opacity:0; transform:scale(1.7) rotate(12deg); } }
      @keyframes iw-bone-pile-rise { 0%,24% { opacity:0; transform:translate(-50%,8px) scale(.55); } 42% { opacity:.9; transform:translate(-50%,0) scale(1); } 72% { opacity:.82; transform:translate(-50%,-1px) scale(1.04); } 100% { opacity:0; transform:translate(-50%,-5px) scale(1.1); } }
      @keyframes iw-spawn-in { 0% { opacity:0; filter:blur(9px) brightness(2); transform:translateY(18px) scale(.08); } 28% { opacity:.42; filter:blur(5px) brightness(1.65); transform:translateY(9px) scale(.38); } 56% { opacity:.95; filter:blur(1px) brightness(1.25); transform:translateY(-4px) scale(1.16); } 76% { opacity:1; filter:blur(0) brightness(1.08); transform:translateY(1px) scale(.94); } 100% { opacity:1; filter:none; transform:none; } }
      @keyframes iw-spawn-in-monster { 0% { opacity:0; filter:blur(9px) brightness(2); transform:translateY(18px) scaleX(-1) scale(.08); } 28% { opacity:.42; filter:blur(5px) brightness(1.65); transform:translateY(9px) scaleX(-1) scale(.38); } 56% { opacity:.95; filter:blur(1px) brightness(1.25); transform:translateY(-4px) scaleX(-1) scale(1.16); } 76% { opacity:1; filter:blur(0) brightness(1.08); transform:translateY(1px) scaleX(-1) scale(.94); } 100% { opacity:1; filter:none; transform:scaleX(-1); } }
      @keyframes iw-spawn-burst { 0% { opacity:0; transform:scale(.18); } 28% { opacity:.9; transform:scale(.65); } 100% { opacity:0; transform:scale(2.1); } }
      @keyframes iw-death-to-spawn { 0%,6% { opacity:0; transform:translateY(5px) scale(.35) rotate(-12deg); } 14% { opacity:1; transform:translateY(0) scale(1.2) rotate(6deg); } 28% { opacity:.9; transform:translateY(1px) scale(1) rotate(0); } 42% { opacity:0; transform:translateY(5px) scale(1.35) rotate(10deg); } 100% { opacity:0; transform:translateY(5px) scale(1.35) rotate(10deg); } }
      @keyframes iw-spawn-ring { 0% { opacity:.9; transform:scale(.35); } 72% { opacity:.24; transform:scale(2.6); } 100% { opacity:.1; transform:scale(3.2); } }
      @keyframes iw-combat-pulse { 50% { box-shadow:0 0 15px rgba(62,184,235,.4); transform:scale(1.015); } }
      @keyframes iw-bar-sheen { to { background-position:200% 0; } }
      @keyframes iw-live-pulse { 50% { opacity:.35; transform:scale(.7); } }
      .iw-action-name { display:flex; flex-direction:column; gap:2px; }
      .iw-action-name strong { font-size:16px; font-weight:400; }
      .iw-action-name span { color:#aab6bf; font-size:14px; }
      .iw-action-title { display:flex; align-items:baseline; gap:5px; }
      .iw-action-title strong { color:#fff; }
      .iw-action-title small { color:#8fa1ad; font-size:12px; font-weight:400; }
      .iw-revive-timer { color:#7ff0a8; font-weight:600; }
      .iw-action-meta .iw-revive-timer { color:#fff; font-weight:700; }
      .iw-action-meta { display:flex; align-items:center; flex-wrap:wrap; line-height:20px; }
      .iw-action-meta > span + span::before { content:'·'; margin:0 6px; color:#71818d; }
      .iw-queue-summary { display:flex; flex-direction:column; align-items:flex-end; min-width:220px; margin-left:6px; padding:1px 6px 1px 12px; white-space:nowrap; }
      .iw-queue-summary > span { color:#71818d; font-size:10px; line-height:14px; text-transform:uppercase; letter-spacing:.04em; }
      .iw-queue-summary > strong { font-size:15px; font-weight:500; line-height:19px; }
      .iw-queue-summary > small { color:#71818d; font-size:10px; font-weight:400; line-height:14px; }
      .iw-queue-values { display:flex; align-items:center; gap:7px; }
      .iw-queue-values span + span::before { content:'·'; margin-right:7px; color:#506675; }
      .iw-queue-values b { color:#aab6bf; font-weight:500; font-variant-numeric:tabular-nums; }
      .iw-queue-values em { color:#71818d; font-style:normal; }
      .iw-progress { height:10px; margin:0 6px 6px; overflow:hidden; background:#142e40; border:1px solid rgba(117,157,181,.12); border-radius:999px; box-sizing:border-box; box-shadow:inset 0 1px 2px rgba(0,0,0,.28); }
      .iw-progress div { height:100%; background:linear-gradient(90deg,#4f9fce,#76c5ed); border-radius:inherit; box-shadow:0 0 5px rgba(103,187,231,.22); transition:width .2s linear; }
      .iw-progress-stack { display:grid; gap:4px; margin:1px 6px 7px; }
      .iw-progress-stack .iw-progress { margin:0; }
      .iw-skill-progress { background:#16342b; border-color:rgba(91,185,124,.13); }
      .iw-skill-progress div { background:linear-gradient(90deg,#429d62,#6bd28b); box-shadow:0 0 5px rgba(82,202,125,.2); }
      .iw-muted { color:#aab6bf; }
      .iw-subheader { padding:12px 10px; border-top:1px solid #294052; border-bottom:1px solid #294052; font-weight:600; }
      .iw-consumable-head, .iw-consumable { display:grid; grid-template-columns:40px minmax(0,1fr) 82px 82px; align-items:center; }
      .iw-material-head, .iw-material { display:grid; grid-template-columns:40px minmax(0,1fr) 100px; align-items:center; }
      .iw-consumable-head { min-height:28px; padding:0 6px; color:#8fa1ad; border-bottom:1px solid #294052; font-size:11px; font-weight:500; text-transform:uppercase; }
      .iw-consumable-head span:nth-child(n+3) { text-align:right; }
      .iw-material-head { min-height:28px; padding:0 6px; color:#8fa1ad; border-bottom:1px solid #294052; font-size:11px; font-weight:500; text-transform:uppercase; }
      .iw-material-head span:last-child { text-align:right; }
      .iw-consumable, .iw-material { min-height:37px; padding:2px 6px; border-bottom:1px solid #294052; box-sizing:border-box; font-size:16px; line-height:24px; }
      .iw-consumable img, .iw-material img { width:32px; height:32px; object-fit:contain; }
      .iw-consumable b, .iw-material b { color:#aab6bf; font-size:16px; font-weight:400; line-height:24px; text-align:right; font-variant-numeric:tabular-nums; }
      .iw-consumable b { white-space:nowrap; }
      .iw-consumable-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .iw-consumable-name small { color:#82929e; font-size:12px; font-weight:400; }
      .iw-consumable b.iw-zero { color:#71818d; }
      .iw-muted { padding:11px; }
      .iw-summary { display:flex; align-items:center; gap:12px; font-size:14px; font-weight:400; }
      .iw-summary span { color:#aab6bf; }
      .iw-summary strong { display:flex; align-items:center; justify-content:flex-end; gap:5px; }
      .iw-summary img { width:17px; height:17px; }
      .iw-loot-list { padding:0 8px 5px; }
      .iw-loot-row { display:grid; grid-template-columns:32px minmax(100px,1fr) 72px 105px; align-items:center; min-height:36px; border-bottom:1px solid #263a49; font-size:14px; }
      .iw-loot-row:last-child { border-bottom:0; }
      .iw-item-image { display:grid; place-items:center; }
      .iw-item-image img { width:32px; height:32px; object-fit:contain; }
      .iw-item-name { font-weight:500; }
      .iw-item-amount, .iw-item-owned { display:flex; flex-direction:column; align-items:flex-end; color:#fff; font-variant-numeric:tabular-nums; }
      .iw-item-amount small, .iw-item-owned small { color:#8fa1ad; font-size:10px; font-weight:400; text-transform:uppercase; }
      .iw-data-table { width:100%; }
      .iw-table-head, .iw-table-row { display:grid; grid-template-columns:minmax(0,1fr) 92px 104px; align-items:center; }
      .iw-table-head { min-height:32px; padding:0 10px; color:#8fa1ad; border-bottom:1px solid #294052; font-size:12px; font-weight:500; text-transform:uppercase; }
      .iw-table-head span:not(:first-child) { text-align:right; }
      .iw-table-row { min-height:37px; padding:2px 6px; border-bottom:1px solid #294052; box-sizing:border-box; font-size:16px; line-height:24px; }
      .iw-table-row:last-child { border-bottom:0; }
      [data-value-delta] { position:relative; }
      [data-value-delta]::before { content:''; position:absolute; right:calc(100% + 5px); top:2px; width:22px; height:22px; background:var(--value-icon, none) center/contain no-repeat; opacity:.82; filter:drop-shadow(0 0 4px rgba(196,225,235,.25)); pointer-events:none; animation:iw-value-delta-icon 6s ease-out both; }
      .iw-loot-table [data-value-delta]::before { display:none; }
      .iw-consumables [data-value-delta]::before { display:none; }
      [data-value-delta]::after { content:attr(data-value-delta); position:absolute; right:2px; top:-10px; z-index:4; color:#8af0ad; font-size:14px; font-weight:800; line-height:18px; letter-spacing:.01em; white-space:nowrap; text-shadow:0 0 5px rgba(76,224,133,.55),0 1px 2px rgba(0,0,0,.75); pointer-events:none; animation:iw-value-delta 4s cubic-bezier(.22,.72,.3,1) both; animation-delay:var(--iw-value-delta-delay,0ms); }
      [data-value-delta^="-"]::after { color:#ff9289; text-shadow:0 0 5px rgba(232,83,76,.5),0 1px 2px rgba(0,0,0,.75); }
      @keyframes iw-value-delta { 0% { opacity:0; transform:translateY(5px) scale(.92); } 5% { opacity:1; transform:translateY(0) scale(1); } 86% { opacity:1; transform:translateY(-5px) scale(1); } 100% { opacity:0; transform:translateY(-14px) scale(.98); } }
      @keyframes iw-value-delta-icon { 0% { opacity:0; transform:translateY(7px) scale(.8); } 8% { opacity:.82; transform:none; } 84% { opacity:.3; transform:translateY(-4px) scale(1); } 100% { opacity:.1; transform:translateY(-8px) scale(.9); } }
      .iw-loot-table .iw-table-row { position:relative; overflow:visible; }
      .iw-loot-table .iw-table-row.iw-rare-drop { border:1px solid rgba(211,164,61,.72); border-radius:4px; margin:2px 4px; background:linear-gradient(90deg,rgba(132,91,21,.14),rgba(255,213,92,.055),rgba(132,91,21,.14)); box-shadow:inset 0 0 10px rgba(255,204,82,.07),0 0 7px rgba(238,180,48,.12); }
      .iw-loot-table .iw-table-row.iw-rare-drop::before { content:''; position:absolute; inset:-1px; pointer-events:none; border:1px solid rgba(255,215,112,.28); border-radius:inherit; opacity:.45; animation:iw-drop-aura 2.8s ease-in-out infinite; }
      .iw-loot-table .iw-table-row.iw-rare-drop::after { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(108deg,transparent 35%,rgba(255,244,190,.2) 48%,transparent 61%); transform:translateX(-130%); animation:iw-drop-sheen 5.5s cubic-bezier(.2,.65,.3,1) infinite; }
      .iw-loot-table .iw-rare-drop .iw-table-item { color:#f4d991; }
      @keyframes iw-drop-sheen { 0%,62% { transform:translateX(-130%); } 78%,100% { transform:translateX(130%); } }
      @keyframes iw-drop-aura { 0%,100% { opacity:.3; box-shadow:0 0 3px rgba(238,180,48,.08); } 50% { opacity:.75; box-shadow:0 0 9px rgba(238,180,48,.22); } }
      @media (prefers-reduced-motion: reduce) { .iw-combat-card .iw-action-image, .iw-combat-card .iw-progress div, .iw-loot-table .iw-table-row.iw-rare-drop::before, .iw-loot-table .iw-table-row.iw-rare-drop::after, .iw-combat-live i, .iw-fighter, .iw-fighter-visual img, .iw-fighter.iw-hit .iw-fighter-visual::after, .iw-floating-heal, .iw-spawn-ring, .iw-fighter.iw-heal .iw-hp-track::before, .iw-hp-track, .iw-meter-ready .iw-hp-track, [data-value-delta]::before, [data-value-delta]::after { animation:none; } }
      .iw-table-item { display:flex; align-items:center; min-width:0; gap:8px; font-weight:400; }
      .iw-table-item > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .iw-table-number { color:#aab6bf; font-size:16px; font-weight:400; line-height:24px; text-align:right; font-variant-numeric:tabular-nums; }
      .iw-table-number.iw-zero { color:#71818d; }
      .iw-automations-card { grid-column:2; grid-row:2; align-self:start; }
      .iw-automation-table .iw-table-head, .iw-automation-table .iw-table-row { grid-template-columns:minmax(120px,1fr) minmax(150px,1.35fr) 90px 120px; }
      .iw-automation-table .iw-table-head span:nth-child(1), .iw-automation-table .iw-table-head span:nth-child(2) { text-align:left; }
      .iw-automation-table .iw-table-head span:nth-child(3), .iw-automation-table .iw-table-head span:nth-child(4) { text-align:right; }
      .iw-automation-label { display:flex; align-items:center; min-width:0; gap:7px; }
      .iw-automation-label img, .iw-automation-placeholder { width:32px; height:32px; flex:0 0 32px; object-fit:contain; }
      .iw-automation-label > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .iw-automation-value { min-width:0; overflow:hidden; color:#aab6bf; text-overflow:ellipsis; white-space:nowrap; }
      .iw-automation-value:nth-child(3) { text-align:right; font-variant-numeric:tabular-nums; }
      .iw-automation-value.iw-zero { color:#71818d; }
      .iw-empty, .iw-empty-loot { display:flex; flex-direction:column; align-items:center; gap:8px; padding:70px 20px; color:#aab6bf; text-align:center; }
      .iw-empty strong { color:#fff; font-size:20px; }
      .iw-activity-card { grid-column:auto; }
      .iw-small-button, .iw-icon-button, .iw-collect-button, .iw-status-row button { min-height:30px; padding:4px 11px; color:#dce7ec; background:#17364a; border:1px solid #315268; border-radius:4px; box-shadow:inset 0 1px rgba(255,255,255,.04); font:600 13px/1 inherit; cursor:pointer; transition:background .12s,border-color .12s,color .12s,transform .05s; }
      .iw-small-button:hover, .iw-icon-button:hover, .iw-collect-button:hover, .iw-status-row button:hover { color:#fff; background:#234a61; border-color:#578099; }
      .iw-small-button:active, .iw-icon-button:active, .iw-collect-button:active, .iw-status-row button:active { transform:translateY(1px); }
      .iw-small-button:disabled, .iw-collect-button:disabled { opacity:.55; cursor:default; }
      .iw-collect-button, .iw-status-row .iw-small-button { width:auto; min-width:0; height:25px; min-height:25px; padding:2px 8px; color:#fff; background:#53bd73; border:0; border-radius:4px; box-shadow:none; box-sizing:border-box; font-family:Jost,"Helvetica Neue",Arial,sans-serif; font-size:14px; font-weight:600; line-height:21px; letter-spacing:0; white-space:nowrap; }
      .iw-collect-button:hover, .iw-status-row .iw-small-button:hover { color:#fff; background:#53bd73; border:0; }
      .iw-collect-button:disabled, .iw-status-row .iw-small-button:disabled { color:#9aa9b2; background:#263e4d; border-color:#405969; box-shadow:none; }
      .iw-icon-button { display:grid; place-items:center; width:25px; min-width:25px; height:25px; min-height:25px; padding:0; font-size:16px; line-height:1; }
      .iw-preferences-button svg { display:block; width:16px; height:16px; fill:none; stroke:#b8c5ce; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      .iw-status-row { display:grid; grid-template-columns:40px minmax(0,1fr) 100px; align-items:center; min-height:48px; padding:2px 10px; border-bottom:1px solid #294052; box-sizing:border-box; }
      .iw-status-row > img { width:32px; height:32px; object-fit:contain; }
      .iw-status-row > span { display:flex; flex-direction:column; min-width:0; line-height:1.25; }
      .iw-status-row b { font-size:16px; font-weight:400; line-height:24px; }
      .iw-status-row small { overflow:hidden; color:#aab6bf; font-size:14px; line-height:20px; text-overflow:ellipsis; white-space:nowrap; }
      .iw-status-row em { justify-self:end; color:#aab6bf; font-size:16px; font-style:normal; line-height:24px; text-align:right; }
      .iw-status-row em.complete { color:#45d88a; }
      .iw-status-row em.active { color:#7bc4ee; }
      .iw-status-row .iw-small-button { grid-column:3; align-self:center; justify-self:end; margin:0; }
      .iw-task-icon { position:relative; display:block; grid-column:3; align-self:center; justify-self:end; width:25px; height:25px; margin:0; padding:0; border:1px solid; border-radius:4px; box-sizing:border-box; font-size:17px; font-weight:600; line-height:1; }
      .iw-task-icon.running { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-task-icon.done { color:#78efa9; background:rgba(56,221,137,.08); border-color:#38dd89; box-shadow:inset 0 0 0 1px rgba(195,255,217,.04),0 0 7px rgba(42,220,130,.16); }
      .iw-task-icon.adventure-idle { display:grid; place-items:center; color:#78efa9; background:rgba(56,221,137,.08); border-color:#38dd89; box-shadow:inset 0 0 0 1px rgba(195,255,217,.04),0 0 7px rgba(42,220,130,.16); }
      .iw-idle-glyph { display:block; font-size:13px; font-weight:500; line-height:1; transform:translate(-1px,1px); }
      .iw-idle-glyph sup { position:relative; top:-4px; margin-left:1px; font-size:10px; }
      .iw-task-icon.participating { color:#79d1f5; background:rgba(68,171,221,.08); border-color:#4fb7e5; box-shadow:inset 0 0 0 1px rgba(198,239,255,.04),0 0 7px rgba(79,183,229,.18); }
      .iw-task-icon.waiting { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-task-icon .iw-spin, .iw-task-icon.done svg, .iw-task-icon.waiting svg, .iw-task-icon.participating svg { position:absolute; top:50%; left:50%; display:block; width:15px; height:15px; margin:-7.5px 0 0 -7.5px; }
      .iw-task-icon.done svg, .iw-task-icon.waiting svg, .iw-task-icon.participating svg { fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      .iw-hourglass { transform-origin:50% 50%; animation:iw-hourglass 2.4s ease-in-out infinite; }
      @keyframes iw-hourglass { 0%,38% { transform:rotate(0deg); } 52%,88% { transform:rotate(180deg); } 100% { transform:rotate(360deg); } }
      .iw-status-link { cursor:pointer; transition:background-color .12s; }
      .iw-status-link:hover, .iw-status-link:focus-visible { background:#142c3e; outline:none; }
      .iw-potion-grid { display:grid; grid-template-columns:1fr; }
      .iw-potion-grid > div { display:grid; grid-template-columns:32px 1fr auto 68px; align-items:center; min-height:38px; padding:0 9px; border-bottom:1px solid #263a49; }
      .iw-potion-grid img { width:26px; height:26px; object-fit:contain; }
      .iw-potion-grid em { color:#31c777; font-size:11px; font-style:normal; text-align:right; }
      .iw-quest-help { padding:8px 10px; color:#aab6bf; font-size:12px; }
      .iw-quest-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .iw-quest-grid label { display:grid; grid-template-columns:22px 30px 1fr auto; align-items:center; min-height:42px; padding:0 9px; border-top:1px solid #263a49; cursor:pointer; }
      .iw-quest-grid label.done { opacity:.65; }
      .iw-quest-grid img { width:25px; height:25px; object-fit:contain; }
      .iw-quest-grid span small { display:block; color:#aab6bf; }
      .iw-quest-grid b { color:#aab6bf; font-size:12px; }
      .iw-modal-section-title { padding:10px; border-top:1px solid #294052; border-bottom:1px solid #294052; font-size:16px; font-weight:600; }
      .iw-automation-toggle { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:12px 14px; cursor:pointer; }
      .iw-automation-toggle span { min-width:0; }
      .iw-automation-toggle b, .iw-automation-toggle small { display:block; }
      .iw-automation-toggle small { margin-top:2px; color:#aab6bf; font-size:12px; }
      .iw-automation-toggle input { position:absolute; opacity:0; pointer-events:none; }
      .iw-automation-toggle i { position:relative; flex:0 0 42px; width:42px; height:22px; background:#304454; border:1px solid #587083; border-radius:999px; transition:.16s ease; }
      .iw-automation-toggle i::after { content:''; position:absolute; top:3px; left:3px; width:14px; height:14px; background:#b6c2ca; border-radius:50%; transition:.16s ease; }
      .iw-automation-toggle input:checked + i { background:#12623f; border-color:#25d67f; box-shadow:0 0 8px rgba(37,214,127,.25); }
      .iw-automation-toggle input:checked + i::after { left:23px; background:#76f4ad; }
      .iw-challenge-config { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:10px; }
      .iw-challenge-config label { display:flex; flex-direction:column; gap:5px; color:#aab6bf; font-size:13px; }
      .iw-challenge-config select { min-height:34px; padding:4px 8px; color:#fff; background:#102b3f; border:1px solid #315268; border-radius:4px; font:inherit; }
      .iw-challenge-config small { grid-column:1/-1; color:#aab6bf; font-size:12px; }
      .iw-interface-actions { display:flex; align-items:center; gap:10px; padding:10px; }
      .iw-interface-actions small { color:#aab6bf; font-size:12px; }
      modal-component .buttons.iw-craft-buttons { display:grid !important; grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:12px !important; margin-top:12px !important; }
      modal-component .buttons.iw-craft-buttons > button { width:100% !important; min-width:0 !important; margin:0 !important; white-space:nowrap; }
      modal-component .buttons.iw-craft-buttons > button:first-child { order:1; }
      modal-component .buttons.iw-craft-buttons > .iw-craft-all { order:2; }
      modal-component .buttons.iw-craft-buttons > button:nth-child(2):not(.iw-craft-all) { order:3; }
      .iw-sync-frame { position:fixed; width:1600px; height:900px; left:-10000px; border:0; opacity:0; pointer-events:none; }
      .iw-modal { position:fixed; inset:0; z-index:2147483646; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.7); }
      .iw-modal-hidden { display:none; }
      .iw-modal-panel { width:min(900px,100%); max-height:85vh; overflow:auto; color:#fff; background:#071d2e; border:1px solid #425563; border-radius:5px; box-shadow:0 18px 60px rgba(0,0,0,.5); }
      .iw-modal-close { color:#fff; background:transparent; border:0; font-size:24px; cursor:pointer; }
      .iw-modal-panel footer { display:flex; align-items:center; justify-content:space-between; padding:10px; border-top:1px solid #263a49; }
      @media (max-width:700px) {
        .iw-stats-grid { grid-template-columns:1fr; }
        .iw-potion-card, .iw-automations-card { grid-column:auto; grid-row:auto; overflow-x:auto; }
        .iw-automation-table { min-width:430px; }
        .iw-table-head, .iw-table-row { grid-template-columns:minmax(0,1fr) 72px 78px; }
        .iw-loot-row { grid-template-columns:38px 1fr auto; padding:6px 0; }
        .iw-item-amount { grid-column:2; font-size:13px; }
        .iw-item-worth { grid-column:3; grid-row:1/3; }
        .iw-summary span { display:none; }
        .iw-potion-grid, .iw-quest-grid { grid-template-columns:1fr; }
        .iw-challenge-config { grid-template-columns:1fr; }
        .iw-challenge-config small { grid-column:1; }
        .iw-status-row { grid-template-columns:40px minmax(0,1fr) auto; }
        .iw-action-body { grid-template-columns:40px minmax(0,1fr); }
        .iw-queue-summary { grid-column:2; align-items:flex-start; min-width:0; margin-left:0; padding-right:0; border-left:0; }
      }
    `;
    document.head.appendChild(style);
  }

  function initialise() {
    if (location.pathname === LEGACY_STATS_PATH) history.replaceState({ iwStatus: true }, '', STATS_PATH);
    addStyles();
    createPage();
    installNavButton();
    installInterfaceControls();
    document.addEventListener('change', (event) => {
      if (event.target.matches?.('[data-super-potions-toggle]')) {
        localStorage.setItem(SUPER_POTIONS_KEY, event.target.checked ? 'true' : 'false');
        lastSignature = '';
        render();
        return;
      }
      if (event.target.matches?.('[data-automation-toggle]')) {
        setAutomationEnabled(event.target.checked);
        automationTask = '';
        render();
        return;
      }
      if (event.target.matches?.('[data-cache-lookups-toggle]')) {
        setCacheLookupsEnabled(event.target.checked);
        render();
        if (event.target.checked) syncStale(false);
        return;
      }
      if (event.target.matches?.('[data-challenge-region]')) {
        setChallengePrefs({ region: event.target.value, skill: 'Defense' });
        render();
        return;
      }
      if (event.target.matches?.('[data-challenge-skill]')) {
        setChallengePrefs({ ...getChallengePrefs(), skill: event.target.value });
        render();
        return;
      }
      const quest = event.target.closest?.('[data-quest]');
      if (quest) {
        let prefs = getPrefs().filter((preference) => preference !== quest.dataset.quest && !preference.endsWith(quest.dataset.quest));
        if (quest.checked && prefs.length < 5) prefs.push(quest.dataset.quest);
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        lastSignature = '';
        if (prefs.length === 5) {
          const normalized = [...document.querySelectorAll('[data-quest]:checked')].map((input) => input.dataset.quest).slice(0, 5);
          localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
          syncStale(false);
        }
        return;
      }
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-quest-modal]')) { questModalOpen = true; lastSignature = ''; render(); return; }
      if (event.target.closest?.('[data-modal-close]') || event.target.matches?.('[data-modal-backdrop]')) { questModalOpen = false; lastSignature = ''; render(); return; }
      if (event.target.closest?.('[data-sync]')) { syncStale(true); return; }
      if (event.target.closest?.('[data-open-multiplayer]')) {
        const multiplayer = document.getElementById(MULTIPLAYER_ID);
        (multiplayer?.querySelector('.action') || multiplayer)?.click();
        return;
      }
      const craftAll = event.target.closest?.('[data-craft-all]');
      if (craftAll) {
        const modal = craftAll.closest('modal-component .modal');
        const craftableRow = [...(modal?.querySelectorAll(':scope > .row') || [])]
          .find((row) => clean(row.querySelector(':scope > span')?.textContent) === 'Craftable');
        const input = modal?.querySelector('form.actions input[name="quantity"], form.actions input[placeholder="Quantity"]');
        const nativeCraft = [...(modal?.querySelectorAll('form.actions > .buttons > button') || [])]
          .find((button) => clean(button.textContent) === 'Craft' && !button.matches('[data-craft-all]'));
        const amount = numberFrom(clean(craftableRow?.textContent).replace('Craftable', ''));
        if (!input || !nativeCraft || amount <= 0) return;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (valueSetter) valueSetter.call(input, String(amount));
        else input.value = String(amount);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        requestAnimationFrame(() => nativeCraft.disabled || nativeCraft.click());
        return;
      }
      if (event.target.closest?.('[data-collect-loot]')) { collectLootAndContinue(); return; }
      const automationClaim = event.target.closest?.('[data-collect-automations]');
      if (automationClaim) {
        event.stopPropagation();
        collectAllAutomationLoot();
        return;
      }
      if (event.target.closest?.('[data-collect-attunement]')) { event.stopPropagation(); collectAllAttunementLoot(); return; }
      if (event.target.closest?.('[data-collect-taming]')) { event.stopPropagation(); collectTamingLoot(); return; }
      if (event.target.closest?.('[data-run-challenge]')) { event.stopPropagation(); automateChallenge(); return; }
      const launch = event.target.closest?.('[data-route]');
      if (!launch || !page?.contains(launch)) return;
      location.href = launch.dataset.route;
    });
    document.addEventListener('keydown', (event) => {
      if (event.target.closest?.('button')) return;
      const launch = event.target.closest?.('.iw-status-link[data-route]');
      if (!launch || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      launch.click();
    });
    document.addEventListener('click', (event) => {
      if (!page || page.hidden || event.target.closest(`#${NAV_ID}`)) return;
      if (event.target.closest('nav-component button')) leaveStats();
    }, true);
    window.addEventListener('popstate', () => location.pathname === STATS_PATH ? showStats({ push: false }) : hideStats());
    new MutationObserver(() => { installNavButton(); installInterfaceControls(); createPage(); captureVisibleCaches(); })
      .observe(document.body, { childList: true, subtree: true });
    if (location.pathname === STATS_PATH) showStatusFromCurrentAction();
    setTimeout(() => syncStale(false), 1200);
    setTimeout(captureVisibleCaches, 1500);
    window.setInterval(render, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
