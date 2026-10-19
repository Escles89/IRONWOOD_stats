  const SKILL_RANKS_KEY = 'iw-status-skill-ranks-v1:';
  const SKILL_RANKS_TTL = 60 * 60 * 1000;
  const SKILL_RANKS_RETRY = 5 * 60 * 1000;

  function skillRanksRead(owner) {
    try {
      const saved = JSON.parse(localStorage.getItem(SKILL_RANKS_KEY + owner));
      if (saved?.version !== 1 || !Number.isFinite(saved.observedAt) || saved.observedAt < 0 || saved.observedAt > Date.now()
        || !saved.ranks || !QUICK_SKILL_ORDER.every(id => Object.hasOwn(saved.ranks, id)
          && (saved.ranks[id] === null || Number.isSafeInteger(saved.ranks[id]) && saved.ranks[id] > 0))) return null;
      return saved;
    } catch { return null; }
  }

  function skillRanksSnapshot(board, name) {
    if (!board?.skills || !QUICK_SKILL_ORDER.every(id => Array.isArray(board.skills[id]))) return null;
    const ranks = {};
    for (const id of QUICK_SKILL_ORDER) {
      const rows = board.skills[id], index = rows.findIndex(row => row?.name === name);
      const rank = index < 0 ? null : rows[index].rank || index + 1;
      if (rank !== null && (!Number.isSafeInteger(rank) || rank < 1)) return null;
      ranks[id] = rank;
    }
    return { version: 1, observedAt: Date.now(), ranks };
  }

  function skillRanksState(runtime) {
    const owner = quickOwner(runtime), ui = AppState.ui.quickSkills;
    if (!ui.leaderboards || ui.leaderboards.owner !== owner) {
      ui.leaderboards = { owner, snapshot: owner ? skillRanksRead(owner) : null, pending: false, retryAt: 0, failed: false };
    }
    return ui.leaderboards;
  }

  function requestSkillLeaderboards(runtime, mode) {
    return new Promise((resolve, reject) => {
      let finished = false, subscription;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        subscription?.unsubscribe();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Leaderboard request timed out')), 15000);
      Promise.resolve().then(() => runtime.firebase.getLeaderboards(mode)).then(response => {
        if (finished) return;
        if (typeof response?.subscribe !== 'function') throw new Error('Leaderboard response unavailable');
        subscription = response.subscribe({ next: value => finish(null, value), error: error => finish(error),
          complete: () => finish(new Error('Leaderboard response empty')) });
        if (finished) subscription?.unsubscribe();
      }).catch(error => finish(error));
    });
  }

  async function refreshSkillRanks(runtime) {
    const state = skillRanksState(runtime), now = Date.now();
    if (!state.owner || state.pending || document.hidden || quickBusy()
      || now < state.retryAt || state.snapshot && now - state.snapshot.observedAt < SKILL_RANKS_TTL) return;
    const mode = runtime.state.isSolo ? '2' : '1';
    const native = runtime.state.leaderboards?.[mode];
    // Reuse the game's unexpired board before requesting another copy.
    const cached = Date.parse(native?.expiresAt) > now ? skillRanksSnapshot(native, runtime.state.user.displayName) : null;
    if (!cached && typeof runtime.firebase?.getLeaderboards !== 'function') return;
    state.pending = true;
    state.failed = false;
    try {
      const snapshot = cached || skillRanksSnapshot(await requestSkillLeaderboards(runtime, mode), JSON.parse(state.owner)[0]);
      if (quickOwner(quickRuntime()) !== state.owner || AppState.ui.quickSkills.leaderboards !== state) return;
      if (!snapshot) throw new Error('Leaderboard data unavailable');
      state.snapshot = snapshot;
      try { localStorage.setItem(SKILL_RANKS_KEY + state.owner, JSON.stringify(snapshot)); } catch {}
    } catch {
      state.failed = true;
      state.retryAt = Date.now() + SKILL_RANKS_RETRY;
    } finally {
      state.pending = false;
    }
  }

  function renderSkillRank(skill, runtime) {
    const state = skillRanksState(runtime), snapshot = state.snapshot;
    const rank = snapshot?.ranks[skill.id];
    const stale = snapshot && Date.now() - snapshot.observedAt >= SKILL_RANKS_TTL;
    const label = rank ? `Rank #${rank.toLocaleString('en-US')}` : snapshot ? 'Unranked' : 'Rank —';
    const detail = snapshot ? `Leaderboard rank · ${runtime.state.isSolo ? 'Solo' : 'Multiplayer'} · checked ${new Date(snapshot.observedAt).toLocaleString()}${stale ? ' · last known rank; refresh pending' : ''}`
      : state.pending ? 'Loading leaderboard ranks' : 'Leaderboard rank unavailable';
    return `<span class="iw-quick-rank" title="${escapeHtml(detail)}" aria-label="${escapeHtml(`${skill.name}: ${label}${stale ? ' (cached)' : ''}`)}"><img src="/assets/misc/leaderboards.png" alt=""><span>${rank ? `#${rank.toLocaleString('en-US')}` : snapshot ? 'Unranked' : '—'}</span>${stale ? '<span class="iw-quick-rank-cached">cached</span>' : ''}</span>`;
  }

  function renderSkillRanksNote(runtime) {
    const state = skillRanksState(runtime);
    const status = state.failed ? state.snapshot ? 'Showing last known ranks; refresh will retry later.' : 'Ranks unavailable; refresh will retry later.'
      : state.pending ? 'Updating leaderboard ranks…' : 'Leaderboard ranks refresh hourly while Skills is open.';
    return `<p class="iw-quick-ranks-note">${status}</p>`;
  }
