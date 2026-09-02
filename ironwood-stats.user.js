// ==UserScript==
// @name         Ironwood RPG - Status Page
// @namespace    https://github.com/pverbeek/IRONWOOD_stats
// @version      1.0.1
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
  const STYLE_ID = 'iw-stats-style';
  const STATS_PATH = '/status';
  const LEGACY_STATS_PATH = '/stats';
  let page, navButton;
  let previousUrl = '/';
  let hiddenRouteElements = [];
  let lastSignature = '';
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
  let tamingClaimNoticeUntil = 0;

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
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
    const total = Math.ceil(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [hours && `${hours}h`, minutes && `${minutes}m`, `${secs}s`].filter(Boolean).join(' ');
  }

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
    const card = document.querySelector('skill-page action-component > .card');
    if (!card) return null;
    const fill = card.querySelector(':scope > .bars .fill');
    // Ironwood keeps the selected action card mounted while idle. The live
    // progress bars only exist after an action has actually been started.
    if (!fill) return null;
    const match = location.pathname.match(/\/skill\/(\d+)\/action\/(\d+)/)
      || previousUrl.match(/\/skill\/(\d+)\/action\/(\d+)/);
    const locationButton = [...document.querySelectorAll('skill-page button.filter')]
      .find((button) => button.disabled && /^(Village|Outskirts)$/.test(clean(button.textContent)));
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
    return {
      name: clean(card.querySelector(':scope > .header > .name')?.textContent) || 'Current action',
      level: clean(card.querySelector(':scope > .header > .level')?.textContent),
      image: card.querySelector(':scope > .body img')?.src || '',
      progress: fill ? Math.max(0, Math.min(100, parseFloat(fill.style.width) || 0)) : null,
      actionId: match?.[2] || '',
      location: clean(locationButton?.textContent) || 'Unknown',
      skillName,
      skillLevel,
      skillProgress: Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent)) : null,
      levelRemaining: Number.isFinite(progressPercent) ? Math.max(0, 100 - progressPercent) : null,
      xpPerHour: xpPerHour || null
    };
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

  function readFinishedEstimate() {
    const label = [...document.querySelectorAll('skill-page .row > .name')]
      .find((element) => clean(element.textContent) === 'Finished');
    const row = label?.closest('.row');
    if (!row) return '';
    const value = [...row.children].map((child) => clean(child.textContent))
      .filter((part) => part && part !== 'Finished').join(' ');
    return /NaN|Infinity/i.test(value) ? '' : value;
  }

  const dayKey = () => new Date().toLocaleDateString('en-CA');

  const CACHE_KEY = 'iw-stats-cache-v1';
  const PREFS_KEY = 'iw-stats-quest-prefs';
  const EQUIPPED_KEY = 'iw-stats-equipped-divine';
  const CHALLENGE_PREFS_KEY = 'iw-stats-challenge-prefs';
  const AUTOMATION_KEY = 'iw-stats-automation-enabled';
  const CACHE_LOOKUPS_KEY = 'iw-stats-cache-lookups-enabled';
  const CHALLENGE_SKILLS = {
    Forest: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'],
    Mountain: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'],
    Ocean: ['Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed', 'Defense']
  };
  const TTL = { quests: 26 * 3600000, inventory: 3600000, equipped: 3600000, adventure: 4 * 3600000, challenges: 3600000, taming: 3600000, automations: 24 * 3600000, attunement: 3600000, guildEvent: 6 * 3600000, guildTrial: 6 * 3600000 };
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
    const incompleteAdventure = key === 'adventure' && entry && (entry.schema !== 7 || [
      entry.researchPoints, entry.mapCost, entry.dailyMapsCreated,
      entry.dailyMapsLimit, entry.mapsStored, entry.mapStorageLimit
    ].some((value) => typeof value !== 'number' || !Number.isFinite(value)));
    const incompleteGuildEvent = key === 'guildEvent' && entry?.schema !== 3;
    const incompleteQuests = key === 'quests' && (entry?.schema !== 2 || (getPrefs().length === 5 && entry?.day === dayKey() && !entry.dailyComplete));
    const incompleteAttunement = key === 'attunement' && entry?.schema !== 3;
    const incompleteChallenges = key === 'challenges' && entry?.schema !== 2;
    const incompleteTaming = key === 'taming' && entry?.schema !== 2;
    const incompleteAutomations = key === 'automations' && entry?.schema !== 3;
    return !entry || incompleteAdventure || incompleteGuildEvent || incompleteQuests || incompleteAttunement || incompleteChallenges || incompleteTaming || incompleteAutomations || (key === 'inventory' && !Array.isArray(entry.allItems)) || (entry.expiresAt ? Date.now() >= entry.expiresAt : Date.now() - entry.checkedAt > TTL[key]) || (key === 'quests' && entry.day !== dayKey());
  }
  function humanAge(time) {
    if (!time) return 'Never checked';
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'Just checked' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  }
  function projectedAutomation(item, checkedAt) {
    if (!item?.intervalMs || !checkedAt || item.queuedDone >= item.queuedTotal) return item;
    const elapsedActions = Math.floor(Math.max(0, Date.now() - checkedAt) / item.intervalMs);
    const additional = Math.min(Math.max(0, item.queuedTotal - item.queuedDone), elapsedActions);
    return {
      ...item,
      queuedDone: item.queuedDone + additional,
      lootAmount: Math.round(item.lootAmount + additional * (item.outputPerAction || 0))
    };
  }
  function guildEventDetail(entry) {
    if (!entry) return 'Never checked';
    const remaining = Number(entry.expiresAt) - Date.now();
    const countdown = () => {
      const total = Math.max(0, Math.ceil(remaining / 1000));
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`].filter(Boolean).join(' ');
    };
    if (remaining > 0 && entry.state === 'Cooldown') return `Ready in ${countdown()}`;
    if (remaining > 0 && entry.state === 'Active') return `${entry.eventName || 'Guild event'} · ${countdown()} remaining`;
    if (entry.state === 'Available') return 'Ready to start';
    return entry.stateDetail || humanAge(entry.checkedAt);
  }
  function titleFromSlug(slug) {
    return slug.replace(/^potion-divine-/, '').split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
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
      return key ? { key, amount: parseCompact(amountText), amountText, image: src } : null;
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
    setCache('quests', { schema: 2, day: dayKey(), quests, completed, dailyComplete: completed >= 5 });
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
    setCache('quests', { schema: 2, day: dayKey(), quests: state.quests, completed, selectedDone, dailyComplete: completed >= 5 });
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
    const stateText = clean(adventureRow?.querySelector('.event-icon, .amount')?.textContent) || 'Unknown';
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
    const active = !/^(Idle|Cooldown|Unknown)/i.test(stateText);
    const cooldown = /Cooldown/i.test(stateText);
    const resetText = cooldown ? (values['Weekly Limit Reset'] || values['Daily Limit Reset']) : '';
    const countdown = durationMs(active ? stateText : resetText);
    const pair = (text) => {
      const match = clean(text).match(/([\d,.]+\s*[KMB]?)\s*\/\s*([\d,.]+\s*[KMB]?)/i);
      if (!match) return { current: null, max: null };
      return { current: parseCompact(match[1]), max: parseCompact(match[2]) };
    };
    const research = pair(researchRow?.querySelector('.amount')?.textContent);
    const dailyMaps = pair(values['Daily Map Limit']);
    const storage = pair(storageRow?.querySelector('.amount')?.textContent);
    const dailyResetMs = durationMs(values['Daily Limit Reset']);
    const expiresIn = countdown || (dailyMaps.max && dailyMaps.current >= dailyMaps.max && dailyResetMs) || TTL.adventure;
    const data = {
      schema: 7,
      state: active ? 'Active' : cooldown ? 'Cooldown' : stateText,
      stateDetail: active ? stateText : cooldown ? `Ready in ${resetText}` : 'No adventure running',
      dailyLimit: values['Daily Map Limit'] || '', weeklyLimit: values['Weekly Adventure Limit'] || '',
      dailyReset: values['Daily Limit Reset'] || '', weeklyReset: values['Weekly Limit Reset'] || '',
      researchPoints: research.current, mapCost: research.max,
      dailyMapsCreated: dailyMaps.current, dailyMapsLimit: dailyMaps.max,
      mapsStored: storage.current, mapStorageLimit: storage.max,
      mapsComplete: dailyMaps.max > 0 && dailyMaps.current >= dailyMaps.max,
      mapAutomation: getCache().adventure?.mapAutomation || null,
      expiresAt: Date.now() + expiresIn
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
        intervalMs: baseIntervalMs ? baseIntervalMs / (1 + Math.max(0, speedBonus)) : 0
      });
    }
    structures.forEach((item) => {
      item.outputPerAction = item.queuedDone > 0 ? item.lootAmount / item.queuedDone : 0;
    });
    const longestRemaining = Math.max(0, ...structures.map((item) =>
      Math.max(0, item.queuedTotal - item.queuedDone) * item.intervalMs
    ));
    const data = { schema: 3, structures, expiresAt: Date.now() + (longestRemaining || TTL.automations) };
    setCache('automations', data);
    return data;
  }

  async function refreshAutomationsSnapshot(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (refreshingAutomations || (!force && !isStale('automations'))) return;
    refreshingAutomations = true;
    try {
      await withPage('/', 'app-component', async (doc) => {
        const navStarted = Date.now();
        let houseButton = null;
        while (Date.now() - navStarted < 10000 && !houseButton) {
          houseButton = [...doc.querySelectorAll('nav-component button')]
            .find((button) => clean(button.textContent) === 'House');
          if (!houseButton) await wait(100);
        }
        if (!houseButton) throw new Error('Could not open the House page');
        houseButton.click();
        await waitFor(doc, 'home-page', 10000);
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('home-page .card > .header > .name')]
          .some((element) => clean(element.textContent) === 'Structures')) await wait(100);
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
      schema: 2,
      scrollsAvailable: scrolls.current,
      scrollsRequired: scrolls.max,
      autoCompletesUsed: autoCompletes.current,
      autoCompletesLimit: autoCompletes.max,
      autoCompletesRemaining: Number.isFinite(autoCompletes.current) && Number.isFinite(autoCompletes.max)
        ? Math.max(0, autoCompletes.max - autoCompletes.current) : 0,
      dailyScrollsUsed: dailyScrolls.current,
      dailyScrollsLimit: dailyScrolls.max,
      selectedRegion,
      selectedChallenge
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
    const eventsCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Events');
    const eventName = clean(eventsCard?.querySelector(':scope > .row.row-active .name')?.textContent) || 'Guild Event';
    const rows = [...root.querySelectorAll('.row')];
    const cooldownRow = rows.find((row) => clean(row.querySelector('.name')?.textContent) === 'Event Cooldown');
    const endRow = rows.find((row) => /Event (Ends|Remaining)|End Date/i.test(clean(row.querySelector('.name')?.textContent)));
    const rowValue = (row) => {
      if (!row) return '';
      const label = clean(row.querySelector('.name')?.textContent);
      const explicit = clean(row.querySelector('.date, .time, .amount')?.textContent);
      return explicit || clean(row.textContent).replace(label, '').trim();
    };
    const cooldownText = rowValue(cooldownRow);
    const remainingText = rowValue(endRow);
    const cooldown = Boolean(cooldownRow && cooldownText);
    const active = !cooldown && Boolean(endRow || /Participating|Participation|Event Progress/i.test(clean(root.textContent)));
    const timerText = cooldown ? cooldownText : remainingText;
    const fallback = active ? 36 * 3600000 : cooldown ? 24 * 3600000 : TTL.guildEvent;
    const timer = durationMs(timerText) || fallback;
    const readableTimer = durationMs(timerText) ? formatDuration(durationMs(timerText) / 1000) : timerText;
    setCache('guildEvent', {
      schema: 3,
      state: active ? 'Active' : cooldown ? 'Cooldown' : 'Available', eventName,
      stateDetail: active ? `${eventName} · ${readableTimer || 'In progress'}` : cooldown ? `Ready in ${readableTimer}` : 'Ready to start',
      remaining: timerText, expiresAt: Date.now() + timer
    });
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
    const endText = endRow ? clean(endRow.textContent).replace('End Date', '').trim() : '';
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
    setCache('guildTrial', { state, stateDetail: detail, available: joinableRows.length, expiresAt: timer ? Date.now() + timer : Date.now() + TTL.guildTrial });
  }
  async function syncStale(force = false) {
    if (!cacheLookupsEnabled()) return;
    if (syncing) return;
    syncing = true;
    try {
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
      if (force || isStale('challenges')) await withPage('/challenges', 'challenges-page', async (doc) => {
        const started = Date.now();
        while (Date.now() - started < 6000 && ![...doc.querySelectorAll('challenges-page .row .name')]
          .some((element) => clean(element.textContent) === 'Challenge Scroll')) await wait(100);
        collectChallenges(doc);
      });
      if (force || isStale('taming')) await withPage('/skill/15', 'taming-page', collectTaming);
      if (force || isStale('automations')) await refreshAutomationsSnapshot(force);
      if (force || isStale('attunement')) await withPage('/attunement', 'attunement-page', collectAttunement);
      if (force || isStale('guildEvent')) await withPage('/guild', 'guild-page', async (doc) => {
        const menuStarted = Date.now();
        let button = null;
        while (Date.now() - menuStarted < 8000 && !button) {
          button = [...doc.querySelectorAll('guild-page button')].find((el) => clean(el.textContent) === 'Events');
          if (!button) await wait(200);
        }
        button?.click();
        await wait(2500);
        collectGuildEvent(doc);
      });
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

  function updateLiveValues(action, loot, consumables) {
    if (!page) return;
    const text = (selector, value) => { const element = page.querySelector(selector); if (element && element.textContent !== String(value)) element.textContent = value; };
    if (action) {
      const actionFill = page.querySelector('[data-live-progress]');
      if (actionFill) actionFill.style.width = `${action.progress ?? 0}%`;
      const skillFill = page.querySelector('[data-live-skill-progress]');
      if (skillFill) skillFill.style.width = `${action.skillProgress ?? 0}%`;
      text('[data-live-level-remaining]', Number.isFinite(action.levelRemaining) ? `${action.levelRemaining}% remaining` : '—');
      text('[data-live-xp-hour]', action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—');
    }
    text('[data-live-loot-total]', `${formatNumber(loot.reduce((sum, item) => sum + item.amount, 0))} items waiting`);
    loot.forEach((item, index) => text(`[data-live-loot="${index}"]`, formatNumber(item.amount)));
    consumables.forEach((item, index) => {
      text(`[data-live-consumable-amount="${index}"]`, item.amount);
    });
    const automationCache = getCache().automations;
    (automationCache?.structures || []).forEach((item, index) => {
      const projected = projectedAutomation(item, automationCache.checkedAt);
      text(`[data-live-automation-loot="${index}"]`, projected.lootAmount ? formatNumber(projected.lootAmount) : '0');
      text(`[data-live-automation-queue="${index}"]`, projected.queuedTotal ? formatNumber(Math.max(0, projected.queuedTotal - projected.queuedDone)) : '0');
    });
    text('[data-live-guild-event-detail]', guildEventDetail(getCache().guildEvent));
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
    const loot = readLoot().sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const consumables = readConsumables();
    const finished = readFinishedEstimate();
    const cache = getCache();
    const prefs = getPrefs();
    const automationOn = automationEnabled();
    const cacheLookupsOn = cacheLookupsEnabled();
    const automationRows = (cache.automations?.structures || [])
      .map((item) => projectedAutomation(item, cache.automations?.checkedAt));
    const questSkills = [...new Map((cache.quests?.quests || [])
      .filter((quest) => quest.skill)
      .map((quest) => [quest.skill, { name: quest.skill, image: skillIcon(quest.skill), done: quest.done }])).values()];
    const challengePrefs = getChallengePrefs();
    const dailyQuestComplete = (cache.quests?.completed || 0) >= 5 || cache.quests?.dailyComplete === true;
    const adventureStatus = cache.adventure?.state === 'Active' ? 'Active' : cache.adventure?.mapsComplete ? 'Complete' : cache.adventure?.state || 'Unknown';
    const taskIndicator = (task, complete, fallback, fallbackClass = '') => automationTask === task
      ? '<span class="iw-task-icon running" title="Automation running" aria-label="Automation running"><svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg></span>'
      : complete
        ? '<span class="iw-task-icon done" title="Complete" aria-label="Complete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4 4L19 6.5"></path></svg></span>'
        : `<em class="${fallbackClass}">${escapeHtml(fallback)}</em>`;
    const guildEventIndicator = cache.guildEvent?.state === 'Cooldown'
      ? '<span class="iw-task-icon waiting" title="Guild event cooldown" aria-label="Guild event cooldown"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5"></path></svg></span>'
      : `<em class="${cache.guildEvent?.state === 'Active' ? 'active' : cache.guildEvent?.state === 'Available' ? 'complete' : ''}">${escapeHtml(cache.guildEvent?.state || 'Unknown')}</em>`;
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
    const adventureDetails = [
      cache.adventure?.stateDetail || humanAge(cache.adventure?.checkedAt),
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
    const canonicalPotionOrder = new Map(canonicalDivinePotions.map(([key], index) => [key, index]));
    const divinePotions = [...potionMap.values()].sort((a, b) => {
      const equippedOrder = Number(Boolean(b.equipped)) - Number(Boolean(a.equipped));
      if (equippedOrder) return equippedOrder;
      const canonicalOrder = (canonicalPotionOrder.get(a.key) ?? 99) - (canonicalPotionOrder.get(b.key) ?? 99);
      if (canonicalOrder) return canonicalOrder;
      return a.name.localeCompare(b.name);
    });
    const inventoryCounts = new Map((Array.isArray(cache.inventory?.allItems) ? cache.inventory.allItems : [])
      .filter((item) => item?.key).map((item) => [item.key, item]));
    const totalItems = loot.reduce((sum, item) => sum + item.amount, 0);
    const signature = JSON.stringify({
      action: action && { name: action.name, level: action.level, image: action.image, actionId: action.actionId, location: action.location, skillName: action.skillName, skillLevel: action.skillLevel },
      loot: loot.map((item) => ({ name: item.name, image: item.image })),
      consumables: consumables.map((item) => ({ name: item.name, image: item.image })),
      finished, cache, prefs, challengePrefs, automationOn, cacheLookupsOn, questModalOpen, automationTask, tamingClaimNoticeUntil
    });
    if (signature === lastSignature) { updateLiveValues(action, loot, consumables); return; }
    lastSignature = signature;

    page.innerHTML = `<div class="iw-stats-grid">
        ${action ? `
        <section class="iw-card iw-action-card">
          <div class="iw-card-header"><span>Current Action</span><span class="iw-action-badges">
            <span class="iw-location-badge ${action.location === 'Outskirts' ? 'outskirts' : 'village'}" title="${escapeHtml(action.location)}" aria-label="${escapeHtml(action.location)}">${action.location === 'Outskirts' ? '<img src="/assets/misc/combat.png" alt="">' : '<img src="/assets/misc/woodcutting.png" alt="">'}</span>
            <span class="iw-active-badge" title="Action active" aria-label="Action active"><svg class="iw-spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="iw-spin-track" cx="12" cy="12" r="8"></circle><g class="iw-spin-motion"><path d="M12 4a8 8 0 0 1 7.2 4.5"></path><path d="M19.2 5.7v2.8h-2.8"></path><path d="M12 20a8 8 0 0 1-7.2-4.5"></path><path d="M4.8 18.3v-2.8h2.8"></path></g></svg></span>
          </span></div>
          <div class="iw-action-body">
            <div class="iw-action-image">${action.image ? `<img src="${escapeHtml(action.image)}" alt="">` : ''}</div>
            <div class="iw-action-name"><span class="iw-action-title"><strong>${escapeHtml(action.name)}</strong>${action.level ? `<small>(${escapeHtml(action.level.replace(/^Lv\.\s*/i, 'lvl '))})</small>` : ''}</span><span class="iw-action-meta">${action.skillName || action.skillLevel ? `<span>${escapeHtml([action.skillName, action.skillLevel].filter(Boolean).join(' '))}</span>` : ''}<span data-live-xp-hour>${action.xpPerHour ? `${formatCompact(action.xpPerHour)} XP/h` : '—'}</span><span data-live-level-remaining>${Number.isFinite(action.levelRemaining) ? `${action.levelRemaining}% remaining` : '—'}</span></span></div>
          </div>
          <div class="iw-progress-stack">
            <div class="iw-progress iw-action-progress" title="Current action progress"><div data-live-progress style="width:${action.progress ?? 0}%"></div></div>
            <div class="iw-progress iw-skill-progress" title="${escapeHtml(action.skillName || 'Skill')} level progress"><div data-live-skill-progress style="width:${action.skillProgress ?? 0}%"></div></div>
          </div>
          ${finished ? `<div class="iw-finished"><span>Queue finishes in</span><strong>${escapeHtml(finished)}</strong></div>` : ''}
          <div class="iw-subheader">Consumables</div>
          <div class="iw-consumables">${consumables.length ? consumables.map((item, index) => `<div class="iw-consumable"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b data-live-consumable-amount="${index}">${escapeHtml(item.amount)}</b></div>`).join('') : '<div class="iw-muted">No consumables equipped.</div>'}</div>
        </section>` : `
        <section class="iw-card iw-empty iw-action-card"><strong>No action in progress</strong><span>Start an action and its live stats will appear here.</span></section>`}
        <section class="iw-card iw-loot-card">
          <div class="iw-card-header"><span>Current Loot</span><div class="iw-summary"><span data-live-loot-total>${formatNumber(totalItems)} items waiting</span>${action && loot.length ? `<button class="iw-collect-button" data-collect-loot ${automationOn ? '' : 'disabled'} title="${automationOn ? 'Claim loot and continue' : 'Automation is disabled'}">Claim</button>` : ''}</div></div>
          ${loot.length ? `<div class="iw-data-table iw-loot-table">
            <div class="iw-table-head"><span>Item</span><span>Loot</span><span>Inventory</span></div>${loot.map((item) => `
            <div class="iw-table-row">
              <div class="iw-table-item"><span class="iw-item-image">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : ''}</span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number" data-live-loot="${loot.indexOf(item)}">${formatNumber(item.amount)}</div>
              <div class="iw-table-number ${inventoryCounts.get(item.image.split('/').pop()?.split('?')[0])?.amount ? '' : 'iw-zero'}">${escapeHtml(inventoryCounts.get(item.image.split('/').pop()?.split('?')[0])?.amountText || '0')}</div>
            </div>`).join('')}</div>` : '<div class="iw-empty-loot">No loot waiting to be collected.</div>'}
        </section>
        <section class="iw-card iw-activity-card">
          <div class="iw-card-header"><span>Status</span><button class="iw-icon-button iw-preferences-button" data-quest-modal title="Configure daily quests" aria-label="Configure daily quests"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"></path><circle cx="11" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="8" cy="18" r="2"></circle></svg></button></div>
          <div class="iw-status-list">
            <div class="iw-status-row iw-status-link" data-route="/challenges" role="link" tabindex="0"><img src="/assets/items/challenge-scroll.png"><span><b>Challenges</b><small>${escapeHtml(challengeDetails)}</small></span>${challengeIndicator}</div>
            <div class="iw-status-row"><img src="/assets/misc/quests.png"><span><b>Daily quests</b><small>${Math.min(cache.quests?.completed || 0, 5)} / 5 completed today${prefs.length === 5 ? ' · next selection ready' : ` · ${prefs.length}/5 selected for next run`}</small></span>${taskIndicator('quests', dailyQuestComplete, 'Pending')}</div>
            <div class="iw-status-row iw-status-link" data-route="/adventure" role="link" tabindex="0"><img src="/assets/misc/adventure.png"><span><b>Adventure</b><small>${escapeHtml(adventureDetails)}</small></span>${taskIndicator('maps', adventureStatus === 'Complete', adventureStatus, adventureStatus === 'Active' ? 'active' : '')}</div>
            <div class="iw-status-row iw-status-link" data-route="/skill/15" role="link" tabindex="0"><img src="/assets/items/pet-snacks.png"><span><b>Taming</b><small>${escapeHtml(tamingDetails)}</small></span>${tamingIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/attunement" role="link" tabindex="0"><img src="/assets/misc/attunement.png"><span><b>Attunement</b><small>${escapeHtml(attunementDetails)}</small></span><button class="iw-small-button" data-collect-attunement ${automationOn && attunementSkills.length ? '' : 'disabled'} title="${automationOn ? 'Claim all Attunement loot' : 'Automation is disabled'}">Claim</button></div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/combat.png"><span><b>Guild event</b><small data-live-guild-event-detail>${escapeHtml(guildEventDetail(cache.guildEvent))}</small></span>${guildEventIndicator}</div>
            <div class="iw-status-row iw-status-link" data-route="/guild" role="link" tabindex="0"><img src="/assets/misc/quests.png"><span><b>Guild trials</b><small>${escapeHtml(cache.guildTrial?.stateDetail || humanAge(cache.guildTrial?.checkedAt))}</small></span><em class="${cache.guildTrial?.state === 'Active' ? 'active' : ['Available','Completed'].includes(cache.guildTrial?.state) ? 'complete' : ''}">${escapeHtml(cache.guildTrial?.state || 'Unknown')}</em></div>
          </div>
        </section>
        <section class="iw-card iw-potion-card">
          <div class="iw-card-header"><span>Divine Potions</span><small>${divinePotions.length} types</small></div>
          ${divinePotions.length ? `<div class="iw-data-table iw-potion-table">
            <div class="iw-table-head"><span>Potion</span><span>Equipped</span><span>Stored</span></div>
            ${divinePotions.map((item) => `<div class="iw-table-row">
              <div class="iw-table-item"><span class="iw-item-image"><img src="${escapeHtml(item.image)}" alt=""></span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number ${item.equipped ? '' : 'iw-zero'}">${formatNumber(item.equipped || 0)}</div>
              <div class="iw-table-number ${item.stored ? '' : 'iw-zero'}">${formatNumber(item.stored || 0)}</div>
            </div>`).join('')}
          </div>` : '<div class="iw-muted">No Divine Potions found.</div>'}
        </section>
        <section class="iw-card iw-automations-card">
          <div class="iw-card-header"><span>Automations</span><small>${refreshingAutomations ? 'Updating…' : humanAge(cache.automations?.checkedAt)}</small></div>
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
    const shortcut = document.querySelector('nav-component action-component button.button');
    if (shortcut) {
      shortcut.click();
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (document.querySelector('skill-page action-component > .card .bars .fill')) break;
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

  function captureVisibleAutomation() {
    const root = document.querySelector('home-page');
    const cards = [...(root?.querySelectorAll('.card') || [])];
    const structuresCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Structures');
    const row = structuresCard?.querySelector(':scope > button.row.active-link');
    const lootCard = cards.find((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Loot');
    if (!row || !lootCard) return;
    const structure = clean(row.querySelector(':scope > .name')?.textContent);
    const captureKey = `automations:${structure}`;
    if (Date.now() - (visibleCaptureTimes[captureKey] || 0) < 1500) return;
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
    const item = {
      structure,
      image: row.querySelector(':scope > .image img')?.getAttribute('src') || '/assets/misc/structure.png',
      making,
      makingImage: selectedAction?.querySelector('img')?.getAttribute('src') || '',
      lootName: clean(lootRow?.querySelector('.name')?.textContent),
      lootAmount,
      queuedDone,
      queuedTotal,
      intervalMs: durationMs(selectedAction?.querySelector('.interval')?.textContent) / (1 + Math.max(0, speedBonus)),
      outputPerAction: queuedDone > 0 ? lootAmount / queuedDone : 0
    };
    const previous = getCache().automations || {};
    const byStructure = new Map((previous.structures || []).map((entry) => [entry.structure, entry]));
    byStructure.set(structure, item);
    const structures = [...byStructure.values()];
    const longestRemaining = Math.max(0, ...structures.map((entry) => Math.max(0, entry.queuedTotal - entry.queuedDone) * entry.intervalMs));
    visibleCaptureTimes[captureKey] = Date.now();
    setCache('automations', { schema: 3, structures, expiresAt: Date.now() + (longestRemaining || TTL.automations) });
  }

  function captureVisibleCaches() {
    if (!page?.hidden || location.pathname === STATS_PATH) return;
    const path = location.pathname;
    const capture = (key, ready, fn) => {
      if (!ready || Date.now() - (visibleCaptureTimes[key] || 0) < 2000) return;
      visibleCaptureTimes[key] = Date.now();
      fn();
    };
    if (path === '/quests') capture('quests', document.querySelector('quests-page .card'), () => collectQuests(document));
    else if (path === '/inventory') capture('inventory', document.querySelector('inventory-page'), () => collectInventory(document));
    else if (path === '/equipment') capture('equipped', [...document.querySelectorAll('.card')].some((card) => clean(card.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'), () => storeEquippedDivine(divineConsumables(document), true));
    else if (path === '/adventure') captureVisibleAdventure();
    else if (path === '/challenges') capture('challenges', document.querySelector('challenges-page'), () => collectChallenges(document));
    else if (path === '/skill/15') capture('taming', document.querySelector('taming-page .row .name'), () => collectTaming(document));
    else if (path === '/attunement') capture('attunement', document.querySelector('attunement-page'), captureVisibleAttunement);
    else if (path.startsWith('/house')) captureVisibleAutomation();
    else if (path.startsWith('/guild')) {
      const headers = [...document.querySelectorAll('guild-page .card > .header > .name')].map((element) => clean(element.textContent));
      if (headers.includes('Events')) capture('guildEvent', true, () => collectGuildEvent(document));
      if (headers.some((name) => /^(Incomplete|Complete) Trials$/.test(name))) capture('guildTrial', true, () => collectGuildTrial(document));
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PAGE_ID}[hidden] { display:none !important; }
      #${PAGE_ID} { display:block; width:100%; color:#fff; font-family:Jost,"Helvetica Neue",Arial,sans-serif; font-size:16px; line-height:24px; }
      .iw-stats-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:stretch; gap:10px; }
      .iw-card { overflow:hidden; margin-bottom:10px; color:#fff; background:#0d2234; border-radius:4px; box-shadow:0 6px 12px -6px rgba(0,0,0,.4); }
      .iw-action-card, .iw-loot-card { height:100%; margin-bottom:0; }
      .iw-activity-card, .iw-potion-card { align-self:start; height:auto; margin-bottom:0; }
      .iw-potion-card { grid-column:1; }
      .iw-card-header { display:flex; align-items:center; justify-content:space-between; height:48px; padding:8px 10px; border-bottom:1px solid #294052; box-sizing:border-box; font-size:16px; font-weight:600; line-height:24px; }
      .iw-card-header small { color:#aab6bf; font-size:14px; font-weight:400; }
      .iw-live { display:flex; align-items:center; gap:7px; color:#31c777; font-size:12px; letter-spacing:.05em; }
      .iw-live i { width:8px; height:8px; border-radius:50%; background:#31c777; box-shadow:0 0 0 3px rgba(49,199,119,.15); }
      .iw-action-badges { display:flex; align-items:center; gap:6px; height:30px; }
      .iw-location-badge, .iw-active-badge { position:relative; display:block; width:34px; height:34px; overflow:hidden; border:1px solid; border-radius:5px; box-sizing:border-box; }
      .iw-location-badge img { position:absolute; top:50%; left:50%; display:block; width:24px; height:24px; object-fit:contain; transform:translate(-50%,-50%); }
      .iw-location-badge.outskirts { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-location-badge.village, .iw-active-badge { color:#78efa9; background:rgba(56,221,137,.08); border-color:#38dd89; box-shadow:inset 0 0 0 1px rgba(195,255,217,.04),0 0 7px rgba(42,220,130,.16); }
      .iw-active-badge .iw-spin { position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; }
      .iw-spin { display:block; width:18px; height:18px; overflow:visible; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      .iw-spin-track { opacity:.2; stroke-width:1.5; }
      .iw-spin-motion { transform-origin:12px 12px; will-change:transform; backface-visibility:hidden; animation:iw-spin 1.15s linear infinite; }
      @keyframes iw-spin { from { transform:translateZ(0) rotate(0deg); } to { transform:translateZ(0) rotate(360deg); } }
      .iw-action-body { display:grid; grid-template-columns:40px 1fr; align-items:center; gap:8px; min-height:54px; padding:6px; }
      .iw-action-image { display:grid; place-items:center; width:40px; height:40px; background:#0b2539; border:1px solid #203a4d; border-radius:4px; }
      .iw-action-image img { width:32px; height:32px; object-fit:contain; }
      .iw-action-name { display:flex; flex-direction:column; gap:2px; }
      .iw-action-name strong { font-size:16px; font-weight:400; }
      .iw-action-name span { color:#aab6bf; font-size:14px; }
      .iw-action-title { display:flex; align-items:baseline; gap:5px; }
      .iw-action-title strong { color:#fff; }
      .iw-action-title small { color:#8fa1ad; font-size:12px; font-weight:400; }
      .iw-action-meta { display:flex; align-items:center; flex-wrap:wrap; line-height:20px; }
      .iw-action-meta > span + span::before { content:'·'; margin:0 6px; color:#71818d; }
      .iw-progress { height:10px; margin:0 6px 6px; overflow:hidden; background:#142e40; border:1px solid rgba(117,157,181,.12); border-radius:999px; box-sizing:border-box; box-shadow:inset 0 1px 2px rgba(0,0,0,.28); }
      .iw-progress div { height:100%; background:linear-gradient(90deg,#4f9fce,#76c5ed); border-radius:inherit; box-shadow:0 0 5px rgba(103,187,231,.22); transition:width .2s linear; }
      .iw-progress-stack { display:grid; gap:4px; margin:1px 6px 7px; }
      .iw-progress-stack .iw-progress { margin:0; }
      .iw-skill-progress { background:#16342b; border-color:rgba(91,185,124,.13); }
      .iw-skill-progress div { background:linear-gradient(90deg,#429d62,#6bd28b); box-shadow:0 0 5px rgba(82,202,125,.2); }
      .iw-finished { display:flex; justify-content:space-between; padding:8px 12px; border-top:1px solid #263a49; }
      .iw-finished span, .iw-muted { color:#aab6bf; }
      .iw-subheader { padding:12px 10px; border-top:1px solid #294052; border-bottom:1px solid #294052; font-weight:600; }
      .iw-consumable { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; min-height:37px; padding:2px 6px; border-bottom:1px solid #294052; box-sizing:border-box; font-size:16px; line-height:24px; }
      .iw-consumable img { width:32px; height:32px; object-fit:contain; }
      .iw-consumable b { color:#aab6bf; font-size:16px; font-weight:400; line-height:24px; }
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
      .iw-task-icon.waiting { color:#ffc17f; background:rgba(255,145,61,.08); border-color:#ff913d; box-shadow:inset 0 0 0 1px rgba(255,205,156,.04),0 0 7px rgba(255,120,42,.16); }
      .iw-task-icon .iw-spin, .iw-task-icon.done svg, .iw-task-icon.waiting svg { position:absolute; top:50%; left:50%; display:block; width:15px; height:15px; margin:-7.5px 0 0 -7.5px; }
      .iw-task-icon.done svg, .iw-task-icon.waiting svg { fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
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
      }
    `;
    document.head.appendChild(style);
  }

  function initialise() {
    if (location.pathname === LEGACY_STATS_PATH) history.replaceState({ iwStatus: true }, '', STATS_PATH);
    addStyles();
    createPage();
    installNavButton();
    document.addEventListener('change', (event) => {
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
      if (event.target.closest?.('[data-collect-loot]')) { collectLootAndContinue(); return; }
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
    new MutationObserver(() => { installNavButton(); createPage(); captureVisibleCaches(); })
      .observe(document.body, { childList: true, subtree: true });
    if (location.pathname === STATS_PATH) showStatusFromCurrentAction();
    setTimeout(() => syncStale(false), 1200);
    setTimeout(captureVisibleCaches, 1500);
    window.setInterval(render, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
