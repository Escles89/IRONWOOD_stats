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
