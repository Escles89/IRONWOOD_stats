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
    if (!card || !quests.length) return { card, quests };
    const previous = getCache().quests;
    const next = { schema: 2, day: dayKey(), quests, completed, dailyComplete: completed >= 5, expiresAt: nextDailyReset() };
    setCache('quests', next);
    notifyQuestCompletion(previous, next);
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
  async function waitForQuestRows(doc, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const state = collectQuests(doc);
      if (state.quests.length) return state;
      await wait(200);
    }
    throw new Error('Daily quest rows did not load; will retry');
  }
  async function completeSelectedQuests(doc) {
    if (!automationEnabled()) return collectQuests(doc);
    const prefs = getPrefs();
    if (prefs.length !== 5) return collectQuests(doc);
    let state = await waitForQuestRows(doc);
    if (state.quests.filter((quest) => quest.done).length >= 5) return state;
    for (const preference of prefs) {
      const quest = questForPreference(state.quests, preference);
      if (!quest || quest.done) continue;
      const row = [...state.card.querySelectorAll(':scope > button.row')].find((item) => clean(item.querySelector('.name')?.textContent) === quest.id);
      if (!row || row.disabled) continue;
      const previousCompleted = state.quests.filter((item) => item.done).length;
      row.click();
      await wait(250);
      let autoComplete = [...doc.querySelectorAll('quests-page button')].find((button) =>
        !button.disabled && /auto[\s-]?complete/i.test(clean(button.textContent))
      );
      const controlStarted = Date.now();
      while (!autoComplete && Date.now() - controlStarted < 6000) {
        await wait(200);
        autoComplete = [...doc.querySelectorAll('quests-page button')].find(button =>
          !button.disabled && /auto[\s-]?complete/i.test(clean(button.textContent)));
      }
      if (!autoComplete) throw new Error(`Auto-complete unavailable for ${quest.skill || quest.name}`);
      autoComplete.click();
      state = await waitForQuestProgress(doc, previousCompleted);
      if (state.quests.filter((item) => item.done).length >= 5) break;
    }
    const selectedDone = prefs.filter((preference) => questForPreference(state.quests, preference)?.done).length;
    const completed = state.quests.filter((q) => q.done).length;
    setCache('quests', { schema: 2, day: dayKey(), quests: state.quests, completed, selectedDone, dailyComplete: completed >= 5, expiresAt: nextDailyReset() });
    return state;
  }

  function notifyQuestCompletion(previous, next) {
    // Loading an existing completed day, re-reading it, or resetting a day is not a completion.
    if (!previous || previous.schema !== 2 || previous.day !== next.day || !Number.isFinite(previous.completed)) return;
    const before = Math.min(5, previous.completed);
    const after = Math.min(5, next.completed);
    if (!(after > before)) return;
    const newlyDone = (next.quests || []).filter(quest => quest.done && !(previous.quests || []).some(old => old.id === quest.id && old.done));
    showActionToast({ icon: 'quests', title: after === 5 ? 'Daily quests complete' : 'Quest completed',
      summary: newlyDone.map(quest => quest.skill || quest.name).filter(Boolean).join(' · '),
      metrics: [{ icon: 'quests', label: 'Completed today', value: `${after}/5` }],
      detail: after === 5 ? 'All five daily quests are complete.' : `${after - before} new completion${after - before === 1 ? '' : 's'} confirmed by Ironwood.` });
  }
