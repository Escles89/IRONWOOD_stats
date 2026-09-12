  function nextGuildEventName(eventName) {
    const order = ['Gathering', 'Crafting', 'Combat'];
    const index = order.findIndex((name) => new RegExp(name, 'i').test(eventName || ''));
    return index < 0 ? '' : order[(index + 1) % order.length];
  }
  function guildEventState(entry, now = Date.now()) {
    if (!entry || entry.schema !== 9) return 'Unknown';
    if (entry.state !== 'Cooldown' && Number.isFinite(entry.eventEndsAt) && entry.eventEndsAt <= now) return 'Unknown';
    if (entry.state === 'Participating' && Number.isFinite(entry.stateEndsAt) && entry.stateEndsAt <= now) {
      return entry.eventEndsAt > now ? 'Completed' : 'Unknown';
    }
    return entry.state || 'Unknown';
  }
  function guildEventDetail(entry) {
    const state = guildEventState(entry);
    if (state === 'Unknown') return 'Participation needs checking';
    if (state === 'Completed') {
      const remaining = Number(entry.eventEndsAt) - Date.now();
      return `${entry.eventName || 'Guild event'} · Contribution complete · ${formatNumber(entry.personalXp || 0)} XP${remaining > 0 ? ` · Event ends in ${formatDuration(remaining / 1000)}` : ''}`;
    }
    const remaining = Number(entry.state === 'Participating' ? entry.stateEndsAt : entry.expiresAt) - Date.now();
    const countdown = () => {
      return formatDuration(Math.max(0, remaining) / 1000);
    };
    if (entry.state === 'Cooldown') {
      const nextEvent = nextGuildEventName(entry.eventName);
      const detail = remaining > 0 ? `Cooldown · Ready in ${countdown()}` : 'Ready to start';
      return nextEvent ? `${detail} · Next: ${nextEvent}` : detail;
    }
    if (remaining > 0 && entry.state === 'Participating') return `${entry.eventName || 'Guild event'} · Participating · ${formatNumber(entry.personalXp || 0)} XP · ${countdown()} remaining`;
    if (entry.state === 'Participating') return entry.stateDetail || `${entry.eventName || 'Guild event'} · Participating · ${formatNumber(entry.personalXp || 0)} XP`;
    if (entry.state === 'Available') return 'Ready to start';
    return entry.stateDetail || humanAge(entry.checkedAt);
  }
  function guildEventStatusIcon(entry) {
    const states = {
      Available: ['event-available', 'Guild event ready to start'],
      Participating: ['participating', 'Participating in guild event'],
      Completed: ['done', 'Guild event contribution complete'],
      Cooldown: ['waiting', 'Guild event cooldown'],
      Unavailable: ['event-unavailable', 'No guild event available'],
      Unknown: ['event-unknown', 'Guild event not checked']
    };
    const observedState = guildEventState(entry);
    const state = Object.hasOwn(states, observedState) ? observedState : 'Unknown';
    const [className, label] = states[state];
    const path = state === 'Completed' ? 'M5 12.5l4 4L19 6.5' : 'M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5';
    return `<span class="iw-task-icon ${className}" data-guild-event-state="${state}" title="${label}" aria-label="${label}"><svg ${state === 'Participating' ? 'class="iw-hourglass"' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg></span>`;
  }
  function guildEventIncludesSkill(eventName, skillName) {
    if (!skillName) return false;
    const group = /gathering/i.test(eventName) ? GATHERING_SKILLS
      : /crafting/i.test(eventName) ? CRAFTING_SKILLS
      : /combat/i.test(eventName) ? COMBAT_SKILLS
      : null;
    return Boolean(group?.has(skillName));
  }
  function guildTrialState(entry, now = Date.now()) {
    if (!entry || entry.schema !== 5) return 'Unknown';
    if (Number.isFinite(entry.periodEndsAt) && entry.periodEndsAt <= now) return 'Unknown';
    if (entry.state === 'Active' && Number.isFinite(entry.stateEndsAt) && entry.stateEndsAt <= now) return 'ParticipationComplete';
    return entry.state || 'Unknown';
  }
  function guildTrialBonusActive(entry, skillName, now = Date.now()) {
    if (guildTrialState(entry, now) !== 'Active' || !skillName) return false;
    const trialSkill = clean(entry.activeName).replace(/\s+Trial$/i, '').toLowerCase();
    return Boolean(trialSkill && trialSkill === clean(skillName).toLowerCase());
  }
  function guildTrialDetail(entry, now = Date.now()) {
    const state = guildTrialState(entry, now);
    if (state === 'Unknown') return 'Open Guild → Trials to check participation';
    if (state === 'Active') {
      const remaining = Number(entry.stateEndsAt) - now;
      const timer = remaining > 0 ? `${entry.approximateTimer ? 'About ' : ''}${formatDuration(remaining / 1000)} remaining` : 'Time remaining unknown';
      return `${entry.activeName || 'Guild trial'} · ${timer}`;
    }
    if (state === 'Expired') return `${entry.activeName || 'Trial'} · Participation ended`;
    const remaining = Number(entry.periodEndsAt) - now;
    const reset = remaining > 0 ? ` · resets in ${formatDuration(remaining / 1000)}` : '';
    if (state === 'ParticipationComplete') return `Participation complete${reset}`;
    if (state === 'Completed') return `All ${entry.total || ''} guild trials completed${reset}`;
    if (state === 'Available') return `${entry.available} trials available${reset}`;
    return `No trial available${reset}`;
  }
  function guildTrialStatusIcon(entry) {
    const state = guildTrialState(entry);
    const states = {
      Active: ['participating', `${entry?.activeName || 'Guild trial'} in progress`],
      Available: ['done', 'Guild trials available to join'],
      Completed: ['done', 'Guild trials completed'],
      ParticipationComplete: ['done', 'Guild trial participation complete'],
      Unavailable: ['trial-unavailable', 'No guild trial available'],
      Expired: ['waiting', 'Guild trial participation ended'],
      Unknown: ['trial-unknown', 'Guild trial participation not checked']
    };
    const [className, label] = states[state] || states.Unknown;
    const path = state === 'Completed' || state === 'ParticipationComplete' || state === 'Available' ? 'M5 12.5l4 4L19 6.5' : 'M6 2h12M6 22h12M8 2v5l4 5-4 5v5M16 2v5l-4 5 4 5v5';
    return `<span class="iw-task-icon ${className}" data-guild-trial-state="${escapeHtml(state)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg ${state === 'Active' ? 'class="iw-hourglass"' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg></span>`;
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
    if (!root) return false;
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
    const ownRow = participantRows.find((row) => clean(row.querySelector(':scope > .name')?.textContent) === ownName);
    const personalXp = ownRow ? numberFrom(ownRow.querySelector(':scope > .amount')?.textContent) : null;
    const participationRemaining = clean(ownRow?.querySelector(':scope > .time')?.textContent);
    const cooldown = Boolean(cooldownRow && durationMs(cooldownText) > 0);
    if (cooldownRow && !cooldown) return false;
    const eventMenu = [...root.querySelectorAll('button.row')]
      .find(button => clean(button.querySelector(':scope > .name')?.textContent) === 'Events');
    const menuParticipation = durationMs(clean(eventMenu?.querySelector(':scope > .time')?.textContent)) > 0;
    const joinButton = [...(participantsCard?.querySelectorAll('button') || [])]
      .find(button => !button.disabled && /^(?:Participate|Join)(?:\s|$)/i.test(clean(button.textContent)));
    // Angular mounts the headings before the event/participant rows. Absence
    // from that partial list is not evidence that the player can join.
    if (!cooldown && (!eventCard || !participantsCard || !observedEventName || !ownName)) return false;
    if (!cooldown && !ownRow && (menuParticipation || !joinButton)) return false;
    const eventTimer = durationMs(eventRemainingText);
    const personalTimer = durationMs(participationRemaining);
    if (!cooldown && ownRow && (!eventTimer || !clean(ownRow.querySelector(':scope > .amount')?.textContent))) return false;
    // A present but unfinished timer is a partial mount, not completed participation.
    if (!cooldown && ownRow?.querySelector(':scope > .time') && !personalTimer) return false;
    const participating = !cooldown && Boolean(ownRow) && personalTimer > 0;
    const completed = !cooldown && Boolean(ownRow) && !ownRow.querySelector(':scope > .time');
    const timerText = cooldown ? cooldownText : participating ? participationRemaining : eventRemainingText;
    const timer = durationMs(timerText);
    const readableTimer = timer ? formatDuration(timer / 1000) : timerText;
    const expiresAt = participating || completed
      ? Date.now() + Math.min(timer || 3600000, 3600000)
      : Date.now() + (cooldown ? (timer || TTL.guildEvent) : Math.min(timer || 300000, 300000));
    setCache('guildEvent', {
      schema: 9,
      state: participating ? 'Participating' : completed ? 'Completed' : cooldown ? 'Cooldown' : 'Available', eventName,
      stateDetail: participating ? `${eventName} · Participating · ${formatNumber(personalXp || 0)} XP · ${readableTimer || 'In progress'}` : completed ? 'Contribution complete' : cooldown ? `Ready in ${readableTimer}` : 'Ready to participate',
      playerName: ownName || '', personalXp,
      eventXp: eventXpMatch ? numberFrom(eventXpMatch[1]) : null,
      eventXpGoal: eventXpMatch ? numberFrom(eventXpMatch[2]) : null,
      remaining: timerText, stateEndsAt: !completed && timer ? Date.now() + timer : null,
      eventEndsAt: !cooldown && eventTimer ? Date.now() + eventTimer : null, expiresAt
    });
    return true;
  }
  async function refreshGuildEventSnapshot(force = false) {
    return SyncCoordinator.refresh('guildEvent', { force, load: async () => {
      if (!playerName()) await withPage('/profile', 'profile-page profile-card-component .name', collectPlayerName);
      await withPage('/guild', 'guild-page', async doc => {
        const started = Date.now();
        let opened = false;
        while (Date.now() - started < 8000) {
          if (!opened) {
            const button = [...doc.querySelectorAll('guild-page button')]
              .find(element => clean(element.querySelector(':scope > .name')?.textContent) === 'Events');
            if (button) { button.click(); opened = true; }
          }
          if (opened && collectGuildEvent(doc)) return;
          await wait(200);
        }
        // Preserve the prior snapshot rather than caching a guessed state.
      });
    } });
  }
  function readGuildTrials(doc, ownName) {
    const root = doc.querySelector('guild-page');
    if (!root) return null;
    const cards = [...root.querySelectorAll('.card')];
    const heading = card => clean(card.querySelector(':scope > .header > .name')?.textContent);
    const summary = cards.find(card => heading(card) === 'Trials');
    const trialCards = cards.filter(card => /^(Incomplete|Complete) Trials$/.test(heading(card)));
    if (!summary || trialCards.length !== 2) return null;
    const summaryRows = [...summary.querySelectorAll(':scope > .row')];
    const summaryRow = name => summaryRows.find(row => clean(row.querySelector('.name')?.textContent) === name);
    const completedMatch = clean(summaryRow('Trials Completed')?.querySelector('.amount')?.textContent).match(/(\d+)\s*\/\s*(\d+)/);
    if (!completedMatch) return null;
    const endText = clean(summaryRow('End Date')?.querySelector('.date')?.textContent);
    const trials = [];
    for (const card of trialCards) {
      let trial = null;
      for (const row of card.querySelectorAll(':scope > .row')) {
        const name = clean(row.querySelector(':scope > .name')?.textContent);
        if (/ Trial$/.test(name) && !row.classList.contains('row-dark')) {
          trial = { name, complete: heading(card) === 'Complete Trials', joinable: row.tagName === 'BUTTON' && !row.disabled, participants: [] };
          trials.push(trial);
        } else if (trial && row.classList.contains('row-dark')) {
          const time = row.querySelector(':scope > .time');
          trial.participants.push({ name, remaining: clean(time?.textContent), completed: !time });
        }
      }
    }
    const completed = Number(completedMatch[1]);
    const total = Number(completedMatch[2]);
    // Headings mount before their data. Do not overwrite a good snapshot with that loading state.
    if (trials.length !== total) return null;
    const activeTrial = ownName ? trials.find(trial => trial.participants.some(person => person.name === ownName && durationMs(person.remaining) > 0)) : null;
    const completedParticipation = ownName && trials.some(trial => trial.participants.some(person => person.name === ownName && person.completed));
    if (ownName && trials.some(trial => trial.participants.some(person => person.name === ownName && !person.completed && !person.remaining))) return null;
    const ownParticipation = activeTrial?.participants.find(person => person.name === ownName && durationMs(person.remaining) > 0);
    return { completed, total, endText, completedParticipation: Boolean(completedParticipation), available: trials.filter(trial => !trial.complete && trial.joinable).length,
      activeName: activeTrial?.name || '', remaining: ownParticipation?.remaining || '', identityKnown: Boolean(ownName) };
  }
  function collectGuildTrial(doc) {
    const data = readGuildTrials(doc, playerName());
    if (!data) return null;
    const now = Date.now();
    const previous = getCache().guildTrial;
    const timer = durationMs(data.remaining);
    const periodTimer = durationMs(data.endText);
    const sameParticipation = previous?.schema === 5 && previous.activeName === data.activeName && previous.remaining === data.remaining && previous.stateEndsAt > now;
    const stateEndsAt = timer ? (sameParticipation ? previous.stateEndsAt : now + timer) : null;
    const state = !data.identityKnown ? 'Unknown' : timer ? 'Active' : data.completedParticipation ? 'ParticipationComplete' : data.total > 0 && data.completed >= data.total ? 'Completed' : data.available ? 'Available' : 'Unavailable';
    const periodEndsAt = periodTimer ? now + periodTimer : null;
    // Refresh active participation hourly, independently of the guild-wide trial period.
    const refreshAt = Math.min(stateEndsAt || Infinity, periodEndsAt || Infinity, now + (state === 'Active' || state === 'Unknown' ? 3600000 : TTL.guildTrial));
    const record = { schema: 5, state, activeName: data.activeName, remaining: data.remaining,
      approximateTimer: Boolean(timer && !/\d\s*[ms]/i.test(data.remaining)),
      completed: data.completed, total: data.total, available: data.available,
      stateEndsAt, periodEndsAt, refreshAt, expiresAt: refreshAt };
    setCache('guildTrial', record);
    return record;
  }
  async function loadGuildTrials(doc) {
    const started = Date.now();
    let button;
    while (Date.now() - started < 8000 && !button) {
      button = [...doc.querySelectorAll('guild-page button')].find(element => clean(element.querySelector(':scope > .name')?.textContent) === 'Trials');
      if (!button) await wait(100);
    }
    if (!button) throw new Error('Guild Trials menu did not load');
    button.click();
    const captureStarted = Date.now();
    while (Date.now() - captureStarted < 8000) {
      const record = collectGuildTrial(doc);
      if (record) return record;
      await wait(100);
    }
    throw new Error('Guild Trials data did not finish loading');
  }
  async function refreshGuildTrialSnapshot(force = false) {
    try {
      return await SyncCoordinator.refresh('guildTrial', { force, load: async () => {
        if (!playerName()) await withPage('/profile', 'profile-page profile-card-component .column > .name', collectPlayerName);
        await withPage('/guild', 'guild-page', loadGuildTrials);
      } });
    } catch (error) { console.error('[Ironwood Status] Guild Trials refresh failed', error); }
  }
