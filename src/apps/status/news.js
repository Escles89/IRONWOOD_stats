  const newsTicker = { line: '', template: '', category: '', source: '', skill: null, nextAt: 0, duration: 14000, pauseRemaining: null, rareAt: -Infinity, paused: false, events: [], bags: {}, recent: [], level: null, lootKey: '', loot: null };
  function personalizeNewsLine(template, values = {}) {
    let name = '';
    try { name = playerName(); } catch (_) { /* No identity lookup is needed. */ }
    const fields = { ...values, player: name || 'Our local hero' };
    return template.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(fields, key) ? String(fields[key]) : token);
  }
  function newsMasteryValues() {
    const mastery = getCache().mastery;
    if (mastery?.schema !== 1 || !Array.isArray(mastery.completeSkills)) return null;
    const mastered = new Set(mastery.completeSkills).size;
    const total = Number.isSafeInteger(mastery.totalSkills) && mastery.totalSkills >= mastered && mastery.totalSkills > 0 ? mastery.totalSkills : null;
    return { mastered, ...(total === null ? {} : { total, remaining: total - mastered }) };
  }
  function newsContext(action) {
    const player = action?.combatants?.find(fighter => fighter.side === 'player');
    return { skill: action?.skillName || '', enemy: action?.name || 'the opposition',
      hp: Number.isFinite(player?.hpPercent) ? Math.round(player.hpPercent) : null,
      ...newsMasteryValues() };
  }
  function newsCandidates(action) {
    const categories = ['general', 'geek', 'sci_fi', 'pop_culture', 'idler', 'league_of_legends', 'diablo', 'rollercoaster_tycoon', 'cookie_clicker', 'runescape'];
    if (!action) categories.push('idle');
    if (action?.isCombat) categories.push('combat');
    if (Object.hasOwn(NEWS_LINES, action?.skillName || '')) categories.push(action.skillName);
    const mastery = newsMasteryValues();
    if (mastery) categories.push('mastery_count');
    if (mastery?.remaining > 0) categories.push('mastery_remaining');
    if (mastery?.remaining === 0) categories.push('mastery_all');
    return categories;
  }
  function chooseNewsCategory(action, now, random = Math.random) {
    if (now - newsTicker.rareAt >= 600000 && random() < .01) { newsTicker.rareAt = now; return 'rare'; }
    if (action?.isCombat && random() < .6) {
      if (action.reviveRemainingMs > 0) return 'combat_reviving';
      const hp = newsContext(action).hp;
      return hp !== null && hp <= 25 ? 'combat_danger' : 'combat_live';
    }
    if (action?.skillName && NEWS_LINES[action.skillName] && random() < .4) return action.skillName;
    const categories = newsCandidates(action);
    return categories[Math.floor(random() * categories.length)];
  }
  function queueNewsEvent(category, values, now) {
    newsTicker.events = newsTicker.events.filter(event => event.until > now);
    if (newsTicker.events.length < 8) newsTicker.events.push({ category, values, until: now + 60000 });
  }
  function observeNewsEvents(action, loot, lootReady, now = Date.now()) {
    // Establish baselines first. Opening a page is not a level-up or a drop.
    if (!action) { newsTicker.level = null; newsTicker.loot = null; newsTicker.lootKey = ''; return; }
    if (action.nativeRebuilding) return;
    const skill = action.skillName;
    const level = Number(action.skillLevel);
    if (skill && Number.isSafeInteger(level) && level > 0) {
      if (newsTicker.level?.skill === skill && level > newsTicker.level.level) queueNewsEvent('level_up', { skill, level }, now);
      newsTicker.level = { skill, level };
    }
    const key = `${skill}:${action.actionId || action.name}`;
    if (key !== newsTicker.lootKey) { newsTicker.lootKey = key; newsTicker.loot = null; }
    if (!lootReady) return;
    const previous = newsTicker.loot;
    const current = new Map();
    for (const item of loot) {
      const id = item.image || item.name;
      const exact = !quantityIsApproximate(item) && Number.isFinite(item.amount) && item.amount >= 0;
      current.set(id, exact ? item.amount : null);
      const before = previous?.has(id) ? previous.get(id) : 0;
      if (previous && exact && before !== null && item.amount > before && isHighValueDrop(item)) {
        queueNewsEvent('special_loot', { item: item.name, amount: formatNumber(item.amount - before) }, now);
      }
    }
    newsTicker.loot = current;
  }
  function nextNewsTemplate(category, random = Math.random) {
    if (!newsTicker.bags[category]?.length) newsTicker.bags[category] = [...NEWS_LINES[category]];
    const bag = newsTicker.bags[category];
    let candidates = bag.filter(line => !newsTicker.recent.includes(line) && line !== newsTicker.template);
    if (!candidates.length) {
      // A small frequently selected category can fill the recent history.
      // Prefer its least recently shown remaining line without skipping its cycle.
      const eligible = bag.filter(line => line !== newsTicker.template);
      const oldest = Math.min(...eligible.map(line => newsTicker.recent.indexOf(line)));
      candidates = eligible.filter(line => newsTicker.recent.indexOf(line) === oldest);
    }
    const line = candidates[Math.floor(random() * candidates.length)] || bag[0];
    bag.splice(bag.indexOf(line), 1);
    newsTicker.recent = [...newsTicker.recent.filter(value => value !== line), line].slice(-40);
    return line;
  }
  function selectNewsLine(action, now = Date.now()) {
    const skill = action ? `${action.skillName || ''}:${Boolean(action.isCombat)}:${action.isCombat ? action.name || '' : ''}:${action.reviveRemainingMs > 0}` : 'idle';
    if (newsTicker.line && (newsTicker.paused || (newsTicker.skill === skill && now < newsTicker.nextAt))) return newsTicker;
    newsTicker.events = newsTicker.events.filter(event => event.until > now);
    const event = newsTicker.events.shift();
    const category = event?.category || chooseNewsCategory(action, now);
    newsTicker.template = nextNewsTemplate(category);
    newsTicker.line = personalizeNewsLine(newsTicker.template, event?.values || newsContext(action));
    newsTicker.category = category;
    const sources = NEWS_LINES._sources.filter(source => source !== newsTicker.source);
    newsTicker.source = sources[Math.floor(Math.random() * sources.length)] || NEWS_LINES._sources[0];
    newsTicker.skill = skill;
    newsTicker.duration = Math.max(14000, newsTicker.line.length * 110);
    newsTicker.nextAt = now + newsTicker.duration;
    return newsTicker;
  }
  function newsCategoryLabel(category) {
    return ({ general:'Village', idle:'Off duty', combat:'Combat', league_of_legends:'League desk', diablo:'Sanctuary', rollercoaster_tycoon:'Park management', cookie_clicker:'Cookie economy', runescape:'Gielinor gossip', geek:'Geek desk', sci_fi:'Outer rim', pop_culture:'Culture', idler:'Idle life', rare:'Rare dispatch', combat_live:'LIVE', combat_danger:'LIVE · Low health', combat_reviving:'LIVE · Recovery', mastery_count:'Mastery', mastery_remaining:'Mastery', mastery_all:'Mastered', level_up:'Level up', special_loot:'Loot report' })[category] || category;
  }
  const NEWS_OUTLET_ICONS = {
    paper: 'M4 4h16v16H4zM7 7h4v4H7zM14 7h3M14 10h3M7 14h10M7 17h10',
    hourglass: 'M6 3h12M6 21h12M8 3v5l8 8v5M16 3v5l-8 8v5M10 17h4',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 11l3 3 5-6',
    gear: 'M9 3h6v4l3 2 3-1v8l-3-1-3 2v4H9v-4l-3-2-3 1V8l3 1 3-2zM9 12h6',
    coins: 'M4 7c0-4 12-4 12 0s-12 4-12 0v5c0 4 12 4 12 0V7M8 16v2c0 4 12 4 12 0v-7M17 9l3 2-3 2',
    tree: 'M12 2 5 10h4l-5 7h7v5h2v-5h7l-5-7h4z',
    mug: 'M4 6h12v13H4zM16 8h4v7h-4M7 3v1M11 3v1',
    radio: 'M4 8h16v12H4zM6 8l11-5M7 12h3v4H7zM14 12h3M14 16h3',
    flask: 'M9 3h6M10 3v6L4 19l1 2h14l1-2-6-10V3M7 15h10M10 18h1',
    anvil: 'M3 6h18l-4 5h-3v6h4v3H6v-3h4v-6H6z',
    spark: 'M13 2 5 13h6l-1 9 9-13h-6z',
    camera: 'M3 7h5l2-3h4l2 3h5v13H3zM8 13a4 4 0 1 0 8 0 4 4 0 1 0-8 0M18 10h.01',
    forum: 'M3 4h15v11H9l-5 4v-4H3zM18 9h3v12l-4-3h-5M7 8h7M7 11h4',
    book: 'M12 6C8 3 4 4 2 5v15c4-2 7-1 10 1 3-2 6-3 10-1V5c-2-1-6-2-10 1v15',
    bird: 'M3 17c6 1 7-4 7-8 0-5 7-5 7-1l4-1-3 4c-1 8-7 11-15 6z',
    rune: 'M12 2 4 7v10l8 5 8-5V7zM9 7l6 5-6 5V7M9 12h6',
    play: 'M8 5l11 7-11 7Z',
    moon: 'M18 4a9 9 0 1 0 2 15A9 9 0 0 1 18 4zM5 5h2M6 4v2',
    chat: 'M3 4h18v13H9l-5 4v-4H3zM7 10h.01M12 10h.01M17 10h.01',
    music: 'M9 18V5l11-2v13M9 8l11-2M3 18c0-4 6-4 6 0s-6 4-6 0M14 16c0-4 6-4 6 0s-6 4-6 0'
  };
  const NEWS_BRAND_SHAPES = {
    crest: 'M3 2h18v13l-9 7-9-7Z',
    seal: 'm12 1 3 2 4 1 1 4 3 4-3 3-1 5-4 1-3 2-3-2-4-1-1-5-3-3 3-4 1-4 4-1Z',
    shield: 'M12 1 2 5v8c0 5 10 10 10 10s10-5 10-10V5Z',
    cut: 'M5 1h18v17l-5 5H1V5Z',
    ticket: 'M2 3h20v6c-4 0-4 6 0 6v6H2v-6c4 0 4-6 0-6Z',
    leaf: 'M22 2v10C22 24 2 26 2 13 2 2 12 2 22 2Z',
    disc: 'M12 1a11 11 0 1 1 0 22 11 11 0 1 1 0-22Z',
    orb: 'M12 1C27 1 24 23 12 23S-3 1 12 1Z',
    rounded: 'M7 1h10q6 0 6 6v10q0 6-6 6H7q-6 0-6-6V7q0-6 6-6Z',
    bubble: 'M7 1h10q6 0 6 6v9q0 5-6 5h-5l-6 3v-3q-5 0-5-5V7q0-6 6-6Z',
    tab: 'M2 1h20v22l-10-4-10 4Z',
    wing: 'M1 5 23 1l-5 19-7 3-5-8Z',
    hex: 'M12 0 23 6v12l-11 6L1 18V6Z',
    screen: 'M5 3h14q5 0 5 5v8q0 5-5 5H5q-5 0-5-5V8q0-5 5-5Z'
  };
  function renderNewsOutlet(source) {
    const outlet = NEWS_OUTLETS[source] || { name: source || 'Ironwood Dispatch', icon: 'paper' };
    const color = /^#[0-9a-f]{6}$/i.test(outlet.color) ? outlet.color : '#8bc8d6';
    const secondary = /^#[0-9a-f]{6}$/i.test(outlet.secondary) ? outlet.secondary : '#294e54';
    const family = ['press','industrial','wire','radio','social','arcane','forum','bard'].includes(outlet.family) ? outlet.family : 'press';
    const path = NEWS_OUTLET_ICONS[outlet.icon] || NEWS_OUTLET_ICONS.paper;
    const shape = NEWS_BRAND_SHAPES[outlet.shape] || NEWS_BRAND_SHAPES.crest;
    return `<span class="iw-news-lockup iw-brand-${family} iw-brand-mark-${escapeHtml(outlet.icon || 'paper')}" style="--iw-outlet-color:${color};--iw-outlet-secondary:${secondary}"><span class="iw-news-outlet-icon"><svg viewBox="-2 -2 28 28" aria-hidden="true"><path class="iw-brand-field" d="${shape}"></path><path class="iw-brand-shine" d="M4 5h6M4 8h3"></path><path class="iw-brand-glyph" transform="translate(4 4) scale(.67)" d="${path}"></path></svg></span><span class="iw-news-outlet-name">${escapeHtml(outlet.name)}</span></span>`;
  }
  function newsAccent(source) {
    const color = NEWS_OUTLETS[source]?.color;
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#8bc8d6';
  }
  function newsRemainingFraction(now = Date.now()) {
    const remaining = newsTicker.paused ? newsTicker.pauseRemaining ?? newsTicker.duration : newsTicker.nextAt - now;
    return Math.max(0, Math.min(1, remaining / newsTicker.duration));
  }
  function toggleNewsPause(now = Date.now()) {
    if (newsTicker.paused) newsTicker.nextAt = now + (newsTicker.pauseRemaining ?? newsTicker.duration);
    else newsTicker.pauseRemaining = Math.max(0, newsTicker.nextAt - now);
    newsTicker.paused = !newsTicker.paused;
    updateNewsTicker(AppState.live.action);
  }
  function newsPauseIcon(paused) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paused ? 'm9 5 10 7-10 7Z' : 'M8 5v14M16 5v14'}"></path></svg>`;
  }
  function renderNewsTicker(action) {
    const news = selectNewsLine(action);
    return `<aside class="iw-news-ticker" style="--iw-news-accent:${newsAccent(news.source)};--iw-news-remaining:${newsRemainingFraction()}" data-paused="${news.paused}" aria-label="The Ironwood Dispatch — fictional village headlines">
      <div class="iw-news-brand" data-news-source="${escapeHtml(news.source)}" title="${escapeHtml(news.source)}">${renderNewsOutlet(news.source)}</div>
      <div class="iw-news-copy"><span class="iw-news-category">${escapeHtml(newsCategoryLabel(news.category))}</span><span class="iw-news-line">${escapeHtml(news.line)}</span></div>
      <button type="button" class="iw-news-pause" data-news-pause aria-label="${news.paused ? 'Resume' : 'Pause'} news ticker" aria-pressed="${news.paused}">${newsPauseIcon(news.paused)}</button>
    </aside>`;
  }
  function updateNewsTicker(action) {
    const host = AppState.ui.page?.querySelector('.iw-news-ticker');
    if (!host) return;
    const news = selectNewsLine(action);
    host.style.setProperty('--iw-news-remaining', String(newsRemainingFraction()));
    if (host.dataset.paused !== String(news.paused)) host.dataset.paused = String(news.paused);
    const line = host.querySelector('.iw-news-line');
    if (line && line.textContent !== news.line) {
      line.textContent = news.line;
      host.querySelector('.iw-news-category').textContent = newsCategoryLabel(news.category);
      if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        line.getAnimations?.().forEach(animation => animation.cancel());
        line.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 550, easing: 'ease-out' });
      }
    }
    const brand = host.querySelector('.iw-news-brand');
    if (brand && brand.dataset.newsSource !== news.source) {
      brand.innerHTML = renderNewsOutlet(news.source);
      brand.dataset.newsSource = news.source;
      brand.title = news.source;
      host.style.setProperty('--iw-news-accent', newsAccent(news.source));
    }
    const button = host.querySelector('[data-news-pause]');
    const label = `${news.paused ? 'Resume' : 'Pause'} news ticker`;
    if (button && button.getAttribute('aria-label') !== label) {
      button.innerHTML = newsPauseIcon(news.paused);
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(news.paused));
    }
  }
