  function actionToastIcon(name = 'complete') {
    if (name === 'xp') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 6 10M9 7 3 17M14 17V7h4a3 3 0 0 1 0 6h-4"></path></svg>';
    const images = { scroll: 'items/challenge-scroll.png', gold: 'misc/coin.png', challenges: 'misc/challenges.png', quests: 'misc/quests.png', taming: 'misc/taming.png', attunement: 'misc/attunement.png' };
    if (images[name]) return `<img src="/assets/${images[name]}" alt="" aria-hidden="true">`;
    const paths = name === 'cancel'
      ? '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"></path>'
      : name === 'warning' ? '<path d="M12 3 21 20H3L12 3Z"></path><path d="M12 9v5M12 17h.01"></path>'
        : '<path d="m5 12 4 4L19 6"></path>';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  }

  function actionToastMetricIcon(metric) {
    return /^\/assets\/(?:items|misc)\/[a-z0-9_-]+\.(?:png|webp|gif|svg)$/i.test(metric.image || '')
      ? `<img src="${escapeHtml(metric.image)}" alt="" aria-hidden="true">` : actionToastIcon(metric.icon);
  }

  function renderToastMetrics(metrics) {
    return metrics?.length ? `<dl class="iw-toast-metrics">${metrics.map(metric => `<div><dt><span class="iw-toast-metric-icon">${actionToastMetricIcon(metric)}</span>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value)}</dd></div>`).join('')}</dl>` : '';
  }

  function renderActionToast(toast) {
    return `<section class="iw-action-toast ${toast.kind}" data-toast-id="${toast.id}">
      <div class="iw-toast-heading"><span class="iw-toast-icon">${actionToastIcon(toast.icon || (toast.kind === 'success' ? 'complete' : 'warning'))}</span><div><strong>${escapeHtml(toast.title)}</strong>${toast.summary ? `<small>${escapeHtml(toast.summary)}</small>` : ''}</div><button type="button" data-toast-dismiss="${toast.id}" aria-label="Dismiss ${escapeHtml(toast.title)}">×</button></div>
      ${renderToastMetrics(toast.metrics)}
      ${(toast.groups || []).map(group => `<section class="iw-toast-category" aria-label="${escapeHtml(group.title)}"><header class="iw-toast-category-heading"><span class="iw-toast-skill-icon">${actionToastMetricIcon(group)}</span><div class="iw-toast-skill-heading"><h4>${escapeHtml(group.heading || group.title)}</h4>${group.region ? `<span class="iw-toast-region">${renderRegionIcon(group.region, true)}${escapeHtml(group.region)}</span>` : ''}</div>${group.xp !== undefined ? `<span class="iw-toast-xp" title="XP gained" aria-label="${escapeHtml(group.xp)} XP gained">${actionToastIcon('xp')}<b>${escapeHtml(group.xp)}</b></span>` : ''}</header><dl class="iw-toast-rewards">${(group.metrics || []).map(metric => `<div><dt><span class="iw-toast-metric-icon">${actionToastMetricIcon(metric)}</span>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value)}</dd></div>`).join('')}</dl></section>`).join('')}
      ${toast.detail ? `<p class="iw-toast-detail"><span class="iw-toast-metric-icon">${actionToastIcon(toast.kind === 'success' ? 'complete' : 'warning')}</span><span>${escapeHtml(toast.detail)}</span></p>` : ''}
      ${toast.warning ? `<p class="iw-toast-detail iw-toast-sync-warning"><span class="iw-toast-metric-icon">${actionToastIcon('warning')}</span><span>${escapeHtml(toast.warning)}</span></p>` : ''}
    </section>`;
  }

  function renderActionToasts() {
    if (!document.createElement || !document.body) return null;
    let host = document.querySelector('#iw-action-toasts');
    if (!AppState.ui.actionToasts.length) { host?.remove(); return null; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'iw-action-toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'false');
      host.setAttribute('aria-relevant', 'additions');
      host.setAttribute('aria-label', 'Action recaps');
      document.body.appendChild(host);
    }
    // Keep other toasts intact so their content is not announced or animated again.
    host.querySelectorAll('[data-toast-id]').forEach(element => {
      if (!AppState.ui.actionToasts.some(toast => String(toast.id) === element.dataset.toastId)) element.remove();
    });
    for (const toast of AppState.ui.actionToasts) {
      if (host.querySelector(`[data-toast-id="${toast.id}"]`)) continue;
      const template = document.createElement('template');
      template.innerHTML = renderActionToast(toast);
      host.appendChild(template.content.firstElementChild);
    }
    return host;
  }

  function dismissActionToast(id) {
    AppState.ui.actionToasts = AppState.ui.actionToasts.filter(toast => String(toast.id) !== String(id));
    renderActionToasts();
  }

  function showActionToast({ title, summary = '', detail = '', metrics = [], groups = [], kind = 'success', icon = '', warning = '' }) {
    const toast = { id: ++AppState.ui.toastSequence, title, summary, detail, metrics, groups, icon, warning, kind: ['success', 'warning', 'error'].includes(kind) ? kind : 'success' };
    AppState.ui.actionToasts = [...AppState.ui.actionToasts, toast].slice(-3);
    const host = renderActionToasts();
    // Failure recaps stay until dismissed. Success recaps allow enough reading
    // time, pausing dismissal while hovered, focused, or the document is hidden.
    if (host && toast.kind === 'success') {
      const expire = () => {
        const element = document.querySelector(`[data-toast-id="${toast.id}"]`);
        if (!element) return;
        if (document.hidden || element.matches(':hover, :focus-within')) { setTimeout(expire, 5000); return; }
        dismissActionToast(toast.id);
      };
      setTimeout(expire, 18000);
    }
    return toast;
  }

  function showChallengeRecap(run) {
    const count = value => Number.isFinite(value) ? formatNumber(value) : 'Unknown';
    return showActionToast({
      title: run.successful ? 'Challenge run complete' : 'Challenge run stopped',
      summary: `${run.region} · ${run.skill}`,
      kind: run.successful && !run.syncError ? 'success' : 'warning',
      icon: 'scroll',
      warning: run.syncError || '',
      metrics: [
        { label: 'Scrolls used', icon: 'scroll', value: count(run.scrollsUsed) },
        { label: 'Paid entries bought', icon: 'gold', value: count(run.purchased) },
        { label: 'Completed', icon: 'challenges', value: count(run.completed) },
        { label: 'Cancelled', icon: 'cancel', value: count(run.cancelled) },
        { label: 'Gold spent', icon: 'gold', value: count(run.goldSpent) },
        { label: 'Auto-completes left', icon: 'quests', value: count(run.autoCompletesRemaining) }
      ],
      detail: run.stopReason || 'All available challenges in this run were handled.'
    });
  }

  function showAttunementRecap(run) {
    const categories = run.categories || [];
    const count = value => Number.isFinite(value) ? formatNumber(value) : 'Unknown';
    return showActionToast({ icon: 'attunement', title: run.successful ? 'Attunement collected' : 'Attunement collection stopped',
      kind: !run.successful || run.syncError ? 'warning' : 'success',
      groups: categories.map(category => ({
        title: [category.region, category.skill || category.name].filter(Boolean).join(' · '),
        heading: category.skill || category.name, region: category.region, xp: count(category.xp),
        image: category.skill ? skillIcon(category.skill) : '', icon: 'attunement',
        metrics: [
          ...(category.shards > 0 || category.shards === null ? [{ icon: 'attunement', label: `${category.skill || 'Attunement'} shards`, value: count(category.shards) }] : []),
          ...(category.rewards?.length ? category.rewards.map(item => ({ image: item.image, icon: 'attunement', label: item.name, value: count(item.amount) }))
            : [{ icon: 'attunement', label: 'Item rewards', value: category.rewards ? 'None' : 'Unknown' }])
        ]
      })),
      detail: run.error || (run.collected ? '' : 'No Attunement XP was ready to collect.'),
      warning: [run.syncError, categories.some(category => category.xp === null || category.rewards === null || category.shards === null) ? 'Some reward details were unavailable. Missing values are marked Unknown.' : ''].filter(Boolean).join(' ')
    });
  }
